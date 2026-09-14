// Lineup decisions by win probability, not by projected points.
//
//   node tools/lineup.mjs --week 1
//   node tools/lineup.mjs --week 1 --runs 20000 --write
//
// Local compute. No model turn produces any number here.
//
// The optimiser everybody ships maximises projected total. That is correct only
// if you do not care about variance, and in a head to head matchup you always
// do. This simulates the matchup ten thousand times with bootstrapped weekly
// distributions and a shared per game shock, then picks the lineup that wins
// most often. It also reports LEVERAGE, which is how much the decision is worth
// at all: at 95 percent to win, the flex call is worth nothing and deserves no
// further thought.

import fs from "node:fs";
import path from "node:path";
import { REPO, rosters, boxscore, games, num } from "../lib/data.mjs";
import { buildPool, simulate, rankLineups } from "../lib/sim.mjs";

const argv = process.argv.slice(2);
const week = Number(argv[argv.indexOf("--week") + 1]) || 1;
const runs = Number(argv[argv.indexOf("--runs") + 1]) || 10000;
const doWrite = argv.includes("--write");
// Your team id, from ESPN_TEAM_ID in .env. Everything else about the league
// comes from the API, so this is the only thing that has to be told.
const MY_TEAM = Number(process.env.ESPN_TEAM_ID ||
  (fs.existsSync(new URL('../.env', import.meta.url))
    ? (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^ESPN_TEAM_ID=([0-9]+)/m) || [])[1]
    : 0) || 0);
if (!MY_TEAM) { console.error('Set ESPN_TEAM_ID in .env so this knows which team is yours.'); process.exit(2); }
const SEASON = 2026;

const STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1, "D/ST": 1, K: 1 };
const FLEX = 2;
const FLEX_OK = new Set(["RB", "WR", "TE"]);

await buildPool();

// Which NFL game each pro team is in this week, for the correlation term.
const sched = (await games()).filter((g) => num(g.season) === SEASON && num(g.week) === week);
const gameOf = new Map();
for (const g of sched) { gameOf.set(g.home_team, g.game_id); gameOf.set(g.away_team, g.game_id); }

const box = await boxscore(week, MY_TEAM);
const sides = box.flatMap((m) => [m.home, m.away]).filter(Boolean);
const us = sides.find((s) => s.teamId === MY_TEAM);
const them = sides.find((s) => s.teamId !== MY_TEAM);
if (!us || !them) { console.error(`No matchup found for team ${MY_TEAM} in week ${week}.`); process.exit(2); }

let owners = {};
try { owners = JSON.parse(fs.readFileSync(path.join(REPO, "league/owners.json"), "utf8")); } catch { /* optional: falls back to team numbers */ }
const who = (id) => (owners[id] && owners[id].name) || `team ${id}`;

/** A finished player contributes his actual score with no variance at all. */
function shape(p) {
  const played = (p.periodActual ?? 0) > 0 || p.locked === true;
  return {
    id: p.id, name: p.name, pos: p.position, slot: p.lineupSlotName,
    proj: p.periodProjection ?? 0, actual: p.periodActual ?? 0,
    game: gameOf.get(p.proTeam) || p.proTeam,
    locked: played,
  };
}

const ourAll = (us.players || []).map(shape);
const theirStarters = (them.players || []).filter((p) => !["BE", "IR"].includes(p.lineupSlotName)).map(shape);
const ourCurrent = ourAll.filter((p) => !["BE", "IR"].includes(p.slot));
const ourBench = ourAll.filter((p) => p.slot === "BE");

// --- candidate lineups ------------------------------------------------------
// Only players who have not played can still be swapped, so candidates differ
// from the current lineup by one live swap at a time. Enumerating every legal
// lineup would be thousands of simulations for decisions that cannot be made.

const liveStarters = ourCurrent.filter((p) => !p.locked);
const liveBench = ourBench.filter((p) => !p.locked);

const candidates = [{ label: "current lineup", players: ourCurrent }];
for (const out of liveStarters) {
  for (const inn of liveBench) {
    const slotOk = out.slot === "FLEX" ? FLEX_OK.has(inn.pos) : inn.pos === out.pos;
    if (!slotOk) continue;
    candidates.push({
      label: `${inn.name} in for ${out.name} at ${out.slot}`,
      players: ourCurrent.map((p) => (p.id === out.id ? { ...inn, slot: out.slot } : p)),
    });
  }
}

const result = rankLineups(candidates, theirStarters, { runs });
const now = simulate(ourCurrent, theirStarters, { runs });

// --- report -----------------------------------------------------------------

const L = [];
const say = (s = "") => L.push(s);
const pct = (x) => (x * 100).toFixed(1) + "%";

say(`# Lineup by win probability, week ${week}`);
say("");
say(`${who(MY_TEAM)} against ${who(them.teamId)}. ${runs.toLocaleString()} simulations, bootstrapped from`);
say("five seasons of real weekly scores, with a shared per game shock so players in");
say("the same NFL game move together. Local compute, no model turn.");
say("");

const ourLocked = ourCurrent.filter((p) => p.locked).reduce((s, p) => s + p.actual, 0);
const theirLocked = theirStarters.filter((p) => p.locked).reduce((s, p) => s + p.actual, 0);
say(`Score so far: **${ourLocked.toFixed(2)}** against **${theirLocked.toFixed(2)}**.`);
say(`Still to play: ${liveStarters.length} of ours, ${theirStarters.filter((p) => !p.locked).length} of theirs.`);
say("");
say(`**Win probability as it stands: ${pct(now.winProb)}.**`);
say(`Expected margin ${now.meanMargin.toFixed(1)}, with a tenth to ninetieth percentile range of ${now.p10.toFixed(1)} to ${now.p90.toFixed(1)}.`);
say("");

if (candidates.length === 1) {
  say("No swap is available: everything that could change has already played.");
} else {
  say("## Candidate lineups");
  say("");
  say("| Lineup | Win probability | Projected total | Points says |");
  say("|---|---|---|---|");
  const byProj = [...result.ranked].sort((a, b) => b.proj - a.proj);
  for (const c of result.ranked.slice(0, 10)) {
    const projRank = byProj.findIndex((x) => x.label === c.label) + 1;
    say(`| ${c.label} | **${pct(c.winProb)}** | ${c.proj.toFixed(1)} | rank ${projRank} |`);
  }
  say("");
  say(`**Leverage: ${pct(result.leverage)}.** That is the spread between the best and worst`);
  say("choice available. " + (result.leverage < 0.02
    ? "Below two points, which means this decision does not matter. Spend the attention elsewhere."
    : result.leverage < 0.05
      ? "Small but real. Worth taking the better option, not worth agonising over."
      : "Large. This is the decision of the week and is worth getting right."));
  say("");
  if (result.disagrees) {
    say("**Points and win probability disagree here.** The highest projected lineup is not");
    say("the one that wins most often, which is the case this tool exists for: when");
    say("trailing you want the wider distribution, and when leading the narrower one.");
  } else {
    say("Points and win probability agree on the best lineup this week.");
  }
}

say("");
say("## What is still live");
say("");
say("| Player | Slot | Projected | NFL game |");
say("|---|---|---|---|");
for (const p of liveStarters) say(`| ${p.name} | ${p.slot} | ${p.proj.toFixed(1)} | ${p.game} |`);
for (const p of theirStarters.filter((p) => !p.locked)) say(`| _${p.name} (theirs)_ | ${p.slot} | ${p.proj.toFixed(1)} | ${p.game} |`);

const shared = liveStarters.filter((p) => theirStarters.some((t) => !t.locked && t.game === p.game));
if (shared.length) {
  say("");
  say("Both sides have someone in the same NFL game, so those outcomes are linked and");
  say("the simulation treats them that way. Independent maths would understate how");
  say("wide this matchup really is.");
}

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) {
  fs.writeFileSync(path.join(REPO, "reports", `lineup-week-${week}.md`), text);
  console.log(`written: reports/lineup-week-${week}.md`);
}
