// Does the simulator reproduce the world it claims to model?
//
//   node tools/check-sim.mjs
//
// Exits 1 if not. Called by guard.mjs. Local compute, no model turn.
//
// WHY THIS EXISTS. The matchup simulator shipped understating variance by a
// factor of three. It resampled inside quartile-narrow tiers and recentred on
// the projection, which left a receiver projected 14.4 with a coefficient of
// variation of 0.19 against a measured 0.64. Nothing caught it. Every existing
// check asked "did it produce output" and the answer was yes: a confident 46
// percent problem reported as a confident 34.7 percent, with a tidy table
// underneath. It was found only because a competing tool disagreed and the gap
// happened to get investigated.
//
// THE GENERAL LESSON, which is the part worth keeping. A model that outputs a
// DISTRIBUTION cannot be validated by checking that it output something. It has
// to be tested against the distribution it claims to reproduce. Smoke tests
// prove a pipe is connected; only a calibration test proves the water is clean.
//
// So this simulates players whose real spread is known, and fails if the
// simulated spread does not match. If the model is changed in a way that
// distorts variance again, this goes red rather than a probability quietly
// drifting.

import { buildPool, simulate } from "../lib/sim.mjs";
import { measured } from "../lib/measured.mjs";

// Measured across 2021 to 2025 over players with a real role: standard
// deviation over mean, per position. These are the ground truth the simulator
// exists to reproduce.
// READ FROM THE MEASUREMENT, not retyped.
//
// This was a second hand-typed copy of the same figures lib/sim.mjs carried, in
// the one tool whose entire job is to check the simulator against reality. It
// was validating the sim against a fossil: update the source and not the check
// and the check silently starts testing the wrong target, while still printing
// 'ok'. A calibration check that validates against a constant somebody typed is
// only checking that two people typed the same thing.
const MEASURED_CV = {
  QB: measured("sim.cv.QB", 0.49),
  RB: measured("sim.cv.RB", 0.72),
  WR: measured("sim.cv.WR", 0.64),
  TE: measured("sim.cv.TE", 0.56),
};

// How far off is tolerable. A bootstrap will not land exactly, but a model that
// is 40 percent out on spread is wrong in a way that moves decisions.
const TOLERANCE = 0.25;

// A projection near a real starter's week, per position.
const PROJ = { QB: 18, RB: 12, WR: 14, TE: 9 };

await buildPool();

const problems = [];
const rows = [];

for (const [pos, targetCv] of Object.entries(MEASURED_CV)) {
  const subject = { name: "test", pos, proj: PROJ[pos], game: "A", locked: false };
  // A locked zero opponent makes the margin equal the subject's own score.
  const still = { name: "none", pos: "WR", proj: 0, game: "B", locked: true, actual: 0 };
  const r = simulate([subject], [still], { runs: 30000, seed: 11 });

  const sd = (r.p90 - r.p10) / 2.563;   // 10th to 90th spans 2.563 sd for a normal
  const cv = sd / Math.max(r.meanMargin, 0.01);
  const off = Math.abs(cv - targetCv) / targetCv;

  rows.push({ pos, cv, targetCv, off, mean: r.meanMargin, proj: PROJ[pos] });

  if (off > TOLERANCE) {
    problems.push(`${pos}: simulated spread is cv ${cv.toFixed(2)} against a measured ${targetCv.toFixed(2)}, ` +
      `${(off * 100).toFixed(0)} percent out. ` +
      (cv < targetCv
        ? "Too narrow, which pulls every win probability toward whoever is ahead."
        : "Too wide, which pushes every win probability toward a coin flip."));
  }

  // The mean must also survive. A simulator that recentres wrongly would show
  // up here rather than in the spread.
  const meanOff = Math.abs(r.meanMargin - PROJ[pos]) / PROJ[pos];
  if (meanOff > 0.15) {
    problems.push(`${pos}: simulated mean ${r.meanMargin.toFixed(1)} against a projection of ${PROJ[pos]}, ` +
      `${(meanOff * 100).toFixed(0)} percent out. The draw is not centred on what we told it.`);
  }
}

console.log("simulator calibration against measured weekly spread\n");
console.log("pos   projection   simulated cv   measured cv   off by");
for (const r of rows) {
  console.log(
    r.pos.padEnd(5),
    String(r.proj).padStart(10),
    r.cv.toFixed(2).padStart(14),
    r.targetCv.toFixed(2).padStart(13),
    ((r.off * 100).toFixed(0) + "%").padStart(8),
  );
}

if (problems.length === 0) {
  console.log("\nok: the simulator reproduces real weekly spread at every position");
  process.exit(0);
}

console.error("\nsimulator calibration FAILED");
for (const p of problems) console.error("  " + p);
console.error("\nDo not widen TOLERANCE to make this pass. The numbers this model");
console.error("produces are probabilities people act on, and a mis-scaled distribution");
console.error("is wrong in a way that looks entirely reasonable.");
process.exit(1);
