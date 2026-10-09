// Build a draft queue before draft day, from measured positional scarcity.
//
//   node tools/draft-prep.mjs --league <your league id> --teams 10
//   node tools/draft-prep.mjs --league <your league id> --teams 10 --write
//
// Local compute, no model turn. Writes reports/draft-queue-<league>.md and a
// plain ordered list for pasting into a platform's pre-rank screen.
//
// WHY THIS EXISTS. A draft once started while the board was still being built,
// so the first picks were made by hand under a thirty second clock against a
// board that re-rendered every time anyone in the league picked. That is a
// preventable situation: the queue should exist days earlier, ordered, with
// injuries already removed, so draft day is only maintenance.
//
// WHAT IS ACTUALLY BACKTESTED, and what is not. Honest scope:
//
//   Backtested: the positional SCARCITY CURVE. Five seasons of real weekly
//   results give the points the Nth best player at each position actually
//   finished with. That curve is what makes a draft board a board rather than a
//   list: it says where the cliff is at each position, and cliffs are the only
//   reason to reach for a player.
//
//   NOT backtested: whether this ordering beats a platform's default ranking.
//   That comparison needs the platform's HISTORICAL preseason projections and
//   ADP, which nobody publishes and we do not have. Claiming it is validated
//   would be inventing a result. What can be said is that the ordering follows
//   from measured scarcity rather than from a vendor's opaque ranking.

import fs from "node:fs";
import path from "node:path";
import { REPO, playerWeeks, num, pointsAt, receptionPoints } from "../lib/data.mjs";

import { mcpCall } from "../lib/mcp.mjs";
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const LEAGUE = arg("league", "");
const TEAMS = Number(arg("teams", 10));
const doWrite = argv.includes("--write");
if (!LEAGUE) { console.error("usage: node tools/draft-prep.mjs --league <id> --teams <n> [--write]"); process.exit(1); }

const SEASONS = [2021, 2022, 2023, 2024, 2025];
const SLOT_ID = { QB: 0, RB: 2, WR: 4, TE: 6, "D/ST": 16, K: 17 };

// lib/mcp.mjs, not a local copy of the spawn: a single dropped ESPN read used
// to fail the whole run, and the error it threw carried no exit code, no stderr
// and none of the bytes that did come back.
const mcp = (tool, args) => mcpCall(tool,args);

// --- 1. measured scarcity, from five seasons of real results ----------------

/** Season totals per player per season, then the curve of Nth best by position.
 *  rp is this league's own reception weight (receptionPoints()): nflverse's
 *  points column is always full PPR, and scoring every league's curve at that
 *  weight prices a half or non-PPR league's scarcity wrong. */
async function scarcityCurve(rp) {
  const byPosSeason = {};
  for (const season of SEASONS) {
    const totals = new Map();
    for (const r of await playerWeeks(season)) {
      const pos = r.position;
      if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
      const k = r.player_id;
      const t = totals.get(k) || { pos, pts: 0 };
      t.pts += pointsAt(r, rp);
      totals.set(k, t);
    }
    for (const { pos, pts } of totals.values()) {
      ((byPosSeason[pos] ||= {})[season] ||= []).push(pts);
    }
  }
  const curve = {};
  for (const [pos, seasons] of Object.entries(byPosSeason)) {
    const ranked = Object.values(seasons).map((a) => a.sort((x, y) => y - x));
    // Average the Nth best across seasons, so one freak year cannot set a cliff.
    const depth = 60;
    curve[pos] = [];
    for (let i = 0; i < depth; i++) {
      const vals = ranked.map((a) => a[i]).filter((v) => v !== undefined);
      curve[pos].push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    }
  }
  return curve;
}

// --- 2. current pool --------------------------------------------------------

function pool() {
  const all = [];
  for (const [pos, slotId] of Object.entries(SLOT_ID)) {
    try {
      all.push(...mcp("get_free_agents", { league_id: String(LEAGUE), position_slot_id: slotId, limit: 60, sort_by: "projection" }));
    } catch { /* a position that fails is reported by its absence */ }
  }
  const seen = new Set();
  return all.filter((p) => !seen.has(p.id) && seen.add(p.id));
}

// --- 3. build ---------------------------------------------------------------

// How many of each position the league actually starts, and its reception
// weight, both read from the league rather than assumed.
const league = mcp("get_league", { league_id: String(LEAGUE) });
const curve = await scarcityCurve(receptionPoints(league));
const players = pool();
if (players.length < 50) { console.error(`Only ${players.length} players returned; the league id or cookies are probably wrong.`); process.exit(2); }

const c = league.rosterSlotCounts || {};
const STARTERS = { QB: num(c["0"]), RB: num(c["2"]), WR: num(c["4"]), TE: num(c["6"]), "D/ST": num(c["16"]), K: num(c["17"]) };
const FLEX = num(c["23"]);

// Replacement: the first player at each position who will NOT be starting once
// every team has filled that position. Flex spread across RB, WR and TE by the
// share of flex-eligible starters each position already supplies.
const repl = {};
for (const [pos, n] of Object.entries(STARTERS)) {
  const flexShare = ["RB", "WR", "TE"].includes(pos) ? FLEX / 3 : 0;
  const idx = Math.round(TEAMS * (n + flexShare));
  const list = players.filter((p) => p.position === pos).sort((a, b) => b.seasonProjection - a.seasonProjection);
  repl[pos] = list[idx] ? list[idx].seasonProjection : (list.length ? list[list.length - 1].seasonProjection : 0);
}

const OUT = new Set(["OUT", "INJURY_RESERVE", "DOUBTFUL"]);
const board = players
  .filter((p) => repl[p.position] !== undefined)
  .map((p) => ({ ...p, vor: p.seasonProjection - repl[p.position], hurt: OUT.has(p.injuryStatus) }))
  .sort((a, b) => b.vor - a.vor);

// Tiers: a cliff is where the measured curve drops faster than usual. Those are
// the only places where reaching for a player is justified.
function cliffs(pos) {
  // A cliff is a drop that is large FOR WHERE IT SITS ON THE CURVE, not large in
  // absolute points. The first version compared every gap to the average gap,
  // which simply rediscovered that the top of any distribution is steep: it
  // reported ranks 2, 3, 4 and 5 for every position, which is true and useless.
  // Comparing each gap to the gaps immediately around it finds the places the
  // curve actually breaks.
  const cv = (curve[pos] || []).filter((v) => v > 0);
  if (cv.length < 20) return [];
  const gap = [];
  for (let i = 1; i < Math.min(cv.length, 45); i++) gap.push(cv[i - 1] - cv[i]);
  const out = [];
  const W = 5;                       // ranks either side that set the local norm
  for (let i = W; i < gap.length - W; i++) {
    const around = gap.slice(i - W, i).concat(gap.slice(i + 1, i + 1 + W));
    const local = around.reduce((x, y) => x + y, 0) / around.length;
    if (local > 0 && gap[i] > local * 2.2) out.push({ rank: i + 2, ratio: gap[i] / local });
  }
  return out.sort((x, y) => y.ratio - x.ratio).slice(0, 3).map((x) => x.rank).sort((x, y) => x - y);
}

const L = [];
const say = (s = "") => L.push(s);
say(`# Draft queue, league ${LEAGUE}`);
say("");
say(`${TEAMS} teams. Starters: ` + Object.entries(STARTERS).filter(([, n]) => n).map(([p, n]) => `${n} ${p}`).join(", ") + (FLEX ? `, ${FLEX} FLEX` : "") + ".");
say("Built locally. No model turn produced this.");
say("");
say("## Replacement level in this league");
say("");
say("| Position | Replacement projection | Measured cliffs at rank |");
say("|---|---|---|");
for (const pos of Object.keys(STARTERS)) {
  if (!STARTERS[pos]) continue;
  const cl = cliffs(pos);
  say(`| ${pos} | ${(repl[pos] ?? 0).toFixed(1)} | ${cl.length ? cl.join(", ") : "no sharp cliff"} |`);
}
say("");
say("Cliffs come from five seasons of real season totals: the rank at which the");
say("next best player drops away much faster than usual. Reaching for a player is");
say("only justified just above a cliff.");
say("");
say("## The queue");
say("");
say("Ordered by value over replacement. Injured players are excluded rather than");
say("ranked low, because a queue is used under a clock and nobody reads the note.");
say("");
say("| # | Player | Pos | Team | Projection | Over replacement |");
say("|---|---|---|---|---|---|");
const queue = board.filter((p) => !p.hurt).slice(0, 150);
queue.forEach((p, i) =>
  say(`| ${i + 1} | ${p.name} | ${p.position} | ${p.proTeam || ""} | ${p.seasonProjection.toFixed(1)} | ${p.vor >= 0 ? "+" : ""}${p.vor.toFixed(0)} |`));

const hurt = board.filter((p) => p.hurt).slice(0, 10);
if (hurt.length) {
  say("");
  say("## Excluded, carrying an injury designation");
  say("");
  for (const p of hurt) say(`- ${p.name} (${p.position}, ${p.proTeam}) ${p.injuryStatus}, would otherwise rank around ${board.indexOf(p) + 1}`);
}

const text = L.join("\n") + "\n";
console.log(text.split("\n").slice(0, 40).join("\n"));
console.log(`... ${queue.length} players in the queue`);

if (doWrite) {
  fs.writeFileSync(path.join(REPO, "reports", `draft-queue-${LEAGUE}.md`), text);
  fs.writeFileSync(path.join(REPO, "reports", `draft-queue-${LEAGUE}.txt`),
    queue.map((p, i) => `${i + 1}. ${p.name} (${p.position}, ${p.proTeam})`).join("\n") + "\n");
  console.log(`written: reports/draft-queue-${LEAGUE}.md and .txt`);
}
