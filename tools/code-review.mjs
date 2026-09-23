// The weekly review, the way a team that has to live with this code would do it.
//
//   node tools/code-review.mjs            report
//   node tools/code-review.mjs --write    report and record the numbers
//
// Local compute. No model turn, no network except an npm audit.
//
// WHAT A REVIEW IS FOR, AND WHAT IT IS NOT. It is not a linter. A linter tells
// you about code; this tells you about DRIFT. Every finding below is something
// that was fine when it was written and gets worse on its own if nobody looks:
// a constant copied into a thirteenth file, a one-off script that outlived its
// one use, a guard that has quietly stopped being able to fail.
//
// EVERY NUMBER IS RECORDED SO PROGRESS IS PROVABLE. A review that produces a
// fresh list of complaints every week and never shows a number going down is a
// ritual. league/code-health.jsonl keeps the counts, and the report prints the
// change since last time, so "we are cleaning this up" is a claim with evidence
// or it is not made.
//
// IT DOES NOT AUTO-FIX. A sweeping refactor applied by a script at 9 AM on a
// Sunday is how a working system breaks, and the blast radius of a bad
// automated edit here is a live roster. The review measures and proposes; a
// human or a deliberate session does the surgery, incrementally, with the
// count going down each week as proof.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO } from "../lib/data.mjs";

const argv = process.argv.slice(2);
const doWrite = argv.includes("--write");

const toolDir = path.join(REPO, "tools");
const libDir = path.join(REPO, "lib");
const files = [];
for (const d of [toolDir, libDir])
  for (const f of fs.readdirSync(d))
    if (f.endsWith(".mjs") || f.endsWith(".js"))
      files.push({ rel: path.relative(REPO, path.join(d, f)).replace(/\\/g, "/"), src: fs.readFileSync(path.join(d, f), "utf8") });

const L = [];
const say = (s = "") => L.push(s);
const findings = [];
const metric = {};

say(`# Code review, ${new Date().toISOString().slice(0, 10)}`);
say("");
say(`${files.length} source files. Every count below is recorded, so next week can`);
say("show whether it went down.");
say("");

// --- 1. duplication that a shared module already solves ----------------------
//
// Copying a constant is cheap and correct until the day it is edited in one
// place. The ESPN pro-team map lived in six files when a seventh needed it, and
// the one that was wrong was wrong silently.
const DUPES = [
  { what: "the ESPN_TEAM_ID .env read", re: /Set ESPN_TEAM_ID in \.env so this knows which team is yours/,
    fix: "lib/data.mjs exports espnConfig() for this" },
  { what: "the position map", re: /const POSN = \{ 1: "QB"|1: "QB", 2: "RB", 3: "WR", 4: "TE"/, fix: "lib/byes.mjs exports POSN" },
  { what: "the pro-team map", re: /33: ?"BAL"/, fix: "not centralized yet; a natural home is lib/data.mjs, alongside STADIUM" },
  { what: "the slot-name map", re: /const SLOTN = \{ 0: "QB"/, fix: "lib/byes.mjs exports SLOTN" },
  { what: "the slot-eligibility map", re: /const ELIG = \{ 0: \["QB"\]/, fix: "lib/byes.mjs exports ELIG" },
];
say("## Duplication");
say("");
say("| Copied into | Files | Where it should live |");
say("|---|---|---|");
for (const d of DUPES) {
  const hits = files.filter((f) => d.re.test(f.src) && !f.rel.startsWith("lib/"));
  metric["dupe:" + d.what] = hits.length;
  if (hits.length > 1) findings.push({ sev: hits.length > 10 ? "high" : "med", what: `${d.what} copied into ${hits.length} files` });
  say(`| ${d.what} | ${hits.length} | ${d.fix} |`);
}
say("");

// --- 2. scripts that outlived their one use ----------------------------------
//
// A one-off migration script is correct exactly once. Left in the tools
// directory it looks like a tool, and the dangerous ones are those that still
// run: a script written to patch one bad value on one afternoon, still pointed
// at a session's temp directory that no longer exists, fails in a way that
// reads like a broken repo rather than a dead script.
const oneOff = files.filter((f) =>
  /^tools\/patch-/.test(f.rel) ||
  /AppData\\?\/Local\\?\/Temp/.test(f.src) && !/scratchpad directory/.test(f.src));
metric["oneOffScripts"] = oneOff.length;
say("## One-off scripts still in tools/");
say("");
if (!oneOff.length) say("None. Nothing in tools/ is a spent migration.");
else {
  findings.push({ sev: "med", what: `${oneOff.length} spent one-off script(s) in tools/` });
  for (const f of oneOff) say(`- \`${f.rel}\` — a single-use edit script. Delete it or move it to a scratch directory.`);
}
say("");

// --- 3. the shapes that have actually produced a wrong number here -----------
//
// Not a style guide. Every pattern below cost this repo a real number once.
const SMELLS = [
  [/Math\.round\((?![^)]*\* ?100)/, "rounds to a whole number in a data path; round at display only"],
  [/parseInt\(/, "parseInt truncates; use Number() and round at display"],
  [/\.toFixed\([0-9]\)\s*[-+*/]/, "arithmetic on a toFixed string is string maths"],
  [/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, "swallows an error with no record that it happened"],
  [/(?<![=!<>])==(?!=)/, "loose equality"],
  // ESPN carries more than one stat entry under statSourceId === 1: a preseason
  // projection and, once the season starts, a separately updated rest-of-season
  // one, as different entries in the same array. Matching on statSourceId alone
  // returns whichever ESPN lists first, which is not stable. This does not mean
  // every hit below is wrong: pinning statSplitTypeId sometimes happens a line
  // or two away from the match, or is genuinely unneeded (a specific week's
  // entry does not carry the split-type ambiguity a season total does). It
  // means the line is worth a human's five seconds, the way draft-board.mjs's
  // projection read was before it was pinned. See lib/data.mjs's
  // seasonProjection() for the fixed pattern.
  [/statSourceId\s*===\s*1(?!.*statSplitTypeId)/, "reads a projection by statSourceId without pinning statSplitTypeId on the same line; can silently return the wrong split"],
  // DELIBERATELY NOT A RULE: a bare `?? 0`. It fired 60 times in one run and
  // took the list to 95 items, and a checklist of 95 is a checklist nobody
  // opens, which is the exact failure this review exists to prevent. The
  // dangerous version is a missing DATA field defaulting to zero; no regex
  // separates that from a defaulted option, and the specific instances that
  // bit us have their own guard checks instead.
];
const smellHits = [];
for (const f of files)
  f.src.split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const [re, why] of SMELLS) if (re.test(line)) smellHits.push({ file: f.rel, line: i + 1, why });
  });
metric["smells"] = smellHits.length;
say("## Patterns that have produced a wrong number here before");
say("");
if (!smellHits.length) say("None.");
else {
  say(`${smellHits.length} to look at. Each needs a human read; some are correct in context.`);
  say("");
  say("| File | Line | Why |");
  say("|---|---|---|");
  for (const h of smellHits.slice(0, 20)) say(`| \`${h.file}\` | ${h.line} | ${h.why} |`);
  if (smellHits.length > 20) say("");
  if (smellHits.length > 20) say(`_${smellHits.length - 20} more not listed._`);
}
say("");

// --- 4. can the guard still fail? --------------------------------------------
//
// THE ONE THAT MATTERS MOST. Four checks written in a single day passed while
// proving nothing: a prefix match a neighbour satisfied, a checker counted as
// its own witness, an escape that collapsed into a pattern matching everything.
// A green suite is evidence only if red is reachable.
{
  const guard = files.find((f) => f.rel === "tools/guard.mjs");
  const oks = (guard?.src.match(/\boks\.push\(/g) || []).length;
  const fails = (guard?.src.match(/\bfails\.push\(/g) || []).length;
  metric["guardOk"] = oks; metric["guardFail"] = fails;
  say("## Can the guard still fail");
  say("");
  say(`guard.mjs has ${oks} success paths and ${fails} failure paths.`);
  if (fails < oks * 0.5) findings.push({ sev: "high", what: "guard has far more ways to pass than to fail" });
  say("");
  say("A count is not proof. The only proof is breaking each defence on purpose and");
  say("confirming the matching check goes red, which is a deliberate exercise and");
  say("belongs in the review rather than in a script.");
  say("");
}

// --- 5. dependencies ---------------------------------------------------------
//
// This repo itself has no package.json: everything in tools/ and lib/ runs on
// bare node, on purpose, so there is nothing here for npm to audit. The one
// real dependency is the ESPN MCP server, which does carry a node_modules and
// is where a real vulnerability could land, but it is a separate checkout at
// a path only the owner knows. tools/mcp-call.mjs already resolves that path
// the portable way (ESPN_MCP env var, falling back to a sibling folder named
// espn-fantasy-mcp), so this reuses the same resolution rather than a second,
// possibly divergent guess at where it lives.
say("## Dependencies");
say("");
const mcpRoot = process.env.ESPN_MCP
  ? path.resolve(path.dirname(process.env.ESPN_MCP), "..")
  : path.resolve(REPO, "..", "espn-fantasy-mcp");
if (!fs.existsSync(path.join(mcpRoot, "package.json"))) {
  say(`- ESPN MCP server not found at \`${mcpRoot}\`. Set ESPN_MCP or clone it as a sibling folder ` +
    "to include its dependency audit here. (This repo has no package.json of its own to audit.)");
} else {
  const r = spawnSync("npm", ["audit", "--audit-level=high"], { cwd: mcpRoot, encoding: "utf8", shell: true, timeout: 90000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const clean = /found 0 vulnerabilities/.test(out);
  metric["vulns"] = clean ? 0 : 1;
  say(`- \`${mcpRoot}\`: ${clean ? "0 vulnerabilities" : "**audit reports findings** — " + out.split("\n").slice(-4).join(" ").slice(0, 200)}`);
  if (!clean) findings.push({ sev: "high", what: "npm audit reports a high severity finding" });
}
say("");

// --- the verdict, and the change since last week -----------------------------
const HIST = path.join(REPO, "league/code-health.jsonl");
let prev = null;
if (fs.existsSync(HIST)) {
  const lines = fs.readFileSync(HIST, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length) { try { prev = JSON.parse(lines[lines.length - 1]); } catch { /* a corrupt last line is not worth failing over */ } }
}

say("## Change since the last review");
say("");
if (!prev) say("No previous review on file. This is the baseline.");
else {
  say("| Measure | Then | Now | |");
  say("|---|---|---|---|");
  for (const [k, v] of Object.entries(metric)) {
    const was = prev.metric?.[k];
    if (was === undefined) { say(`| ${k} | - | ${v} | new |`); continue; }
    const d = v - was;
    say(`| ${k} | ${was} | ${v} | ${d === 0 ? "unchanged" : (d < 0 ? "**down " + Math.abs(d) + "**" : "up " + d)} |`);
  }
}
say("");

const high = findings.filter((f) => f.sev === "high");
say("## The short version");
say("");
if (!findings.length) say("Nothing needs attention.");
else {
  for (const f of findings) say(`- ${f.sev === "high" ? "**" + f.what + "**" : f.what}`);
  say("");
  say(high.length ? "Fix the bold ones first." : "Nothing urgent. Take the top one and make the number go down.");
}
say("");

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) {
  fs.writeFileSync(path.join(REPO, "reports", "code-review.md"), text);
  fs.appendFileSync(HIST, JSON.stringify({ at: new Date().toISOString(), metric,
    findings: findings.length, high: high.length }) + "\n");
  console.log("written: reports/code-review.md, and the counts appended to league/code-health.jsonl");
}
