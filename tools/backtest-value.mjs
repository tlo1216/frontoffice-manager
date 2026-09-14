// Two measurements the lineup backtest cannot see, both from data we already
// pull. Local compute only; no model turn produces these numbers.
//
//   node tools/backtest-value.mjs --week 1
//
// 1. ALL-PLAY RECORD. In an eight team league the schedule is small enough to
//    lie. A team's win-loss record says who it happened to draw; its all-play
//    record — its score against all seven other teams, every week — says how
//    good it actually is. The gap between the two is schedule luck, and it is
//    the cleanest signal for whether to buy or sell. Standings never show it.
//
// 2. REPLACEMENT LEVEL, by position. Our pickup bar has been raw season
//    projection compared across positions, which is the wrong comparison: a
//    154 projection at running back and a 154 at receiver are not worth the
//    same, because what is freely available behind them differs. What matters
//    is points above the best freely available player at that position. On a
//    thin position a modest projection is a real add; on a deep one a good
//    projection is noise, because the wire will hand you the same thing next
//    week for nothing.

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const week = Number(args[args.indexOf("--week") + 1]) || 1;
// Your team id, from ESPN_TEAM_ID in .env. Everything else about the league
// comes from the API, so this is the only thing that has to be told.
const MY_TEAM = Number(process.env.ESPN_TEAM_ID ||
  (fs.existsSync(new URL('../.env', import.meta.url))
    ? (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^ESPN_TEAM_ID=([0-9]+)/m) || [])[1]
    : 0) || 0);
if (!MY_TEAM) { console.error('Set ESPN_TEAM_ID in .env so this knows which team is yours.'); process.exit(2); }

function mcp(tool, argsObj) {
  const r = spawnSync(process.execPath, [path.join(REPO, "tools/mcp-call.mjs"), tool, JSON.stringify(argsObj)], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  let out = r.stdout || "";
  const note = out.indexOf("-- Response truncated");
  if (note >= 0) out = out.slice(0, note);
  const end = Math.max(out.lastIndexOf("]"), out.lastIndexOf("}"));
  if (end < 0) throw new Error(`${tool}: no JSON. ${out.slice(0, 160)}`);
  return JSON.parse(out.slice(0, end + 1));
}

const teams = mcp("get_teams", {});
const nameOf = new Map(teams.map((t) => [t.teamId ?? t.id, t.teamName || t.name]));

// --- 1. all-play ------------------------------------------------------------

const scores = [];
for (const teamId of [...nameOf.keys()].sort((a, b) => a - b)) {
  const box = mcp("get_boxscore", { scoring_period_id: week, team_id: teamId });
  const side = box.flatMap((m) => [m.home, m.away]).find((s) => s && s.teamId === teamId);
  if (!side) continue;
  const pts = (side.players || [])
    .filter((p) => !["BE", "IR"].includes(p.lineupSlotName))
    .reduce((s, p) => s + (p.periodActual ?? 0), 0);
  scores.push({ teamId, name: nameOf.get(teamId), pts });
}

scores.sort((a, b) => b.pts - a.pts);
for (const s of scores) {
  s.beat = scores.filter((o) => o.teamId !== s.teamId && s.pts > o.pts).length;
  s.lost = scores.filter((o) => o.teamId !== s.teamId && s.pts < o.pts).length;
}

console.log(`# Value backtest, week ${week}\n`);
console.log("## All-play: what the record would be against everybody\n");
console.log("| Team | Points | All-play | Would-be win % |");
console.log("|---|---|---|---|");
for (const s of scores)
  console.log(
    `| ${s.name}${s.teamId === MY_TEAM ? " **(us)**" : ""} | ${s.pts.toFixed(2)} | ${s.beat}-${s.lost} | ${((s.beat / (scores.length - 1)) * 100).toFixed(0)}% |`,
  );

// --- 2. replacement level ---------------------------------------------------

const SLOT = { QB: 0, RB: 2, WR: 4, TE: 6, "D/ST": 16, K: 17 };
const repl = {};
const pool = {};
for (const [pos, slotId] of Object.entries(SLOT)) {
  let fa = [];
  try {
    fa = mcp("get_free_agents", { position_slot_id: slotId, limit: 40, sort_by: "projection" });
  } catch { /* leave empty */ }
  // Replacement level is the best player actually addable right now. A player
  // on waivers is not addable on demand — he needs a claim we can lose — so he
  // does not set the floor.
  const addable = fa.filter((p) => p.availability !== "WAIVERS" && p.injuryStatus !== "OUT");
  const best = addable.sort((a, b) => b.seasonProjection - a.seasonProjection)[0];
  repl[pos] = best ? best.seasonProjection : 0;
  pool[pos] = { best, addable: addable.length, onWaivers: fa.length - addable.length };
}

console.log("\n## Replacement level: what the wire will give us for free\n");
console.log("| Position | Best freely addable | Projection | Addable now | Behind a claim |");
console.log("|---|---|---|---|---|");
for (const pos of Object.keys(SLOT))
  console.log(
    `| ${pos} | ${pool[pos].best ? pool[pos].best.name : "—"} | ${repl[pos].toFixed(2)} | ${pool[pos].addable} | ${pool[pos].onWaivers} |`,
  );

const roster = mcp("get_rosters", { team_id: MY_TEAM });
const mine = (roster[0] || roster).players || [];

console.log("\n## Our roster, valued against replacement rather than raw projection\n");
console.log("A low number is not a bad player. It means the wire can replace him,");
console.log("so he is the spot to spend on an add, and the piece to include in a trade.\n");
console.log("| Player | Pos | Projection | Replacement | Value over replacement |");
console.log("|---|---|---|---|---|");
const valued = mine
  .map((p) => ({ ...p, vor: p.seasonProjection - (repl[p.position] ?? 0) }))
  .sort((a, b) => a.vor - b.vor);
for (const p of valued)
  console.log(`| ${p.name} | ${p.position} | ${p.seasonProjection.toFixed(2)} | ${(repl[p.position] ?? 0).toFixed(2)} | ${p.vor > 0 ? "+" : ""}${p.vor.toFixed(2)} |`);

console.log("\n## Summary\n");
const us = scores.find((s) => s.teamId === MY_TEAM);
console.log(`- All-play ${us.beat}-${us.lost}: our score beat ${us.beat} of ${scores.length - 1} teams this week.`);
const worst = valued.filter((p) => p.position !== "QB").slice(0, 3);
console.log(`- Cheapest roster spots to upgrade: ${worst.map((p) => `${p.name} (${p.position}, ${p.vor > 0 ? "+" : ""}${p.vor.toFixed(2)})`).join(", ")}.`);
console.log("- Any add has to beat the replacement number for its own position, not a number borrowed from another position.");
