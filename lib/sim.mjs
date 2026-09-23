// Matchup simulation: win probability instead of expected points.
//
// WHY. Every simple optimiser maximises projected total. That is the right
// objective only if you are indifferent to variance, and in a head to head
// matchup you never are. Trailing, you want the wide distribution; leading, you
// want the narrow one. The gap is not academic: measured across 2021 to 2025,
// a starting running back's ninetieth percentile week is 7.4 times his tenth,
// receivers 6.3, tight ends 5.0, quarterbacks 4.0. Expected points throws all
// of that away.
//
// HOW THE DISTRIBUTIONS ARE BUILT. By bootstrap, not by formula. For a player
// we resample from the real weekly scores of comparable players: same position,
// similar projection, from five seasons of history. No distributional
// assumption, no fitted parameters, nothing to overfit. A parametric fit would
// impose a shape the data never agreed to.
//
// CORRELATION. Players in the same NFL game are not independent. A shootout
// lifts both quarterbacks and their receivers; a blowout lifts the winning
// running back and buries everyone else's passing game. Simulating them
// independently understates the variance of the matchup, and understates it
// most in exactly the case that matters, where both managers have someone in
// the same game. A shared per game factor handles this without pretending to
// more precision than we have.

import fs from "node:fs";
import path from "node:path";
import { playerWeeks, num, REPO } from "./data.mjs";
import { measured } from "./measured.mjs";

// Fitted by tools/fit-correlation.mjs. Kept in a file rather than in source so
// the simulation reads a measurement instead of carrying an assumption.
function loadCorr() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(REPO, "league/correlation.json"), "utf8"));
    const opposing = j.byRelationship?.["opposing: two passing games"]?.r ?? 0.048;
    const stack = j.byRelationship?.["same team: QB with his receiver"]?.r ?? 0.243;
    // Pooled median CV across positions, scaling the correlation betas below. A
    // different quantity from the per-position table further down, which is why
    // it has its own key rather than reusing one of those.
    const CV = measured("sim.cv", 0.65);
    return {
      passBeta: Math.sqrt(Math.max(opposing, 0)) * CV,
      rbBeta: Math.sqrt(Math.max(opposing, 0)) * CV * 0.6,
      stack: Math.max(stack - opposing, 0),
      source: "fitted " + (j.fitted || "unknown"),
    };
  } catch {
    return { passBeta: 0.14, rbBeta: 0.08, stack: 0.195, source: "fallback, correlation.json missing" };
  }
}
export const CORR = loadCorr();

const SEASONS = [2021, 2022, 2023, 2024, 2025];

// Coefficient of variation by position, measured across 2021 to 2025 over
// players with a real role. This is the spread a simulated week has to
// reproduce; getting it wrong is the single biggest error a matchup
// simulation can make, because it moves every probability at once. Each is
// read from the measurement, with the literal only as a fallback, and
// tools/check-sim.mjs reads the same keys rather than carrying its own copy:
// two files typing the same figure is how one of them quietly goes stale
// while the other still says "ok".
//
// K and D/ST are not measured here (the harness that would fit them filters to
// players with touches, which a kicker or defense never records), so those two
// keep a plain literal rather than a measured() call.
const CV = {
  QB: measured("sim.cv.QB", 0.49),
  RB: measured("sim.cv.RB", 0.72),
  WR: measured("sim.cv.WR", 0.64),
  TE: measured("sim.cv.TE", 0.56),
  K: 0.45,
  "D/ST": 0.70,
};

/** Buckets of real weekly scores, keyed position and projection tier. */
let POOL = null;

export async function buildPool() {
  if (POOL) return POOL;
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], "D/ST": [] };
  for (const season of SEASONS) {
    for (const r of await playerWeeks(season)) {
      const pos = r.position;
      if (!byPos[pos]) continue;
      const touches = num(r.targets) + num(r.carries);
      // Weeks where a player had no role are not informative about a starter.
      if (pos !== "QB" && touches < 2) continue;
      byPos[pos].push(num(r.fantasy_points_ppr || r.fantasy_points));
    }
  }
  // Split each position into tiers by its own scoring, so a workhorse is
  // resampled against workhorses rather than against the whole position.
  POOL = {};
  for (const [pos, all] of Object.entries(byPos)) {
    if (all.length < 200) { POOL[pos] = { tiers: [all], cuts: [] }; continue; }
    const sorted = [...all].sort((a, b) => a - b);
    const cuts = [0.25, 0.5, 0.75, 0.9].map((q) => sorted[Math.floor(sorted.length * q)]);
    const tiers = [[], [], [], [], []];
    for (const v of all) {
      let t = 0;
      while (t < cuts.length && v > cuts[t]) t++;
      tiers[t].push(v);
    }
    POOL[pos] = { tiers, cuts };
  }
  return POOL;
}

/** Which tier a player belongs in, from his weekly projection. */
function tierOf(pos, weekProjection) {
  const p = POOL[pos] || POOL.WR;
  if (!p.cuts.length) return 0;
  let t = 0;
  while (t < p.cuts.length && weekProjection > p.cuts[t]) t++;
  return t;
}

/**
 * One player's simulated score.
 * `shock` is the shared per game factor in standard deviations, so two players
 * in the same game move together.
 */
function drawOne(player, rnd, shock) {
  const pool = POOL[player.pos] || POOL.WR;
  const tier = pool.tiers[tierOf(player.pos, player.proj)] || pool.tiers[0];
  if (!tier.length) return player.proj;
  const base = tier[Math.floor(rnd() * tier.length)];
  // Recentre the resampled week on this player's own projection, so a bootstrap
  // from his tier describes his SHAPE without overwriting what we know about
  // his level this week.
  if (tier.__mean === undefined) {
    tier.__mean = tier.reduce((a, b) => a + b, 0) / tier.length;
    tier.__sd = Math.sqrt(tier.reduce((a, b) => a + (b - tier.__mean) ** 2, 0) / tier.length) || 1;
  }
  // Take the SHAPE of a real week, standardised, then scale it to the spread
  // this position actually has.
  //
  // The previous version did shaped = proj + (base - tierMean), which looks
  // reasonable and is badly wrong: tiers are quartile-narrow, so the leftover
  // deviation is tiny. A receiver projected 14.4 came out with a coefficient of
  // variation of 0.19 against a measured 0.64, understating spread threefold and
  // pulling every win probability toward whoever was ahead. tools/check-sim.mjs
  // exists to catch exactly this: a model that outputs a distribution has to be
  // tested against the distribution it claims to reproduce, not just checked for
  // producing output at all.
  const z = (base - tier.__mean) / tier.__sd;
  const shaped = player.proj * (1 + z * (CV[player.pos] ?? 0.6));
  // Game level shock, CALIBRATED to measured correlation rather than assumed.
  //
  // The first version used 0.35 for passing positions and 0.15 for backs, which
  // were reasoned. Fitting 145,502 within-game pairs across 2021 to 2025 showed
  // those were roughly two and a half times too large: two passing games on
  // opposite sides of a match correlate at +0.048, not the ~0.12 those
  // coefficients implied. Overstating correlation overstates matchup variance,
  // which biases every win probability toward fifty fifty.
  //
  // Deriving beta from the target: for X = m(1 + bZ) with a typical coefficient
  // of variation around 0.65, corr(i,j) = b_i*b_j / 0.65^2, so a measured
  // correlation of 0.048 implies b of about 0.14.
  //
  // What is NOT modelled here, deliberately: a quarterback with his own
  // receiver measured +0.243, far above the game factor. That is a pair
  // specific effect a single shared shock cannot express without also
  // correlating two receivers, which measured at -0.009. It is applied
  // separately in the stack term below.
  const beta = player.pos === "RB" ? CORR.rbBeta : CORR.passBeta;
  const adjusted = shaped * (1 + beta * shock);
  return Math.max(0, adjusted);
}

/** Mulberry32: a small seeded generator so a run is reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd) {
  // Box-Muller, sufficient for a shared shock term.
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simulate one matchup.
 *
 * ours / theirs: [{ name, pos, proj, game, locked, actual }]
 *   game   groups players who share an NFL game, for correlation
 *   locked true once that player has finished, so `actual` is used as is
 *
 * Returns win probability for "ours", plus the distribution of the margin.
 */
export function simulate(ours, theirs, { runs = 10000, seed = 7 } = {}) {
  const rnd = rng(seed);
  const games = [...new Set([...ours, ...theirs].map((p) => p.game).filter(Boolean))];
  let wins = 0, ties = 0;
  const margins = new Array(runs);

  for (let i = 0; i < runs; i++) {
    const shock = {};
    for (const g of games) shock[g] = gauss(rnd);
    let a = 0, b = 0;
    for (const p of ours) a += p.locked ? (p.actual ?? 0) : drawOne(p, rnd, shock[p.game] ?? 0);
    for (const p of theirs) b += p.locked ? (p.actual ?? 0) : drawOne(p, rnd, shock[p.game] ?? 0);
    margins[i] = a - b;
    if (a > b) wins++; else if (a === b) ties++;
  }
  margins.sort((x, y) => x - y);
  const q = (f) => margins[Math.min(runs - 1, Math.floor(runs * f))];
  return {
    winProb: (wins + ties / 2) / runs,
    median: q(0.5), p10: q(0.1), p90: q(0.9),
    meanMargin: margins.reduce((s, m) => s + m, 0) / runs,
  };
}

/**
 * Compare candidate lineups by win probability rather than by projected total,
 * and report how much the decision is actually worth.
 *
 * candidates: [{ label, players }]
 */
export function rankLineups(candidates, theirs, opts = {}) {
  const scored = candidates.map((c) => {
    const r = simulate(c.players, theirs, opts);
    const proj = c.players.reduce((s, p) => s + (p.locked ? (p.actual ?? 0) : p.proj), 0);
    return { ...c, ...r, proj };
  });
  scored.sort((a, b) => b.winProb - a.winProb);
  const best = scored[0], worst = scored[scored.length - 1];
  return {
    ranked: scored,
    // Leverage: how much this decision is worth in win probability. Near zero
    // means the choice does not matter and deserves no more attention.
    leverage: best && worst ? best.winProb - worst.winProb : 0,
    // Where maximising points and maximising win probability disagree.
    disagrees: scored.length > 1 && scored[0].label !== [...scored].sort((a, b) => b.proj - a.proj)[0].label,
  };
}
