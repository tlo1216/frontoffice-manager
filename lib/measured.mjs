// Numbers that came from a measurement, and the machinery that stops them
// becoming fossils.
//
// THE PROBLEM THIS SOLVES. A statistical harness measures something and
// writes PROSE about it: "receivers vary week to week at a coefficient of
// 0.64." A person then types 0.64 into the code that uses it by hand. From
// that moment the two are unconnected. Re-running the harness on more seasons
// could move the number to 0.7 and nothing anywhere would notice, because no
// check compares a literal in one file to a paragraph in another.
//
// That is the same failure this repo keeps finding under a different hat:
// confident output after a lost input. The input here is not lost to a bad
// join or a stale cache, it is lost to a human retyping it once.
//
// THE PATTERN, already proven in lib/sim.mjs, generalised. A harness RECORDS
// what it measured. A consumer READS the recording and carries a literal only
// as a fallback for when the recording is missing. tools/constants-audit.mjs
// then compares the two and complains when they have drifted apart.
//
//   harness:   record("sim.cv.WR", 0.64, { n: 41233, source: "2021-2025" })
//   consumer:  const cv = measured("sim.cv.WR", 0.64)
//
// WHY A FALLBACK AT ALL, rather than throwing. A missing measurement must not
// take a lineup tool down an hour before kickoff. The fallback keeps the tool
// running on the last number a human verified, and the audit is what makes the
// staleness loud rather than silent.

import fs from "node:fs";
import path from "node:path";
import { REPO } from "./data.mjs";

const FILE = path.join(REPO, "league", "measured.json");

let _cache = null;
function load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { _cache = {}; }
  return _cache;
}

/**
 * Record what a harness measured. Called by backtests, never by a decision tool.
 *
 * The stamp matters as much as the value: a measurement from before the season
 * started and one from last night are not the same evidence, and the audit
 * reports age so an old number cannot pass as a fresh one.
 *
 * @param {string} key    dotted, e.g. "factor.home" or "regression.shrink"
 * @param {number} value  what was measured
 * @param {object} meta   { n, source, sd, note } -- n and source are required,
 *                        because a number with no sample size behind it is an
 *                        opinion and this file is not for opinions.
 */
export function record(key, value, meta = {}) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`record(${key}): value must be a finite number, got ${value}`);
  if (!meta.n || !meta.source)
    throw new Error(`record(${key}): needs meta.n and meta.source. A measurement without a ` +
      `sample size and a stated source is a guess, and guesses do not belong in measured.json.`);

  const all = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  all[key] = { value, n: meta.n, source: meta.source, sd: meta.sd ?? null,
    note: meta.note ?? null, stamp: new Date().toISOString() };

  // KEYS SORTED BY REBUILDING THE OBJECT, not by passing them to stringify.
  //
  // JSON.stringify(obj, arrayOfKeys, 2) does NOT sort: the second argument is a
  // REPLACER, and an array there is a whitelist applied at EVERY level. Passing
  // the top-level key names filtered every nested object down to nothing, and
  // the first run of this wrote {"factor.questionable": {}} -- the value, the
  // sample size and the stamp all silently gone, in the one file whose whole
  // job is to stop numbers going missing.
  const sorted = {};
  for (const k of Object.keys(all).sort()) sorted[k] = all[k];

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + "\n");
  _cache = all;
  return value;
}

/**
 * Read a measured number, falling back to the literal a human last verified.
 *
 * The fallback is REQUIRED and deliberately so. Writing measured("factor.home")
 * with nothing behind it would let a decision tool silently run on undefined
 * the first time the file is missing, which is exactly the class of bug the
 * rest of this repo exists to prevent.
 */
export function measured(key, fallback) {
  if (typeof fallback !== "number" || !Number.isFinite(fallback))
    throw new Error(`measured(${key}): a finite fallback is required, got ${fallback}`);
  const e = load()[key];
  return e && typeof e.value === "number" && Number.isFinite(e.value) ? e.value : fallback;
}

/** Everything on file, for the audit. */
export function allMeasured() { return { ...load() }; }

/** Drop the cache. Only the audit needs this, after a harness has just written. */
export function reload() { _cache = null; return load(); }
