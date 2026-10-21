// Does your hockey config still describe the league ESPN actually has?
//
//   node tools/nhl-league-verify.mjs                     check league/hockey-league.json
//   node tools/nhl-league-verify.mjs --config other.json check another copy
//   node tools/nhl-league-verify.mjs --json              machine readable
//
// One ESPN read. No writes to ESPN, and it never edits the config: a checker
// that repairs what it checks can only ever report success. Every drifted
// field is printed with ESPN's live value, so filling a fresh config is a
// matter of running this and copying what it says.
//
// WHY THIS EXISTS. Five days before a draft, a config said the roster was
// 9 F, 5 D, 2 G, 1 UTIL, verified against the live league the day before. Read
// again, the live league said 1 C, 1 LW, 1 RW, 7 F, 5 D, 2 G, 1 UTIL. Nothing
// was broken: the commissioner was still setting the league up, and the shape
// changed underneath a config that still carried a verification date proving
// it had once been right.
//
// That is the dangerous kind of stale. A config with no verification date is
// obviously untrusted; one carrying yesterday's date reads as checked. Every
// hockey tool takes roster shape from that file, so a drifted copy does not
// fail, it quietly prices and slots against a league that no longer exists.
// Replacement level is computed from starter counts, so a wrong shape moves
// every value on a draft board without any line of it looking wrong.
//
// A league in the days before its draft is the least stable thing you read:
// the pick clock and the draft date moved twice in one hour in that same
// league, and six scoring values changed in half an hour. RUN THIS BEFORE
// EVERY BOARD BUILD until the draft closes.
//
// Exit 1 when a field something prices off has drifted; 2 when the league
// cannot be read or the config is missing.

import fs from "node:fs";
import path from "node:path";
import { REPO, espnHeaders, num } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";
import { HOCKEY_CONFIG, hockeyLeague } from "../lib/nhl-config.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const AS_JSON = argv.includes("--json");
// --config lets a doctored copy be checked without touching the real file: a
// checker that can only run against the file it might need to flag is a
// checker nobody can test.
const CONFIG_ARG = arg("config", "");
const CONFIG_PATH = CONFIG_ARG ? (path.isAbsolute(CONFIG_ARG) ? CONFIG_ARG : path.join(REPO, CONFIG_ARG)) : HOCKEY_CONFIG;

// ESPN hockey lineup slot ids, as the ESPN MCP's constants carry them.
const SLOT = { 0: "C", 1: "LW", 2: "RW", 3: "F", 4: "D", 5: "G", 6: "UTIL", 7: "BE", 8: "IR", 10: "Rookie" };
// defaultPositionId to position: a DIFFERENT id space from SLOT. Id 4 is
// Defense in both only because ESPN's numbering happens to agree. An id outside
// 1-5 is reported under its raw id rather than guessed at.
const POSNAME = { 1: "C", 2: "LW", 3: "RW", 4: "D", 5: "G" };

const L = hockeyLeague(CONFIG_PATH);
if (!L) {
  console.error(`no hockey config at ${CONFIG_PATH}. Copy league/hockey-league.example.json there, set id, teamId ` +
    "and season, and run this again: every field it does not match is printed with ESPN's live value.");
  process.exit(2);
}
if (!L.id || !Number(L.season)) {
  console.error(`${CONFIG_PATH} has no ${!L.id ? "league id" : "season"}. Set it (season is the year the NHL season ENDS, ` +
    "e.g. 2027 for 2026-27); nothing can be verified against a league that cannot be named.");
  process.exit(2);
}

// How much a drifted field matters.
//
//   block  something PRICES off it. Roster shape, scoring and team count set
//          replacement level, so a wrong value moves every number on the board
//          silently. Draft date, type and clock decide whether you are even in
//          the room on time.
//   warn   said out loud, nothing prices off it: league name, the add limit
//          (strategy, not arithmetic), playoff shape.
//
// The one deliberate leniency: while a league is still being configured,
// EVERY field may move, and a checker that blocks on all of them gets muted.
// So block is reserved for what would make the draft go wrong.
function severity(field) {
  if (/^starters\.|^bench$|^ir$|^scoring\.byStatId\.|^positionLimits\./.test(field)) return "block";
  // A roto or categories league prices nothing off point values: what prices
  // it is WHICH stats are tracked and which way each runs, plus any
  // games-played cap on a position.
  if (/^scoring\.categories\.|^gamesPlayedCaps\./.test(field)) return "block";
  if (/^draft\.(type|date|scheduled|timePerSelection)$|^notDraftedYet$/.test(field)) return "block";
  // Team count blocks: replacement level is teams x starters, so a league that
  // grows from 12 to 18 teams moves every player's value. It once came back
  // "warn" here, and a board built for the old size would have run the draft.
  if (field === "teams") return "block";
  return "warn";
}

function shapeOf(lineupSlotCounts) {
  const starters = {}, other = {};
  for (const [id, n] of Object.entries(lineupSlotCounts || {})) {
    // A slot at zero is not in this league's lineup, whatever it is. Only an
    // unknown slot that actually holds players is a reason to stop.
    if (!num(n)) continue;
    const name = SLOT[Number(id)];
    if (!name) throw new Error(`unknown hockey lineup slot id ${id} holds ${n} player(s): refusing to guess what it is`);
    if (name === "BE" || name === "IR") other[name] = num(n);
    else starters[name] = num(n);
  }
  return { starters, other };
}

const rows = [];
const add = (field, cfg, live) => {
  if (JSON.stringify(cfg) === JSON.stringify(live)) return;
  rows.push({ field, config: cfg, live, severity: severity(field) });
};
const note = (field, live, sev = "warn") => rows.push({ field, config: "-", live, severity: sev, note: true });

const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/${L.season}/segments/0/leagues/${L.id}`;
// nocache: ESPN will serve a settings payload minutes old, which is exactly long
// enough to miss the change this tool exists to catch.
let headers;
try { headers = espnHeaders(); } catch (e) { console.error(e.message); process.exit(2); }
const r = await getJSON(`${base}?view=mSettings&view=mTeam&nocache=${Date.now()}`, { headers });
// A failed read must never become a comparison against an empty settings
// block: every field would "drift" to zero and the real problem (a dead
// cookie, a wrong season year) would be buried under a page of false drift.
if (!r.ok) {
  console.error(`could not read league ${L.id} season ${L.season}: ${r.fatal || r.soft}. ` +
    "A 404 here usually means the season is wrong (hockey seasons are named for the year they end), not the cookie.");
  process.exit(2);
}
const j = r.json;
const s = j.settings;
if (!s || !s.rosterSettings || !s.scoringSettings) {
  console.error(`league ${L.id} answered without settings (keys: ${Object.keys(j || {}).join(", ") || "none"}). Refusing to compare against nothing.`);
  process.exit(2);
}

const live = shapeOf(s.rosterSettings.lineupSlotCounts);
for (const pos of new Set([...Object.keys(L.starters || {}), ...Object.keys(live.starters)]))
  add(`starters.${pos}`, num((L.starters || {})[pos]), num(live.starters[pos]));
add("bench", num(L.bench), num(live.other.BE));
add("ir", num(L.ir), num(live.other.IR));
add("name", String(L.name || "").trim(), String(s.name || "").trim());
add("teams", num(L.teams), num(s.size));

// A ROTO or CATEGORIES league carries points: 1 on every tracked stat, so
// comparing points would only ever read "1 equals 1". What prices a player
// there is which stat ids are tracked and which way each runs (isReverseItem,
// stored as direction 1 or -1 under scoring.categories.{skater,goalie}[]).
// Get the sign backwards and a stat that should be minimised is maximised,
// silently, for every player on the board.
const liveType = String(s.scoringSettings.scoringType || "").toUpperCase();
const isRoto = /ROTO|CATEGOR/.test(liveType) || /ROTO|CATEGOR/.test(String(L.scoring?.type || "").toUpperCase());
if (isRoto) {
  const liveCats = {};
  for (const it of s.scoringSettings.scoringItems || []) liveCats[String(it.statId)] = it.isReverseItem ? -1 : 1;
  const configCats = {};
  for (const kind of ["skater", "goalie"])
    for (const c of L.scoring?.categories?.[kind] || []) configCats[String(c.statId)] = num(c.direction);
  for (const id of new Set([...Object.keys(configCats), ...Object.keys(liveCats)]))
    add(`scoring.categories.${id}`, configCats[id] ?? null, liveCats[id] ?? null);
  add("scoring.type", String(L.scoring?.type || "").toUpperCase(), liveType);
} else {
  const sc = Object.fromEntries((s.scoringSettings.scoringItems || [])
    .filter((i) => num(i.points) !== 0).map((i) => [String(i.statId), num(i.points)]));
  for (const id of new Set([...Object.keys(L.scoring?.byStatId || {}), ...Object.keys(sc)]))
    add(`scoring.byStatId.${id}`, num((L.scoring?.byStatId || {})[id]), num(sc[id]));
}

// Games-played caps (lineupSlotStatLimits on statId 30): how many games a
// position's starters may spend all season. A league with none compares empty
// to empty and adds no row. A limit on any other stat is not a games-played
// cap, so it is reported separately rather than folded in under a guessed name.
const liveGpCaps = {};
const nonGpLimits = [];
for (const [slotId, lim] of Object.entries(s.rosterSettings.lineupSlotStatLimits || {})) {
  if (!lim) continue;
  if (num(lim.statId) !== 30) { nonGpLimits.push(`slot ${slotId} statId ${lim.statId} limit ${lim.limitValue}`); continue; }
  liveGpCaps[SLOT[Number(slotId)] || `slot${slotId}`] = num(lim.limitValue);
}
for (const pos of new Set([...Object.keys(L.gamesPlayedCaps || {}), ...Object.keys(liveGpCaps)]))
  add(`gamesPlayedCaps.${pos}`, num((L.gamesPlayedCaps || {})[pos]), num(liveGpCaps[pos]));
if (nonGpLimits.length) note("lineupSlotStatLimits (non-GP)", nonGpLimits.join("; "));

add("schedule.matchupPeriodCount", num(L.schedule?.matchupPeriodCount), num(s.scheduleSettings?.matchupPeriodCount));
add("schedule.playoffTeamCount", num(L.schedule?.playoffTeamCount), num(s.scheduleSettings?.playoffTeamCount));
// Only compared when the config stores it. A league once shortened its playoff
// rounds from two matchup periods to one and nothing noticed, because the field
// was stored but never read back.
if (L.schedule?.playoffMatchupPeriodLength != null)
  add("schedule.playoffMatchupPeriodLength", num(L.schedule.playoffMatchupPeriodLength), num(s.scheduleSettings?.playoffMatchupPeriodLength));

// A config "none" (no cap) matches either of ESPN's no-cap encodings, -1 or 0.
// A missing live field is reported as missing, never normalised: num() would
// turn undefined into 0 and "none" would then confirm against a block ESPN
// never sent.
const cfgAcq = L.acquisitions?.perMatchupPeriod;
const liveRaw = s.acquisitionSettings?.matchupAcquisitionLimit;
const liveAcq = liveRaw == null ? "missing" : num(liveRaw);
if (cfgAcq === "none") add("acquisitions.perMatchupPeriod", "none", liveAcq === -1 || liveAcq === 0 ? "none" : liveAcq);
else add("acquisitions.perMatchupPeriod", cfgAcq == null ? null : num(cfgAcq), liveAcq);

add("draft.type", String(L.draft?.type || ""), String(s.draftSettings?.type || ""));
// The pick clock. Block: too high and you budget time you do not have, too
// low and you plan for a clock that already expired.
add("draft.timePerSelection", num(L.draft?.timePerSelection), num(s.draftSettings?.timePerSelection));
const liveDate = s.draftSettings?.date ? new Date(s.draftSettings.date).toISOString() : "";
add("draft.date", String(L.draft?.date || ""), liveDate);
add("draft.scheduled", !!L.draft?.scheduled, !!liveDate);
add("notDraftedYet", !!L.notDraftedYet, !(j.draftDetail?.drafted));

// Position limits (a roster-wide cap, e.g. at most 4 goalies), keyed by
// defaultPositionId. -1 is ESPN's spelling of "no cap"; every other value,
// 0 included, is real and checked both ways.
const liveLimits = {};
for (const [id, v] of Object.entries(s.rosterSettings.positionLimits || {})) {
  const n = num(v);
  if (n < 0) continue;
  liveLimits[POSNAME[Number(id)] || `id${id}`] = n;
}
for (const pos of new Set([...Object.keys(L.positionLimits || {}), ...Object.keys(liveLimits)]))
  add(`positionLimits.${pos}`, num((L.positionLimits || {})[pos]), num(liveLimits[pos]));

// Not a config field: nobody configures how many people have joined. Reported
// because a snake draft with unclaimed seats is a different draft.
const owned = (j.teams || []).filter((t) => (t.owners || []).length).length;
if (owned < num(s.size)) note("seats claimed", `${owned} of ${num(s.size)}`);

// Your team, if the config names one: a teamId that is not in the league
// points every write tool at nobody, or at somebody else.
if (L.teamId && !(j.teams || []).some((t) => Number(t.id) === Number(L.teamId)))
  rows.push({ field: "teamId", config: L.teamId, live: `not one of ${(j.teams || []).map((t) => t.id).join(", ")}`, severity: "block" });

const hoursUntilDraft = s.draftSettings?.date ? (Number(s.draftSettings.date) - Date.now()) / 3600000 : null;
const summary = `draft in ${hoursUntilDraft === null ? "no date" : hoursUntilDraft.toFixed(2) + "h"}, ` +
  `${num(s.draftSettings?.timePerSelection)}s/pick, seats ${owned} of ${num(s.size)}, ` +
  `matchup period ${num(j.status?.currentMatchupPeriod)}`;

const blocking = rows.filter((x) => x.severity === "block");

if (AS_JSON) {
  console.log(JSON.stringify({ config: CONFIG_PATH, summary, rows, blocking: blocking.length }, null, 2));
  process.exit(blocking.length ? 1 : 0);
}

console.log("HOCKEY LEAGUE VERIFY\n");
console.log(`config read: ${CONFIG_PATH}`);
console.log(`  ${summary}\n`);
if (!rows.length) {
  console.log(`${path.basename(CONFIG_PATH)} matches ESPN on every field checked.`);
  process.exit(0);
}
for (const x of rows) {
  console.log(`  ${x.severity === "block" ? "DRIFTED" : "note   "} ${x.field}`);
  if (x.note) console.log(`          ${x.live}`);
  else {
    console.log(`          config: ${JSON.stringify(x.config)}`);
    console.log(`          ESPN:   ${JSON.stringify(x.live)}`);
  }
}
console.log("");
console.log(blocking.length
  ? `${blocking.length} field(s) that something prices off have drifted. Update ${path.basename(CONFIG_PATH)}\n` +
    "and set verifiedAgainstLiveLeague to today, THEN rebuild any board built before now."
  : "Nothing that prices anything has drifted.");
process.exit(blocking.length ? 1 : 0);
