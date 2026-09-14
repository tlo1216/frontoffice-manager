// Safeguards against your own setup quietly getting worse over a season.
//
//   node tools/guard.mjs           run every check, exit non zero on failure
//   node tools/guard.mjs --accept  record the current thresholds as the baseline
//
// Local compute. No agent turn, no API key, no network. Safe to run in CI or
// from a scheduled task.
//
// THE PROBLEM. An agent-run team accumulates scripts that compute things:
// projections, replacement levels, waiver bars, lineup optimisers. Those
// scripts degrade in ways that look like success rather than like errors:
//
//   - a parser breaks and a report is produced over zero rows, with verdicts
//   - a filter silently empties a table and the table still renders
//   - an API argument is ignored and everything is returned instead of one team
//   - a provider fails and a two source check quietly becomes a one source one
//   - a number gets rounded on the way in and every comparison downstream is
//     coarser than it looks
//
// In each case the output reads as confident. None of them throw. The checks
// below are aimed at that shape specifically, not at correctness in general.
//
// THE THRESHOLD RATCHET. The easiest way to make a failing check pass is to
// lower the bar, and it never feels like cheating in the moment. So every
// guarded constant is recorded with the reason it holds its value. If one
// moves, this fails and names it. LOWERING a guard fails; raising one warns.
// Changing a threshold is allowed. Changing one silently is not.
//
// ADAPTING THIS. Edit GUARDED and SMOKE for your own scripts. Keep both lists
// short: a guard that fires on normal conditions is a guard people learn to
// skim, which is worse than not having it.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const accept = process.argv.includes("--accept");
const LEDGER = path.join(REPO, "league", "thresholds.json");

const fails = [], warns = [], oks = [];

// --- 1. guarded constants ---------------------------------------------------
// file, constant name, and why it sits where it does. The value is read from
// the source, so the ledger can never drift away from the code.

const GUARDED = [
  // ["tools/your-script.mjs", "MIN_SAMPLE",
  //  "Below this the parse is broken, not the week. Lowering it hides that."],
];

function readConst(file, name) {
  const full = path.join(REPO, file);
  if (!fs.existsSync(full)) return null;
  const m = fs.readFileSync(full, "utf8").match(new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

const current = {};
for (const [file, name, why] of GUARDED) {
  const v = readConst(file, name);
  if (v === null) { fails.push(`threshold ${name} not found in ${file}; the guard can no longer see it`); continue; }
  current[`${file}:${name}`] = { value: v, why };
}

let ledger = {};
if (fs.existsSync(LEDGER)) ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));

if (accept) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), thresholds: current }, null, 2));
  console.log(`Baseline recorded: ${Object.keys(current).length} thresholds.`);
  process.exit(0);
}

if (!ledger.thresholds && GUARDED.length) {
  warns.push("No threshold baseline recorded yet. Run: node tools/guard.mjs --accept");
} else if (ledger.thresholds) {
  for (const [key, cur] of Object.entries(current)) {
    const was = ledger.thresholds[key];
    if (!was) { warns.push(`new guarded threshold ${key} = ${cur.value}`); continue; }
    if (was.value === cur.value) { oks.push(`${key} unchanged at ${cur.value}`); continue; }
    const msg = `${key} ${cur.value < was.value ? "LOWERED" : "raised"} from ${was.value} to ${cur.value}. Reason on file: ${cur.why}`;
    (cur.value < was.value ? fails : warns).push(msg);
  }
  for (const key of Object.keys(ledger.thresholds)) if (!current[key]) fails.push(`guarded threshold ${key} has disappeared from the source`);
}

// --- 2. smoke tests ---------------------------------------------------------
// Each analysis script must produce output that is obviously alive. This is the
// check that catches a report of confident verdicts computed over nothing.

const SMOKE = [
  // { tool: "trade-finder.mjs", args: [], mustMatch: /Replacement level/,
  //   minLines: 20, why: "replacement levels computed" },
];

for (const s of SMOKE) {
  const full = path.join(REPO, "tools", s.tool);
  if (!fs.existsSync(full)) { warns.push(`${s.tool} not present, skipped`); continue; }
  const r = spawnSync(process.execPath, [full, ...(s.args || [])], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240000,
  });
  const out = r.stdout || "";
  if (r.status !== 0) { fails.push(`${s.tool} exited ${r.status}: ${(r.stderr || "").slice(0, 160)}`); continue; }
  if (s.mustMatch && !s.mustMatch.test(out)) { fails.push(`${s.tool} ran but produced no ${s.why}`); continue; }
  const lines = out.split("\n").length;
  if (s.minLines && lines < s.minLines) {
    fails.push(`${s.tool} produced only ${lines} lines, expected ${s.minLines}. Alive but thin, which usually means a filter emptied it.`);
    continue;
  }
  if (s.mustNotMatch && s.mustNotMatch.test(out)) { fails.push(`${s.tool} contains empty rows where numbers belong`); continue; }
  oks.push(`${s.tool}: ${s.why}`);
}

// --- 3. precision -----------------------------------------------------------
// Scores and projections that are suspiciously round mean precision is being
// lost upstream. A rounded value entering a data path makes every comparison
// after it coarser than it appears, and matchups are decided in tenths.

function precisionCheck(file) {
  if (!fs.existsSync(file)) return;
  const nums = [...fs.readFileSync(file, "utf8").matchAll(/\|\s*(\d+\.\d+)\s*\|/g)].map((m) => Number(m[1]));
  if (nums.length < 8) return;
  const whole = nums.filter((n) => n % 1 === 0).length;
  if (whole > nums.length / 2) fails.push(`${path.basename(file)}: ${whole} of ${nums.length} figures are whole numbers. Precision is being lost upstream.`);
  else oks.push(`${path.basename(file)}: precision intact`);
}
const reports = path.join(REPO, "reports");
if (fs.existsSync(reports)) for (const f of fs.readdirSync(reports).filter((f) => f.endsWith(".md"))) precisionCheck(path.join(reports, f));

// --- 4. secrets ------------------------------------------------------------
// This repo is public. A key committed once is a key that has to be rotated.

const SECRET = /(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|espn_s2=|SWID=\{)/;
function scanTracked() {
  const r = spawnSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" });
  for (const f of (r.stdout || "").split("\n").filter(Boolean)) {
    if (/\.(png|jpg|jpeg|gif|webp|ico|pdf)$/i.test(f)) continue;
    const full = path.join(REPO, f);
    if (!fs.existsSync(full) || fs.statSync(full).size > 2_000_000) continue;
    if (SECRET.test(fs.readFileSync(full, "utf8"))) fails.push(`possible credential committed in ${f}`);
  }
}
try { scanTracked(); oks.push("no credentials found in tracked files"); } catch { warns.push("could not scan tracked files for credentials"); }

// --- report -----------------------------------------------------------------

const L = ["# System guard", "", `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Local compute only.`, ""];
if (fails.length) { L.push(`## ${fails.length} FAILING`, ""); for (const f of fails) L.push("- " + f); L.push(""); }
if (warns.length) { L.push(`## ${warns.length} to look at`, ""); for (const w of warns) L.push("- " + w); L.push(""); }
L.push(`## ${oks.length} passing`, "");
for (const o of oks) L.push("- " + o);
L.push("", "A failing guard is not a reason to relax the guard. Lowering a threshold to make", "this pass is recorded, and will fail again next run by design.");

const text = L.join("\n") + "\n";
if (fs.existsSync(reports)) fs.writeFileSync(path.join(reports, "guard.md"), text);
console.log(text);
process.exit(fails.length ? 1 : 0);
