// Bye weeks for every player in a league's pool, built from the real schedule
// rather than assumed.
//
//   node tools/bye-map.mjs --league 12345678
//   node tools/bye-map.mjs --league 12345678 --write
//
// Local compute, no model turn. Prints a JSON object of { "Player Name": week }.
//
// WHY THIS IS ITS OWN TOOL, SEPARATE FROM ANY DRAFT OR KEEPER LOGIC. Any rule
// that refuses to stack too many starters on one bye week (a keeper league's
// draft constraint, a season-long roster-construction check) is worth exactly
// nothing without a real map to check it against. A tool that GUESSES bye
// weeks, or assumes last year's, is worse than one that admits it cannot see
// them. So the map is built from this season's real schedule, here, once,
// before it is needed, rather than baked into whatever consumes it.
//
// This is also why lib/byes.mjs derives bye weeks from the schedule again at
// read time (see its own header) rather than reading a file like this one: a
// written map is correct the day it is built and rots the day a player
// changes NFL team. Use this when you want the map as a portable JSON object
// (to paste into your own draft tooling, or to eyeball the spread of byes
// across a league's player pool before a draft); use lib/byes.mjs when you
// want a bye that cannot go stale.

import fs from "node:fs";
import path from "node:path";
import { REPO, games, espnHeaders, espnConfig } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const LEAGUE = arg("league", "");
const SEASON = Number(arg("season", espnConfig().season));
const doWrite = argv.includes("--write");
if (!LEAGUE) { console.error("--league is required, e.g. --league 12345678. Pass any league id you can read, not only ESPN_LEAGUE_ID."); process.exit(2); }

const headers = espnHeaders();

// Which weeks each NFL team plays, from the real schedule. The gap is the bye.
const sched = (await games()).filter((g) => Number(g.season) === SEASON);
const plays = new Map();
for (const g of sched) for (const t of [g.home_team, g.away_team]) {
  if (!plays.has(t)) plays.set(t, new Set());
  plays.get(t).add(Number(g.week));
}
// nflverse and ESPN disagree on three abbreviations. An unmatched code reads as
// "no bye", which is the most dangerous possible wrong answer in a format where
// a crowded week ends the season.
const ALIAS = { LAR: "LA", WSH: "WAS", JAX: "JAC" };
const byeOfTeam = new Map();
for (const [t, weeks] of plays) {
  for (let k = 1; k <= 18; k++) if (!weeks.has(k)) { byeOfTeam.set(t, k); break; }
}
const teamBye = (code) => byeOfTeam.get(code) ?? byeOfTeam.get(ALIAS[code]) ?? null;

const PRO = { 1:"ATL",2:"BUF",3:"CHI",4:"CIN",5:"CLE",6:"DAL",7:"DEN",8:"DET",9:"GB",10:"TEN",11:"IND",12:"KC",
  13:"LV",14:"LAR",15:"MIA",16:"MIN",17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"PHI",22:"ARI",23:"PIT",24:"LAC",
  25:"SF",26:"SEA",27:"TB",28:"WSH",29:"CAR",30:"JAX",33:"BAL",34:"HOU" };

const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE}`;
const out = {};
let missing = 0;
for (const slot of [0, 2, 4, 6, 16, 17]) {
  const res = await getJSON(`${base}?view=kona_player_info&nocache=${Math.random()}`, {
    headers: { ...headers, "x-fantasy-filter": JSON.stringify({ players: {
      filterSlotIds: { value: [slot] }, limit: 120,
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "PPR" } } }) } });
  if (!res.ok) continue;
  for (const p of res.json.players || []) {
    const pl = p.player;
    const bye = teamBye(PRO[pl.proTeamId]);
    if (bye) out[pl.fullName] = bye;
    else missing++;
  }
}

const n = Object.keys(out).length;
if (n < 100) { console.error(`only ${n} players mapped; that is not a trustworthy map`); process.exit(2); }

const spread = {};
for (const w of Object.values(out)) spread[w] = (spread[w] || 0) + 1;
console.error(`${n} players mapped, ${missing} without a bye.`);
console.error("players per bye week: " + Object.entries(spread).sort((a, b) => a[0] - b[0])
  .map(([w, c]) => `${w}:${c}`).join("  "));
console.log(JSON.stringify(out));

if (doWrite) {
  const f = path.join(REPO, "reports", `bye-map-${LEAGUE}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 0) + "\n");
  console.error("written: " + path.relative(REPO, f));
}
