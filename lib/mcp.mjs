// One place to call the ESPN MCP from a script, with a bounded retry and an
// error message somebody can actually act on.
//
// WHY THIS EXISTS. Eight files in this kit had each hand-rolled the same spawn
// of tools/mcp-call.mjs, and each had its own idea of what to say when the call
// came back empty. The most common version threw this:
//
//     Error: get_free_agents: no JSON.
//
// and nothing else. Not the exit code, not a line of stderr, not the bytes that
// did come back. One read out of the forty a single tool makes can drop, and
// when it does, that message cannot tell you whether ESPN is down, your cookie
// has expired, the tool name is misspelt, or a packet went missing and the same
// command would work fine ten seconds later. Those four need four different
// responses, and the one thing you have to work from names none of them.
//
// A retry matters here beyond convenience: a single blip takes down the whole
// run of a tool that makes dozens of reads, and anything gating on that tool
// (a test suite, a pre-commit check, a scheduled pass) fails with it.
//
// WHAT IT DOES NOT DO, deliberately:
//
//   It does not swallow anything. After the last attempt it still throws. This
//   matters more than it looks: a failed get_free_agents that returns an empty
//   list instead of throwing becomes a replacement level of ZERO, which prices
//   every player at that position at his entire projection, and nothing about
//   the output looks wrong. A retry that eventually gives up loudly keeps the
//   loud failure; a catch would quietly delete it.
//
//   It does not retry an authentication failure. A 401 means your ESPN cookies
//   need refreshing, which no number of attempts will do. Retrying only delays
//   that message by the length of the backoff.
//
//   It does not retry a well-formed answer it happens to dislike. Only output
//   with no JSON in it at all counts as a blip. An error object IS an answer,
//   and asking twice will not change it.

import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const CALLER = path.join(REPO, "tools/mcp-call.mjs");

// Three tries covers a single dropped read without turning a genuine outage
// into a minutes-long hang: with the backoff below the worst case for a
// reachable-but-flaky server is about 4.5 seconds per call.
const ATTEMPTS = 3;
const BACKOFF_MS = [1500, 3000];

// Per attempt. Without one, a hung spawn blocks the calling script forever, and
// a retry loop with no timeout hangs three times rather than once.
const TIMEOUT_MS = 120000;

// spawnSync is synchronous, so the wait has to be too. Atomics.wait on a
// throwaway buffer blocks this thread without a busy loop.
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// An auth failure is a state of the world, not a bad roll of the dice.
const isAuthFailure = (text) => /\b401\b|unauthor|not logged in|invalid cookie|ESPN_S2/i.test(text);

// A JSON-RPC error is the server having understood the request and rejected it:
// a misspelled tool name, a parameter the schema will not take. Deterministic,
// so asking again just spends the backoff to be told the same thing.
const isProtocolError = (text) => /MCP error -3\d{4}/.test(text);

/**
 * Call one MCP tool and return its raw JSON text.
 * @param {string} tool     e.g. "get_free_agents"
 * @param {object} args     the tool's arguments, passed through verbatim
 * @param {{attempts?: number, label?: string, timeoutMs?: number}} [opts]
 * @returns {string} the raw JSON text, exactly the bytes the server sent
 * @throws if every attempt failed to produce JSON. The message names each one.
 */
export function mcpText(tool, args, opts = {}) {
  const attempts = opts.attempts ?? ATTEMPTS;
  const label = opts.label ? ` (${opts.label})` : "";
  const tried = [];

  for (let i = 0; i < attempts; i++) {
    const r = spawnSync(process.execPath, [CALLER, tool, JSON.stringify(args)], {
      cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: opts.timeoutMs ?? TIMEOUT_MS,
    });

    let out = r.stdout || "";
    // mcp-call truncates long responses and says so; everything after the note
    // is prose, not JSON, so it has to come off before the brace hunt.
    const note = out.indexOf("-- Response truncated");
    if (note >= 0) out = out.slice(0, note);

    // Find where the JSON BEGINS, not just where it ends: slicing from index 0
    // hands JSON.parse any preamble the caller happened to print first.
    const iBrace = out.indexOf("{"), iBrack = out.indexOf("[");
    const start = iBrace < 0 ? iBrack : (iBrack < 0 ? iBrace : Math.min(iBrace, iBrack));
    const end = Math.max(out.lastIndexOf("]"), out.lastIndexOf("}"));

    if (start >= 0 && end > start) return out.slice(start, end + 1);

    const stderr = String(r.stderr || "").trim();
    // PRINT WHATEVER CAME BACK, from whichever stream has it. Reporting that a
    // payload exists without printing it is the same failure as `no JSON.` with
    // an empty string, only more verbose about it.
    const said = stderr || out.trim();
    // r.error is where a timeout actually shows up (ETIMEDOUT, with SIGTERM on
    // the signal): both streams can be empty in that case.
    const killed = r.error ? `, spawn error ${r.error.code || r.error.message}` : "";
    tried.push(`attempt ${i + 1}: exit ${r.status}${r.signal ? ` signal ${r.signal}` : ""}${killed}, ` +
      (said ? `${stderr ? "stderr" : "stdout"}: ${said.replace(/\s+/g, " ").slice(0, 300)}`
            : "and said nothing at all on either stream"));

    if (isAuthFailure(stderr + out)) {
      throw new Error(`${tool}${label}: ESPN is not authenticated, which no retry fixes.\n  ${tried.join("\n  ")}\n` +
        `  Log in to ESPN and refresh ESPN_S2 and SWID in your .env.`);
    }
    if (isProtocolError(stderr + out)) {
      throw new Error(`${tool}${label}: the MCP server rejected the request itself, which no retry fixes.\n  ${tried.join("\n  ")}`);
    }
    if (i < attempts - 1) sleepSync(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]);
  }

  // SAY WHAT WAS TRIED, so a transient failure and a permanent one are not
  // indistinguishable from the report.
  throw new Error(`${tool}${label}: no JSON from the MCP after ${attempts} attempt(s).\n  ${tried.join("\n  ")}`);
}

/**
 * The same call, parsed. Almost every caller wants this one.
 *
 * The parse sits OUT here rather than inside the retry loop deliberately: JSON
 * that arrived and will not parse is a shape problem, not a network one, and it
 * reads exactly the same way on the next attempt. Retrying it would spend the
 * backoff to be told the same thing, and worse, would report a shape bug as a
 * flaky connection.
 */
export function mcpCall(tool, args, opts = {}) {
  const text = mcpText(tool, args, opts);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${tool}${opts.label ? ` (${opts.label})` : ""}: JSON came back and would not parse: ${e.message}\n` +
      `  head: ${text.slice(0, 200)}`);
  }
}
