// Weekly backtest. Runs entirely on local compute: one node process, a handful
// of ESPN reads through the MCP, no model turn. A Claude turn only reads the
// summary at the bottom and decides what to retune.
//
//   node tools/backtest.mjs --week 1
//   node tools/backtest.mjs --week 1 --write    (also writes reports/backtest.md)
//
// What it measures, in order of how much it is worth:
//
// 1. LINEUP EFFICIENCY. Points scored by the starters against the best the
//    roster could have scored that week, known after the fact. This is the only
//    category that is purely a decision — the players were already owned, so
//    every point here was free and got left behind. Measured for all eight
//    teams so Tom's number has something to sit against.
//
// 2. PROJECTION CALIBRATION. Actual over projected, per team and per position.
//    ESPN's projections drive the start/sit calls, so a position where they run
//    consistently hot or cold is a parameter worth correcting rather than
//    trusting week to week.
//
// 3. THE COST OF EACH INDIVIDUAL SIT. The single worst bench decision, named,
//    so the retune has something concrete to argue with.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const week = Number(args[args.indexOf("--week") + 1]) || 1;
const doWrite = args.includes("--write");
// Your team id, from ESPN_TEAM_ID in .env. Everything else about the league
// comes from the API, so this is the only thing that has to be told.
const MY_TEAM = Number(process.env.ESPN_TEAM_ID ||
  (fs.existsSync(new URL('../.env', import.meta.url))
    ? (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^ESPN_TEAM_ID=([0-9]+)/m) || [])[1]
    : 0) || 0);
if (!MY_TEAM) { console.error('Set ESPN_TEAM_ID in .env so this knows which team is yours.'); process.exit(2); }

// Starting lineup for this league, from get_league's rosterSlotCounts.
// FLEX is listed last on purpose: fill the strict slots first, then let FLEX
// take the best of whatever is left. FLEX eligibility is a superset of the
// slots above it, which is what makes that greedy order actually optimal.
const SLOTS = [
  { name: "QB", n: 1, pos: ["QB"] },
  { name: "RB", n: 2, pos: ["RB"] },
  { name: "WR", n: 3, pos: ["WR"] },
  { name: "TE", n: 1, pos: ["TE"] },
  { name: "D/ST", n: 1, pos: ["D/ST"] },
  { name: "K", n: 1, pos: ["K"] },
  { name: "FLEX", n: 2, pos: ["RB", "WR", "TE"] },
];

function mcp(tool, argsObj) {
  const r = spawnSync(process.execPath, [path.join(REPO, "tools/mcp-call.mjs"), tool, JSON.stringify(argsObj)], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let out = r.stdout || "";
  // The server appends a note when it trims a long list. Cut it before parsing;
  // it is prose, not JSON.
  const note = out.indexOf("-- Response truncated");
  if (note >= 0) out = out.slice(0, note);
  const end = Math.max(out.lastIndexOf("]"), out.lastIndexOf("}"));
  if (end < 0) throw new Error(`${tool}: no JSON in response. ${out.slice(0, 200)}`);
  return JSON.parse(out.slice(0, end + 1));
}

/** Best score this roster could have put up, knowing the results. */
function bestPossible(players) {
  const pool = players
    .filter((p) => p.lineupSlotName !== "IR")
    .map((p) => ({ ...p, pts: p.periodActual ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const used = new Set();
  const picked = [];
  for (const slot of SLOTS) {
    let filled = 0;
    for (const p of pool) {
      if (filled === slot.n) break;
      if (used.has(p.id) || !slot.pos.includes(p.position)) continue;
      used.add(p.id);
      picked.push({ ...p, bestSlot: slot.name });
      filled++;
    }
  }
  return { total: picked.reduce((s, p) => s + p.pts, 0), picked };
}

// ---------------------------------------------------------------------------

const teams = mcp("get_teams", {});
const nameOf = new Map(teams.map((t) => [t.teamId ?? t.id, t.teamName || t.name || `team ${t.teamId ?? t.id}`]));

const rows = [];
const posAgg = new Map(); // position -> {actual, proj}

for (const teamId of [...nameOf.keys()].sort((a, b) => a - b)) {
  let box;
  try {
    box = mcp("get_boxscore", { scoring_period_id: week, team_id: teamId });
  } catch (e) {
    console.error(`team ${teamId}: ${e.message}`);
    continue;
  }
  const side = box.flatMap((m) => [m.home, m.away]).find((s) => s && s.teamId === teamId);
  if (!side) continue;

  const players = side.players || [];
  const started = players.filter((p) => !["BE", "IR"].includes(p.lineupSlotName));
  const actual = started.reduce((s, p) => s + (p.periodActual ?? 0), 0);
  const projected = started.reduce((s, p) => s + (p.periodProjection ?? 0), 0);
  const best = bestPossible(players);

  // Worst single sit: the biggest gap between someone benched and the starter
  // they should have replaced in a slot they were eligible for.
  let worst = null;
  for (const b of players.filter((p) => p.lineupSlotName === "BE")) {
    for (const s of started) {
      const eligible = b.position === s.position || (["RB", "WR", "TE"].includes(b.position) && s.lineupSlotName === "FLEX");
      if (!eligible) continue;
      const gap = (b.periodActual ?? 0) - (s.periodActual ?? 0);
      if (gap > 0 && (!worst || gap > worst.gap)) worst = { gap, benched: b.name, started: s.name, slot: s.lineupSlotName };
    }
  }

  for (const p of players) {
    const a = posAgg.get(p.position) || { actual: 0, proj: 0, n: 0 };
    a.actual += p.periodActual ?? 0;
    a.proj += p.periodProjection ?? 0;
    a.n++;
    posAgg.set(p.position, a);
  }

  rows.push({
    teamId,
    name: nameOf.get(teamId),
    starters: started,
    actual,
    projected,
    best: best.total,
    left: best.total - actual,
    efficiency: best.total > 0 ? actual / best.total : 1,
    worst,
  });
}

rows.sort((a, b) => b.efficiency - a.efficiency);

// A week still in progress scores every unplayed starter as a zero, which makes
// "left on the bench" and every efficiency number below it wrong, in a direction
// that flatters whoever has fewest players left. ESPN's lineupLocked flag is not
// a usable signal here (it reads false for players who finished days ago), so
// ask the NFL scoreboard which games are actually final.
let unplayed = [];
let unplayedCount = 0;
let scoreboardOk = false;
try {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`);
  const sb = await res.json();
  const live = new Set();
  for (const ev of sb.events || []) {
    const done = ev.status?.type?.completed === true;
    if (done) continue;
    for (const c of ev.competitions?.[0]?.competitors || []) live.add(c.team?.abbreviation);
  }
  scoreboardOk = true;
  const startersLeft = new Map();
  for (const r of rows) for (const p of r.starters || []) if (live.has(p.proTeam)) {
    const k = `${r.name}`;
    startersLeft.set(k, (startersLeft.get(k) || 0) + 1);
  }
  unplayedCount = [...startersLeft.values()].reduce((a, b) => a + b, 0);
  unplayed = [...startersLeft.entries()].map(([t, n]) => `${t} (${n})`);
} catch {
  /* offline: fall through and say the check could not run */
}
const provisional = unplayed.length > 0;

const L = [];
L.push(`# Backtest, week ${week}`);
L.push("");
L.push("Generated locally by `tools/backtest.mjs`. No model turn produced these numbers.");
L.push("");
if (!scoreboardOk) {
  L.push("> Could not reach the NFL scoreboard, so completeness of the week is unverified.");
  L.push("");
}
if (provisional) {
  L.push(`> **PROVISIONAL — week ${week} is not over.** ${unplayedCount} starter(s) across ${unplayed.length} team(s) have not played:`);
  L.push("> " + unplayed.join("; ") + ".");
  L.push("> Unplayed starters count as zero, so every efficiency figure below is a");
  L.push("> ceiling, not a result, and it flatters whoever has fewest players left.");
  L.push("> Re-run after the last game before retuning anything on it.");
  L.push("");
}
L.push("## 1. Lineup efficiency");
L.push("");
L.push("Points scored against the most those same rosters could have scored. Everything");
L.push("in the last column was already owned and already on the roster: it is the part");
L.push("that was decided rather than drafted.");
L.push("");
L.push("| Rk | Team | Scored | Best possible | Left on bench | Efficiency |");
L.push("|---|---|---|---|---|---|");
rows.forEach((r, i) =>
  L.push(
    `| ${i + 1} | ${r.name}${r.teamId === MY_TEAM ? " **(us)**" : ""} | ${r.actual.toFixed(2)} | ${r.best.toFixed(2)} | ${r.left.toFixed(2)} | ${(r.efficiency * 100).toFixed(1)}% |`,
  ),
);

const us = rows.find((r) => r.teamId === MY_TEAM);
const rank = rows.findIndex((r) => r.teamId === MY_TEAM) + 1;
const median = rows[Math.floor(rows.length / 2)];

L.push("");
L.push("## 2. Projection calibration");
L.push("");
L.push("Actual over projected, every rostered player in the league. Above 1.00 means");
L.push("ESPN was too low on that position this week; below means too high. One week is");
L.push("not a trend — this table earns its keep once several weeks are stacked.");
L.push("");
L.push("| Position | Players | Projected | Actual | Actual / projected |");
L.push("|---|---|---|---|---|");
for (const [pos, a] of [...posAgg.entries()].sort((x, y) => y[1].proj - x[1].proj))
  L.push(`| ${pos} | ${a.n} | ${a.proj.toFixed(1)} | ${a.actual.toFixed(1)} | ${a.proj ? (a.actual / a.proj).toFixed(2) : "—"} |`);

L.push("");
L.push("## 3. Worst single sit, per team");
L.push("");
L.push("| Team | Benched | Started instead | Slot | Cost |");
L.push("|---|---|---|---|---|");
for (const r of rows)
  L.push(
    r.worst
      ? `| ${r.name} | ${r.worst.benched} | ${r.worst.started} | ${r.worst.slot} | ${r.worst.gap.toFixed(2)} |`
      : `| ${r.name} | — | — | — | none |`,
  );

L.push("");
L.push("## Summary");
L.push("");
if (us) {
  L.push(`- We scored ${us.actual.toFixed(2)} of a possible ${us.best.toFixed(2)} and left ${us.left.toFixed(2)} on the bench.`);
  L.push(`- That is ${(us.efficiency * 100).toFixed(1)}% efficiency, rank ${rank} of ${rows.length}; the middle of the league is ${(median.efficiency * 100).toFixed(1)}%.`);
  if (us.worst) L.push(`- Worst single call: ${us.worst.benched} on the bench while ${us.worst.started} started at ${us.worst.slot}, costing ${us.worst.gap.toFixed(2)}.`);
  const margin = Math.abs(us.left);
  L.push(`- For scale, the week was decided by a few points, so ${margin.toFixed(2)} left on the bench is ${margin > 3 ? "more than the margin" : "inside the margin"}.`);
}
L.push("");
L.push("Retune candidates are whatever this table shows repeatedly, not once.");

const text = L.join("\n") + "\n";
console.log(text);

if (doWrite) {
  const out = path.join(REPO, "reports", `backtest-week-${week}.md`);
  fs.writeFileSync(out, text);
  console.log(`written: ${out}`);
}
