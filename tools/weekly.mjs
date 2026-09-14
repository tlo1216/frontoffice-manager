// One command for the whole weekly pass. Runs every analysis lever we have,
// writes each report, and prints a single digest at the end.
//
//   node tools/weekly.mjs --week 1
//
// Everything below is local compute: node, about half a megabyte of cached CSV,
// and a few ESPN reads. No model turn produces any number here. The intended
// shape of the week is that this runs on a schedule for free, and exactly one
// model turn afterwards reads the digest and decides what to change.
//
// It also prints a code-review worklist, because the tools that produce these
// numbers are part of the team's performance: a rounding call in the wrong
// place cost us the resolution of an entire matchup once already.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const week = Number(argv[argv.indexOf("--week") + 1]) || 1;

const STEPS = [
  ["Lineup efficiency and projection calibration", "backtest.mjs"],
  ["All-play record and value over replacement", "backtest-value.mjs"],
  ["Buy, sell, missed, streaming and volatility boards", "edge.mjs"],
  ["Trade surplus and shortage across all eight rosters", "trade-finder.mjs"],
  ["Lineup by win probability, with leverage", "lineup.mjs"],
  ["Market: trending adds, price against lineup value, measured weather", "market.mjs"],
];

const results = [];
for (const [label, script] of STEPS) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(process.execPath, [path.join(REPO, "tools", script), "--week", String(week), "--write"], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const ok = r.status === 0;
  results.push({ label, script, ok, out: r.stdout || "", err: (r.stderr || "").trim() });
  console.log(ok ? (r.stdout || "").split("\n").slice(0, 4).join("\n") : `FAILED: ${r.stderr || r.status}`);
}

// --- code review worklist ---------------------------------------------------
//
// Not a linter. These are the specific shapes that have actually gone wrong in
// this repo, so the list stays short enough to read every week and act on.

const SMELLS = [
  [/Math\.round\((?![^)]*\* ?100)/, "rounds to a whole number in what may be a data path — round at display only"],
  [/parseInt\(/, "parseInt truncates; use Number() and round at display"],
  [/\.toFixed\([0-9]\)\s*[-+*/]/, "arithmetic on a toFixed string — that is string maths, not number maths"],
  [/lastIndexOf\("\]"\)/, "trims to the last bracket; make sure no trailing note also ends in one"],
  [/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, "swallows an error silently — at least record that it happened"],
  // Must not match the tail of "===" or the "==" inside "!==" / "<=" / ">=".
  // The first version of this rule did, and produced 40 false hits in one run,
  // which is how a checklist stops being read.
  [/(?<![=!<>])==(?!=)/, "loose equality"],
  [/lineupLocked|\.locked\b/, "ESPN's locked flag is unreliable; prefer the NFL scoreboard for whether a game is done"],
];

const files = [];
for (const dir of ["tools", "."]) {
  const d = path.join(REPO, dir);
  for (const f of fs.readdirSync(d)) if (f.endsWith(".mjs") || f.endsWith(".js")) files.push(path.join(d, f));
}
const findings = [];
for (const f of [...new Set(files)]) {
  const src = fs.readFileSync(f, "utf8").split("\n");
  src.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return; // comments are not code
    for (const [re, why] of SMELLS) if (re.test(line)) findings.push({ file: path.relative(REPO, f), line: i + 1, why, text: line.trim().slice(0, 90) });
  });
}

// --- digest -----------------------------------------------------------------

const D = [];
D.push(`# Weekly pass, week ${week}`);
D.push("");
D.push(`Ran ${results.filter((r) => r.ok).length} of ${results.length} analyses. Reports are in \`reports/\`.`);
D.push("");
for (const r of results) D.push(`- ${r.ok ? "ok" : "FAILED"} — ${r.label} (\`${r.script}\`)${r.err ? `: ${r.err.slice(0, 120)}` : ""}`);
D.push("");
D.push("## Code review worklist");
D.push("");
if (findings.length === 0) D.push("Nothing matched the patterns that have bitten this repo before.");
else {
  D.push("Patterns that have actually caused a wrong number here before. Each one needs a");
  D.push("human read — some are correct in context, and the point is to look, not to obey.");
  D.push("");
  D.push("| File | Line | Why it is worth a look |");
  D.push("|---|---|---|");
  for (const f of findings.slice(0, 25)) D.push(`| \`${f.file}\` | ${f.line} | ${f.why} |`);
  if (findings.length > 25) D.push("");
  if (findings.length > 25) D.push(`_${findings.length - 25} more not listed._`);
}
D.push("");
D.push("## What a model turn should do with this");
D.push("");
D.push("1. Read the three reports, not the raw data.");
D.push("2. Act only on what repeats across weeks; a single week is noise.");
D.push("3. Clear each code-review line consciously, the way the curtain check is cleared.");
D.push("4. Ask what could be computed cheaper: a metric that predicts more per byte");
D.push("   pulled, work that can move from a model turn into this script, a file that");
D.push("   does not need refetching. The scarce resource is model turns, not data.");

const text = D.join("\n") + "\n";
const out = path.join(REPO, "reports", `weekly-week-${week}.md`);
fs.writeFileSync(out, text);
console.log("\n" + text);
console.log(`written: ${out}`);
