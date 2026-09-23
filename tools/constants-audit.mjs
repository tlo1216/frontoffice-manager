// Is every measured number in this repo still what the data says?
//
//   node tools/constants-audit.mjs
//   node tools/constants-audit.mjs --write
//
// Local compute, reads files only, no network and no model turn. Run by
// tools/guard.mjs.
//
// THE GAP THIS CLOSES. A statistical harness measures something and writes
// PROSE about it: a backtest over five seasons finds receivers vary week to
// week at a coefficient of 0.64 and says so in a comment; somebody then types
// 0.64 into the code that uses it by hand. From that moment the harness and
// the decision are unconnected. Re-running the backtest over more seasons
// could move the number anywhere and nothing would notice, because no check
// compares a literal in one file to a paragraph in another.
//
// It is the same failure this repo keeps finding: confident output after a lost
// input. Here the input is not lost to a bad join or a stale cache. It is lost
// to a human retyping it once, correctly, and then the world moving.
//
// WHAT THIS CHECKS, in order of how much each has cost:
//
//   1. REGISTRY MATCHES CODE. The literal recorded in league/constants.json is
//      the literal actually in the file. An edit to one and not the other makes
//      every other check here vacuous, so it is checked first.
//   2. CODE MATCHES MEASUREMENT. Where a harness has recorded a value, the
//      literal is within tolerance of it.
//   3. NOTHING IS UNREGISTERED. A numeric constant in lib/ that nobody declared
//      is a fossil in waiting. New math has to be declared to pass.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not re-run the harnesses. Those
// read tens of megabytes of season data and take minutes; making the guard
// depend on them would mean the guard stops being run. It reads what they last
// recorded, and reports the AGE, so a measurement from before the season cannot
// pass itself off as a fresh one.

import fs from "node:fs";
import path from "node:path";
import { REPO } from "../lib/data.mjs";
import { allMeasured } from "../lib/measured.mjs";

const argv = process.argv.slice(2);
const doWrite = argv.includes("--write");

// A measurement older than this is reported as stale. It is deliberately longer
// than a week: these are multi-season estimates and they do not move fast. The
// point is to catch one that has never been re-run at all.
const STALE_DAYS = 45;

const reg = JSON.parse(fs.readFileSync(path.join(REPO, "league/constants.json"), "utf8"));
const meas = allMeasured();

const problems = [];
const notes = [];
const rows = [];

for (const c of reg.constants) {
  const file = path.join(REPO, c.file);
  if (!fs.existsSync(file)) { problems.push(`${c.key}: ${c.file} does not exist.`); continue; }
  const src = fs.readFileSync(file, "utf8");

  // 1. REGISTRY MATCHES CODE.
  //
  // THE LITERAL IS MATCHED AT ITS OWN DECLARATION SITE, not anywhere in the file.
  //
  // Three bugs, each found by mutation-testing this check rather than by reading
  // it. Matching the substring "0.7" hits 0.75, 10.7 and any comment containing
  // it. Matching the bounded string "0.2" then MISSES the code's 0.20, because
  // JSON hands back 0.2 and the source says 0.20 -- one number, two spellings.
  //
  // And the version that fixed both was still vacuous. It searched the WHOLE FILE
  // for a number equal to the literal, so factor.home at 0.21 was satisfied by
  // factor.dome, which is also 0.21. Changing home to 0.99 in the code passed
  // silently, because dome still held a 0.21 somewhere below it. Two constants
  // that happen to share a value made each other's check meaningless -- the same
  // neighbour-satisfies-the-check shape that broke the staleness guard.
  //
  // So a wired constant is matched as measured("<key>", <literal>), which ties
  // the registry key to one site in the code and cannot be satisfied by a
  // neighbour. An unwired or policy constant has no such anchor, so it is matched
  // on its own const declaration line.
  //
  // WHAT THIS STILL CANNOT SEE, stated rather than papered over: arithmetic
  // wrapped around the call. measured("factor.home", 0.21) + 0.9 passes, because
  // the declaration is intact and only the expression around it changed. Catching
  // that needs evaluating the module, not reading it, and that is a bigger tool
  // than this one. The guard covers the fossil, not every possible sabotage.
  let sited;
  if (c.wired === "yes") {
    const esc = c.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const site = new RegExp(`measured\\(\\s*["'\`]${esc}["'\`]\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)`);
    const mm = src.match(site);
    sited = mm && Number(mm[1]) === c.literal;
    if (!mm) {
      problems.push(`${c.key}: declared wired, but ${c.file} has no measured("${c.key}", ...) call. ` +
        `Either it is not wired at all, or the key was renamed on one side only.`);
      continue;
    }
  } else {
    // One declaration line, one number. Comments are excluded so a figure quoted
    // in a note cannot stand in for the real declaration.
    sited = src.split(/\r?\n/).some((line) => {
      if (/^\s*(\/\/|\*)/.test(line)) return false;
      const d = line.match(/^\s*(?:export\s+)?const\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(-?\d+(?:\.\d+)?)\s*[;,]/);
      return d && Number(d[1]) === c.literal;
    }) || (src.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).includes(c.literal);
  }
  if (!sited) {
    problems.push(`${c.key}: league/constants.json records the literal as ${c.literal}, and ` +
      `${c.file} does not hold that value at this constant's own declaration site. One of the two ` +
      `was edited without the other, which makes every tolerance check on it meaningless.`);
    continue;
  }

  const m = meas[c.key];
  const ageDays = m ? (Date.now() - Date.parse(m.stamp)) / 86400000 : null;

  // 2. CODE MATCHES MEASUREMENT.
  let status;
  if (c.wired === "n/a") {
    status = "policy";
    notes.push(`${c.key} is a policy choice (${c.what.split(".")[0].toLowerCase()}), not an estimate. No harness owes it a number.`);
  } else if (!m) {
    // BROKEN AND WAITING-ON-DATA ARE NOT THE SAME THING, and collapsing them is
    // how a guard becomes wallpaper. factor.questionableNoPractice cannot be
    // measured today: its bucket holds 140 player weeks against a threshold of
    // 200, and no amount of work here changes that before more seasons exist.
    // Failing on it forever would train everyone to ignore a red guard, which
    // costs more than the constant does.
    //
    // So a constant carrying an explicit `pending` reason WARNS and stays visible;
    // everything else FAILS, because everything else is somebody's to fix now.
    // This is a distinction between two states, not a relaxed threshold: remove
    // the `pending` reason and it fails again immediately.
    status = c.pending ? "waiting on data" : "never measured";
    if (c.pending)
      notes.push(`${c.key} has never been measured, and cannot be yet: ${c.pending} ` +
        `Until then the code runs on ${c.literal}.`);
    else
      problems.push(`${c.key}: declared as a measured number with harness ${c.harness || "(none)"}, ` +
        `but nothing has ever recorded it. The literal ${c.literal} is a fossil: re-running the ` +
        `harness cannot change what the code does.`);
  } else {
    const drift = Math.abs(m.value - c.literal);
    if (c.tolerance !== null && drift > c.tolerance) {
      status = "DRIFTED";
      problems.push(`${c.key}: code carries ${c.literal}, last measurement says ${m.value} ` +
        `(n=${m.n}, ${m.source}). Drift ${drift.toFixed(3)} exceeds tolerance ${c.tolerance}.`);
    } else {
      status = "ok";
    }
    if (ageDays > STALE_DAYS)
      notes.push(`${c.key} was last measured ${ageDays.toFixed(0)} days ago. Not wrong, but nobody has checked it this season.`);
    if (c.wired === "no")
      notes.push(`${c.key} is not wired: ${c.file} carries the literal rather than reading measured.json, ` +
        `so a fresh measurement does not reach the decision until somebody retypes it.`);
  }
  if (c.suspect) notes.push(`${c.key} is flagged suspect: ${c.suspect}`);

  rows.push({ key: c.key, file: c.file, lit: c.literal, meas: m ? m.value : null,
    n: m ? m.n : null, age: ageDays, status, wired: c.wired, harness: c.harness });
}

// 3. NOTHING IS UNREGISTERED.
//
// Only lib/ is swept, on purpose. lib/ holds the shared decision layer, where a
// constant silently affects every tool; a threshold local to one tool is that
// tool's business. Sweeping everything would produce a list nobody reads, and a
// check nobody reads is not a check.
const declared = new Set(reg.constants.map((c) => c.key));
const declaredLits = new Map();
for (const c of reg.constants) declaredLits.set(path.basename(c.file) + ":" + c.literal, c.key);

const unregistered = [];
for (const f of fs.readdirSync(path.join(REPO, "lib")).filter((f) => f.endsWith(".mjs"))) {
  if (f === "measured.mjs") continue;                 // the machinery itself holds no estimates
  const src = fs.readFileSync(path.join(REPO, "lib", f), "utf8");
  for (const line of src.split(/\r?\n/)) {
    // A constant declaration with a bare number, ignoring comment bodies. Integers
    // under 100 with no decimal point are almost always slot ids, array indices or
    // week numbers, and sweeping them buries the real findings in noise.
    const mm = line.match(/^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+\.\d+)\s*[;,]/);
    if (!mm) continue;
    const key = path.basename(f) + ":" + Number(mm[2]);
    if (declaredLits.has(key)) continue;
    unregistered.push(`lib/${f}: const ${mm[1]} = ${mm[2]}`);
  }
}
for (const u of unregistered)
  problems.push(`Undeclared constant, ${u}. If it came from a measurement it belongs in ` +
    `league/constants.json with a harness that re-derives it. If it is a policy choice, declare it ` +
    `as wired "n/a" so the next reader knows nobody is checking it.`);

// 4. NOTHING MEASURED IS ORPHANED.
//
// Check 3 sweeps lib/ for a literal nobody declared. This is the same failure
// from the other direction: a key in league/measured.json that no row in
// league/constants.json points at. A harness can be pointed at a brand new key
// and record it before a row is ever added, or a row can be deleted while the
// harness that writes the key keeps running. Either way the number is being
// measured and nothing is checking it for drift, reporting its age, or telling
// a reader where, if anywhere, it is consumed.
//
// A real example of the shape: a harness records both a derived constant
// (the one actually wired into a decision, with its own row below) and an
// intermediate figure it was derived from, kept in league/measured.json for
// the note it carries rather than consumed anywhere by name. That may be a
// fine reason for the intermediate figure to exist unwired, but "may be" is
// exactly what a missing row hides: nobody has said so in the one place that
// would be checked.
for (const key of Object.keys(meas)) {
  if (declared.has(key)) continue;
  const m = meas[key];
  problems.push(`${key}: recorded in league/measured.json (n=${m.n}, ${m.source}) but has no row ` +
    `in league/constants.json. A number a harness measures and nobody declares is checked by ` +
    `nothing: not for drift, not for staleness, not for where it is meant to be used.`);
}

const L = [];
const say = (s = "") => L.push(s);
say(`# Are our measured numbers still what the data says, ${new Date().toLocaleDateString()}`);
say("");
say("Every harness in this repo writes prose. A human then retypes the number into");
say("the code, and from that moment the measurement and the decision are two");
say("separate things. This is the check that notices when they part company.");
say("");
say("| Constant | Lives in | In code | Last measured | n | Age | Wired | Status |");
say("|---|---|---|---|---|---|---|---|");
for (const r of rows)
  say(`| ${r.key} | ${r.file} | ${r.lit} | ${r.meas === null ? "never" : r.meas} | ` +
    `${r.n ?? "-"} | ${r.age === null ? "-" : r.age.toFixed(0) + "d"} | ${r.wired} | ` +
    `${r.status === "DRIFTED" ? "**DRIFTED**" : r.status} |`);
say("");

if (notes.length) {
  say("## Worth knowing");
  say("");
  for (const n of notes) say(`- ${n}`);
  say("");
}

if (problems.length) {
  say("## Problems");
  say("");
  for (const p of problems) say(`- ${p}`);
  say("");
  say(`**${problems.length} problem(s).** A measured number nobody re-derives is a fossil, and this`);
  say("repo has lost more to fossils than to bugs.");
} else {
  say("No drift, nothing undeclared. Every measured number in the shared layer has a");
  say("harness that owns it.");
}

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) { fs.writeFileSync(path.join(REPO, "reports", "constants-audit.md"), text); console.log("written: reports/constants-audit.md"); }
process.exit(problems.length ? 1 : 0);
