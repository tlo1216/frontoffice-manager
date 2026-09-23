// Every injury and practice flag on your roster, with what it is measured to
// cost.
//
//   node tools/injury-check.mjs
//   node tools/injury-check.mjs --league 12345678 --team 3
//
// One ESPN request plus two cached feeds. No model turn.
//
// WHY BOTH SOURCES. ESPN publishes one word, the game status, and it is the
// LEAST informative of the three things a team reports during the week. A
// backtest over five seasons of nflverse injury reports found that practice
// participation separates players better than the status word does: two men
// both listed QUESTIONABLE are not the same bet if one practised in full and
// the other did not. So the status comes from ESPN, which is live, and the
// practice column comes from the nflverse weekly injury report, which is the
// detail ESPN's own app does not surface. Practice reports publish Wednesday
// through Friday, so early in a week the practice column will legitimately be
// empty, and says so rather than guessing.
//
// THE COSTS ARE READ, NOT TYPED. They live in league/measured.json, through
// lib/measured.mjs, with the literal below only as the fallback for a fresh
// checkout that has not run a backtest yet. Typing a measured figure directly
// into a tool is how a number quietly outlives the sample it came from: a
// bucket that looked fine at 200 player-weeks can still be running the show
// after the harness that produced it has moved on to a better estimate.
// Reading through the same key every time a cost is needed is what makes that
// impossible, rather than a rule asking a human to keep two files in sync.
//
// A MAN WHO IS OUT IS NOT A PROJECTION PROBLEM. Everything below is
// degradation for a player who PLAYS. Somebody who cannot play is a lineup
// hole, flagged separately and never discounted instead of benched.

import fs from "node:fs";
import path from "node:path";
import { REPO, injuries, idMap, espnHeaders, espnConfig } from "../lib/data.mjs";
import { measured } from "../lib/measured.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const cfg = espnConfig();
const SEASON = Number(arg("season", cfg.season));
const LEAGUE = arg("league", cfg.leagueId);
const TEAM = Number(arg("team", cfg.teamId));
const doWrite = argv.includes("--write");
if (!LEAGUE || !TEAM) { console.error("Set ESPN_LEAGUE_ID and ESPN_TEAM_ID in .env, or pass --league and --team."); process.exit(2); }

// espnHeaders() is the one credential loader for the whole repo, in
// lib/data.mjs. A tool that carries its own copy of the cookie read is a tool
// that can drift from every other one the day the read changes.
const headers = espnHeaders();
const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const SLOT = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 23: "FLEX", 20: "BE", 21: "IR" };

// Measured costs: points per game against the player's own average, for a man
// who plays. Split by practice bucket rather than lumped into one QUESTIONABLE
// figure, because a questionable man who practised fully is a different bet
// from one who did not, and collapsing them into one number hides that.
const COST = {
  "no practice": measured("factor.practiceNone", -1.26),
  limited: measured("factor.practiceLimited", -0.68),
  "full practice": measured("factor.practiceFull", -0.31),
  questionable: {
    "no practice": measured("factor.questionableNoPractice", -1.26),
    limited: measured("factor.questionableLimited", -1.06),
    "full practice": measured("factor.questionableFullPractice", -1.16),
  },
};
const practiceBucket = (p) => {
  const t = (p || "").trim().toLowerCase();
  if (t.startsWith("did not")) return "no practice";
  if (t.startsWith("limited")) return "limited";
  if (t.startsWith("full")) return "full practice";
  return null;
};

// nflverse practice reports for the most recent published week
let practiceBy = new Map(), practiceWeek = null, espnOf = new Map();
try {
  const inj = await injuries(SEASON);
  practiceWeek = Math.max(...inj.map((r) => Number(r.week) || 0));
  espnOf = await idMap(SEASON);
  for (const r of inj) {
    if (Number(r.week) !== practiceWeek || !r.gsis_id) continue;
    const espnId = espnOf.get(r.gsis_id);
    if (espnId) practiceBy.set(String(espnId), { practice: r.practice_status, part: r.report_primary_injury, status: r.report_status });
  }
} catch (e) {
  console.error("practice reports unavailable: " + e.message);
}

const L = [];
const say = (s = "") => L.push(s);
say("# Injury and practice check");
say("");
say(`${new Date().toLocaleString()}. Status from ESPN, live. Practice participation from the`);
say(practiceWeek ? `week ${practiceWeek} injury report, ${practiceBy.size} players matched.` : "injury report, which is not published yet this week.");
say("");
say("Costs are measured on five seasons against the player's own average, for a");
say("player who PLAYS. Practice separates better than the status word, so a");
say("questionable man who practised fully is a different bet from one who did not.");
say("");

let j;
try {
  j = await fetch(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/${cfg.sport}/seasons/${SEASON}` +
    `/segments/0/leagues/${LEAGUE}?view=mRoster&nocache=${Math.random()}`, { headers }).then((r) => r.json());
} catch (e) { say(`Could not read the league: ${e.message}`); console.log(L.join("\n")); process.exit(2); }
const t = (j.teams || []).find((x) => x.id === TEAM);
if (!t) { say(`Team ${TEAM} not found in league ${LEAGUE}.`); console.log(L.join("\n")); process.exit(2); }

const rows = [];
for (const e of t.roster?.entries || []) {
  const p = e.playerPoolEntry.player;
  const status = p.injuryStatus && p.injuryStatus !== "ACTIVE" ? p.injuryStatus : null;
  const pr = practiceBy.get(String(p.id));
  const bucket = pr ? practiceBucket(pr.practice) : null;
  if (!status && !bucket) continue;                  // healthy and not on the report
  const slot = SLOT[e.lineupSlotId] || String(e.lineupSlotId);
  const starting = slot !== "BE" && slot !== "IR";
  let cost = null;
  if (status === "QUESTIONABLE") {
    // No practice report yet is missing information, not bad news, so it reads
    // as the limited bucket rather than defaulting to the worst case.
    const b = bucket && COST.questionable[bucket] !== undefined ? bucket : "limited";
    cost = COST.questionable[b];
  } else if (bucket) cost = COST[bucket];
  rows.push({ name: p.fullName, pos: POS[p.defaultPositionId] || "?", slot, starting, status, bucket, part: pr?.part, cost });
}

if (!rows.length) {
  say("Nothing flagged. Every rostered player is active and off the report.");
} else {
  rows.sort((a, b) => (b.starting - a.starting) || ((a.cost ?? 0) - (b.cost ?? 0)));
  say("| Slot | Player | Pos | ESPN status | Practice | Body part | Measured cost |");
  say("|---|---|---|---|---|---|---|");
  for (const r of rows)
    say(`| ${r.starting ? `**${r.slot}**` : r.slot} | ${r.name} | ${r.pos} | ${r.status || "active"} | ${r.bucket || "not reported yet"} | ${r.part || "-"} | ${r.cost !== null ? r.cost.toFixed(2) : "-"} |`);
  say("");
  const out = rows.filter((r) => r.starting && /^(OUT|INJURY_RESERVE|DOUBTFUL)$/.test(r.status || ""));
  if (out.length) {
    say(`**Start someone else:** ${out.map((r) => `${r.name} (${r.status})`).join(", ")}. That is a lineup hole, not a discount.`);
    say("");
  }
  const worst = rows.filter((r) => r.starting && r.cost !== null && r.cost <= -1.5);
  if (worst.length) {
    say(`**Worth a second look before kickoff:** ${worst.map((r) => `${r.name} ${r.cost.toFixed(2)}`).join(", ")}.`);
    say("");
  }
}

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) {
  fs.writeFileSync(path.join(REPO, "reports", "injury-check.md"), text);
  console.log("written: reports/injury-check.md");
}
