// Every rule in memory must also exist, in full, in rules/.
//
//   node tools/check-mirror.mjs
//
// Exits 1 if anything is missing. Called by guard.mjs, runnable on its own.
//
// WHY. rules/ is the copy a recovered session reads. Memory is the copy this
// session reads. They are supposed to be the same document, and on the
// league this kit was built for they silently were not: an audit found
// eighteen rules that had drifted between the two copies and one missing from
// rules/ entirely, among them a standing authorization, a safety guardrail's
// own reasoning, and a formatting rule for public commits. A machine restored
// from git alone would have operated without all of that, silently, and
// nothing would have said so.
//
// On a recovered box there is no memory directory, which is expected and not a
// failure. The check reports that it does not apply and passes.

import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const HOME = process.env.USERPROFILE || process.env.HOME || "";
// FIND THE MEMORY DIRECTORY, DO NOT HARDCODE ITS NAME. Claude names a project
// directory after the session's own working directory, and that name is
// different on every machine and for every owner. Hardcoding one bakes in
// whichever computer first wrote this check, and everyone else's mirror check
// would silently report "no memory directory, nothing to compare" and pass
// while checking nothing. So this searches for it instead.
//
// Prefer the directory that actually holds the most rules. A project that has
// been renamed or duplicated leaves empty shells behind, and the real memory is
// the populated one.
function findMemory() {
  const projects = path.join(HOME, ".claude", "projects");
  let best = null, bestCount = -1;
  let entries = [];
  try { entries = fs.readdirSync(projects, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(projects, e.name, "memory");
    let n = 0;
    try { n = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").length; } catch { continue; }
    if (n > bestCount) { bestCount = n; best = dir; }
  }
  return bestCount > 0 ? best : null;
}

const MEM = findMemory();

const flat = (t) => t.split(/\s+/).join(" ").trim();

/** Strip YAML frontmatter so the two copies are compared on their prose. */
function bodyOf(text) {
  const t = text.split("\r").join("");
  const end = t.indexOf("---", 3);
  return end > 0 ? t.slice(end + 3) : t;
}

if (!MEM || !fs.existsSync(MEM)) {
  console.log("ok: no memory directory on this machine, so the mirror check does not apply");
  process.exit(0);
}

const problems = [];
let checked = 0;

for (const name of fs.readdirSync(MEM).filter((n) => n.endsWith(".md") && n !== "MEMORY.md")) {
  const target = path.join(REPO, "rules", name);
  if (!fs.existsSync(target)) {
    problems.push(`${name}: in memory but absent from rules/. A recovered session would never see this rule.`);
    continue;
  }
  checked++;
  const mem = bodyOf(fs.readFileSync(path.join(MEM, name), "utf8"));
  const repo = flat(bodyOf(fs.readFileSync(target, "utf8")));

  // A paragraph counts as mirrored if a distinctive opening run of it appears in
  // the repo copy. Comparing whole files would fail on harmless reformatting.
  const lost = mem
    .split("\n\n")
    .map(flat)
    .filter((p) => p.length > 40 && !repo.includes(p.slice(0, 60)));

  if (lost.length) {
    problems.push(`${name}: ${lost.length} paragraph(s) present in memory are not in rules/`);
    for (const l of lost.slice(0, 2)) problems.push(`    ${l.slice(0, 120)}`);
  }
}

if (problems.length === 0) {
  console.log(`ok: all ${checked} rules in memory are mirrored in rules/`);
  process.exit(0);
}

console.error(`rules mirror: ${problems.length} problem(s)`);
for (const p of problems) console.error("  " + p);
console.error("\nFix by updating rules/ to match memory. Do not delete the memory copy:");
console.error("these are the same document and rules/ is the one a recovery reads.");
process.exit(1);
