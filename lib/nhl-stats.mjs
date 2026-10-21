// The NHL's own APIs: historical skater and goalie stats, per-game logs, and
// the season schedule, plus a cross-check of ESPN's hockey schedule against
// the NHL's. Both NHL hosts are free, need no key and are not blocked:
//
//   api.nhle.com/stats/rest   season reports (summary, realtime, faceoffs, ...)
//   api-web.nhle.com/v1       game logs, standings, schedules
//
// EVERY CLAIM BELOW WAS CHECKED AGAINST THE LIVE ENDPOINT IN SEPTEMBER 2026,
// not carried over from somebody's README. A request that cannot throw is not
// the same claim as a request that was actually checked.
//
// SEASON ID FORMAT. Both NHL hosts use "YYYYYYYY", start year then end year,
// e.g. 20262027. ESPN's convention is the single END year (season 2027 for the
// same 2026-27 season). espnSeasonToNhlSeasonId() is the one place that
// conversion happens, so a caller holding ESPN's season never has to remember
// to subtract one and concatenate by hand.
//
// LIMIT=-1 RETURNS EVERYTHING. skater/summary?limit=-1 for 2025-26 answered
// total 977 and 977 rows; limit=100 answered total 977 and 100 rows. It is not
// a large page size, it is the whole array, so there is no paging loop here.
// Row counts across three seasons, where the bands below come from:
//   skater/summary: 2023-24 958, 2024-25 963, 2025-26 977
//   goalie/summary: 2023-24 98,  2024-25 105, 2025-26 100
// A season not yet played answers total 0: a REAL zero, not a failure, which is
// why the row bands are only applied to a season the caller says was played.
//
// REPORT NAMES, found by requesting each candidate and reading the fields back:
//   summary            goals, assists, points, shots, TOI, ...
//   realtime           hits, blockedShots, giveaways, takeaways
//   faceoffwins        totalFaceoffWins, totalFaceoffLosses (raw counts)
//   faceoffpercentages rates only, no counts; not used here
//   bios, shootout     exist, but their totals (1182, 1157) do not match the
//                      season's skater universe: they are CAREER aggregates,
//                      so the season row bands here must never be applied to
//                      them.
//
// GAME TYPE 2 IS THE REGULAR SEASON, verified rather than assumed: the game
// log for a known star under /2 for 2025-26 returned 82 games, the first with
// gameId 2025021311, which decodes as season 2025, type 02, game 1311, dated
// mid-April, before the playoffs.
//
// THE 2026-27 CLUB SCHEDULE CARRIES 84 REGULAR SEASON GAMES PER TEAM, not the
// 82 a reader expects from memory (EDM: 88 games, 4 preseason and 84 regular).
// Recorded as observed rather than clamped to 82. SEASON_MAX_GAMES is set from
// the number actually seen, with headroom.
//
// TTL. 24h for a finished season (its numbers no longer move); 1h for the
// season in progress or about to start. isCompletedSeasonId() draws the line
// at June 1 of the season's end year, after every playoff has finished.
//
// THIS FILE THROWS INSTEAD OF RETURNING AN EMPTY ARRAY. Everything here feeds a
// backtest or a board build that reads several seasons at once, and a caller
// who gets an empty array for one broken season and does not notice fits on
// two seasons instead of three with nothing saying so. Throwing with what was
// actually observed (status, row count, first row) makes that loud at the one
// moment it is cheap to notice.

import fs from "node:fs";
import path from "node:path";
import { REPO } from "./data.mjs";
import { getJSON } from "./net.mjs";

const CACHE_DIR = path.join(REPO, "tools", ".cache", "nhl");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const HOUR_MS = 60 * 60 * 1000;

// Chosen bands, not measurements: a real season row count landing outside one
// is the refutation, and the fix is to widen it with the new count in hand.
export const TTL_COMPLETED_HOURS = 24;
export const TTL_CURRENT_HOURS = 1;
const TTL_COMPLETED_MS = TTL_COMPLETED_HOURS * HOUR_MS;
const TTL_CURRENT_MS = TTL_CURRENT_HOURS * HOUR_MS;

const SKATER_MIN_ROWS = 900;
const SKATER_MAX_ROWS = 1100;
const GOALIE_MIN_ROWS = 80;
const GOALIE_MAX_ROWS = 150;
const NHL_TEAM_COUNT = 32;
const SEASON_MAX_GAMES = 90; // 84 regular season games observed for 2026-27, plus preseason and room

export const GAME_TYPE_PRESEASON = 1;
export const GAME_TYPE_REGULAR = 2; // verified against a known game id, see header

// ---------------------------------------------------------------------------
// season id helpers
// ---------------------------------------------------------------------------

/** ESPN's single-year season (e.g. 2027) to the NHL API's seasonId (e.g.
 *  "20262027"). The one place this conversion happens; see header. */
export function espnSeasonToNhlSeasonId(espnSeason) {
  const n = Number(espnSeason);
  // Number("") and Number(null) are 0, which would build "-10" silently; a
  // real ESPN hockey season is a four digit year.
  if (espnSeason === "" || espnSeason == null || !Number.isInteger(n) || n < 1000 || n > 9999)
    throw new Error(`espnSeasonToNhlSeasonId: not a season year: ${espnSeason}`);
  return `${n - 1}${n}`;
}

/** The ESPN hockey season (end year) a date falls in. A new season's schedule
 *  starts in the autumn, so anything from August on belongs to next year's
 *  season number. */
export function espnHockeySeason(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

/** Is `seasonId` ("20252026" or 20252026) a season already over: its end year
 *  is behind June 1. Every NHL playoff finishes before then. */
export function isCompletedSeasonId(seasonId) {
  const s = String(seasonId);
  if (s.length !== 8) throw new Error(`isCompletedSeasonId: expected an 8 digit seasonId like 20252026, got ${seasonId}`);
  const endYear = Number(s.slice(4, 8));
  return Date.now() > Date.UTC(endYear, 5, 1); // month 5 = June, 0 indexed
}

const ttlFor = (seasonId) => (isCompletedSeasonId(seasonId) ? TTL_COMPLETED_MS : TTL_CURRENT_MS);

// ---------------------------------------------------------------------------
// disk cache, one JSON file per key
// ---------------------------------------------------------------------------

const cacheFile = (key) => path.join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);

function loadCache(key, ttlMs) {
  const file = cacheFile(key);
  if (!fs.existsSync(file)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    return Date.now() - c.fetchedAt < ttlMs ? c.data : null;
  } catch { return null; } // a corrupt cache file is no cache, not a crash
}

// Written to a temporary file and renamed into place, so a run killed mid
// write leaves the old cache or none, never half a JSON file.
function saveCache(key, data) {
  const file = cacheFile(key);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ data, fetchedAt: Date.now() }));
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
    console.warn(`nhl-stats: cache not written for ${key}: ${e.message}`);
  }
}

/** Fetch one stats report, assert proof of life, cache it. Throws on a bad
 *  fetch, a missing data array, or a row count outside the band. */
async function fetchReport({ key, url, minRows, maxRows, ttlMs, forceRefresh, extraCheck }) {
  if (!forceRefresh) { const c = loadCache(key, ttlMs); if (c) return c; }

  const res = await getJSON(url, { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`nhl-stats ${key}: fetch failed for ${url} (${res.fatal || res.soft})`);

  const data = res.json?.data;
  if (!Array.isArray(data))
    throw new Error(`nhl-stats ${key}: response carried no data array. Top level keys seen: ${Object.keys(res.json || {}).join(", ") || "(none)"}. URL: ${url}`);
  if (minRows != null && (data.length < minRows || data.length > maxRows))
    throw new Error(`nhl-stats ${key}: got ${data.length} rows, expected between ${minRows} and ${maxRows}. ` +
      `First row: ${JSON.stringify(data[0] ?? null).slice(0, 200)}. URL: ${url}`);
  if (extraCheck) { const why = extraCheck(data); if (why) throw new Error(`nhl-stats ${key}: ${why}. URL: ${url}`); }

  saveCache(key, data);
  return data;
}

// ---------------------------------------------------------------------------
// season reports
// ---------------------------------------------------------------------------

const STATS_HOST = "https://api.nhle.com/stats/rest/en";

// FILTER OPTIONS ARE PART OF THE URL AND THE CACHE KEY. An earlier version
// spread opts into the fetch, which read only two of them, so a caller's
// { gameTypeId: 2 } was dropped in silence and the combined regular season
// plus playoff totals came back. Now gameTypeId is appended to cayenneExp, the
// cache key carries it (a filtered call never reads an unfiltered file), and an
// option this file does not recognise throws instead of vanishing.
const REPORT_OPTS = new Set(["gameTypeId", "forceRefresh", "extraCheck"]);
export function reportUrl(report, seasonId, opts = {}) {
  const unknown = Object.keys(opts).filter((k) => !REPORT_OPTS.has(k));
  if (unknown.length)
    throw new Error(`nhl-stats ${report}: unrecognised option(s) ${unknown.join(", ")}. Known: ${[...REPORT_OPTS].join(", ")}. Refusing to drop a filter silently.`);
  let exp = `seasonId=${seasonId}`;
  if (opts.gameTypeId != null) {
    const g = Number(opts.gameTypeId);
    if (!Number.isInteger(g) || g < 1 || g > 3) throw new Error(`nhl-stats ${report}: gameTypeId must be 1, 2 or 3, got ${opts.gameTypeId}`);
    exp += ` and gameTypeId=${g}`;
  }
  return `${STATS_HOST}/${report}?limit=-1&cayenneExp=${exp.replace(/ /g, "%20")}`;
}
export function reportKey(base, seasonId, opts = {}) {
  return opts.gameTypeId != null ? `${base}-${seasonId}-gt${Number(opts.gameTypeId)}` : `${base}-${seasonId}`;
}

const seasonReport = (report, base, minRows, maxRows) => (seasonId, opts = {}) => fetchReport({
  key: reportKey(base, seasonId, opts), url: reportUrl(report, seasonId, opts),
  minRows, maxRows, ttlMs: ttlFor(seasonId), forceRefresh: opts.forceRefresh, extraCheck: opts.extraCheck,
});

/** Season skater totals for a PLAYED season (8 digit seasonId). Throws when
 *  the row count is outside [900, 1100], including the real zero of a season
 *  not yet played: every caller is expected to name a played season. */
export const skaterSummary = seasonReport("skater/summary", "skater-summary", SKATER_MIN_ROWS, SKATER_MAX_ROWS);
/** Season goalie totals for a played season. Same contract. */
export const goalieSummary = seasonReport("goalie/summary", "goalie-summary", GOALIE_MIN_ROWS, GOALIE_MAX_ROWS);
/** Hits, blocked shots, giveaways, takeaways per skater for a played season. */
export const skaterRealtime = seasonReport("skater/realtime", "skater-realtime", SKATER_MIN_ROWS, SKATER_MAX_ROWS);
/** Faceoff wins and losses per skater (raw counts) for a played season. */
export const skaterFaceoffs = seasonReport("skater/faceoffwins", "skater-faceoffwins", SKATER_MIN_ROWS, SKATER_MAX_ROWS);

// ---------------------------------------------------------------------------
// per-game logs
// ---------------------------------------------------------------------------

const WEB_HOST = "https://api-web.nhle.com/v1";

/**
 * One player's game log for one season and game type.
 *
 * @param {number|string} playerId  the NHL's own id; ESPN and the NHL do not share ids
 * @param {number|string} season    8 digit NHL seasonId, e.g. 20252026
 * @param {number} gameType         GAME_TYPE_REGULAR (2) or GAME_TYPE_PRESEASON (1)
 * @returns {Promise<{ seasonId, gameTypeId, games: object[] }>}
 */
export async function playerGameLog(playerId, season, gameType = GAME_TYPE_REGULAR, opts = {}) {
  const key = `gamelog-${playerId}-${season}-${gameType}`;
  if (!opts.forceRefresh) { const c = loadCache(key, ttlFor(season)); if (c) return c; }

  const res = await getJSON(`${WEB_HOST}/player/${playerId}/game-log/${season}/${gameType}`, { timeoutMs: 15000 });
  const tag = `nhl-stats playerGameLog(${playerId}, ${season}, ${gameType})`;
  if (!res.ok) throw new Error(`${tag}: fetch failed (${res.fatal || res.soft})`);
  const json = res.json;
  if (!Array.isArray(json?.gameLog))
    throw new Error(`${tag}: no gameLog array. Top level keys: ${Object.keys(json || {}).join(", ") || "(none)"}`);
  if (Number(json.gameTypeId) !== Number(gameType))
    throw new Error(`${tag}: asked for gameTypeId ${gameType}, the NHL answered ${json.gameTypeId}. Refusing a response for a different game type.`);
  // A healthy scratch legitimately logs 0 games, so there is no floor, only a
  // ceiling no single season can exceed.
  if (json.gameLog.length > SEASON_MAX_GAMES)
    throw new Error(`${tag}: ${json.gameLog.length} games logged, more than a season (max ${SEASON_MAX_GAMES}) can produce.`);

  const out = { seasonId: json.seasonId, gameTypeId: json.gameTypeId, games: json.gameLog };
  saveCache(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// teams and schedules
// ---------------------------------------------------------------------------

/** The 32 current NHL team abbreviations, read live from the standings rather
 *  than a hand typed table that an expansion or relocation would silently
 *  outdate. Throws unless there are exactly 32. */
export async function nhlTeamAbbrevs(opts = {}) {
  const key = "standings-now";
  if (!opts.forceRefresh) { const c = loadCache(key, TTL_COMPLETED_MS); if (c) return c; }

  const res = await getJSON(`${WEB_HOST}/standings/now`, { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`nhl-stats nhlTeamAbbrevs: fetch failed (${res.fatal || res.soft})`);
  const standings = res.json?.standings;
  if (!Array.isArray(standings))
    throw new Error(`nhl-stats nhlTeamAbbrevs: no standings array. Top level keys: ${Object.keys(res.json || {}).join(", ") || "(none)"}`);
  const abbrevs = standings.map((s) => s.teamAbbrev?.default).filter(Boolean).sort();
  if (standings.length !== NHL_TEAM_COUNT || abbrevs.length !== NHL_TEAM_COUNT)
    throw new Error(`nhl-stats nhlTeamAbbrevs: ${standings.length} standings rows and ${abbrevs.length} abbreviations, expected exactly ${NHL_TEAM_COUNT}.`);

  saveCache(key, abbrevs);
  return abbrevs;
}

/** The 7 day window /v1/schedule/{date} returns for "YYYY-MM-DD". Always the
 *  short TTL: this is a live, day-of view. */
export async function scheduleForDate(dateStr, opts = {}) {
  const key = `schedule-date-${dateStr}`;
  if (!opts.forceRefresh) { const c = loadCache(key, TTL_CURRENT_MS); if (c) return c; }

  const res = await getJSON(`${WEB_HOST}/schedule/${dateStr}`, { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`nhl-stats scheduleForDate(${dateStr}): fetch failed (${res.fatal || res.soft})`);
  const gameWeek = res.json?.gameWeek;
  if (!Array.isArray(gameWeek))
    throw new Error(`nhl-stats scheduleForDate(${dateStr}): no gameWeek array. Top level keys: ${Object.keys(res.json || {}).join(", ") || "(none)"}`);
  if (gameWeek.length !== 7)
    throw new Error(`nhl-stats scheduleForDate(${dateStr}): gameWeek carried ${gameWeek.length} days, expected exactly 7.`);

  const out = { requested: dateStr, days: gameWeek };
  saveCache(key, out);
  return out;
}

/** One team's full season schedule, every game type. `nhlSeasonId` is the 8
 *  digit form, e.g. 20262027. */
export async function clubScheduleSeason(teamAbbrev, nhlSeasonId, opts = {}) {
  const key = `club-schedule-${teamAbbrev}-${nhlSeasonId}`;
  if (!opts.forceRefresh) { const c = loadCache(key, ttlFor(nhlSeasonId)); if (c) return c; }

  const tag = `nhl-stats clubScheduleSeason(${teamAbbrev}, ${nhlSeasonId})`;
  const res = await getJSON(`${WEB_HOST}/club-schedule-season/${teamAbbrev}/${nhlSeasonId}`, { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`${tag}: fetch failed (${res.fatal || res.soft})`);
  const games = res.json?.games;
  if (!Array.isArray(games))
    throw new Error(`${tag}: no games array. Top level keys: ${Object.keys(res.json || {}).join(", ") || "(none)"}`);
  if (games.length < 1 || games.length > SEASON_MAX_GAMES)
    throw new Error(`${tag}: ${games.length} games, expected between 1 and ${SEASON_MAX_GAMES}.`);

  saveCache(key, games);
  return games;
}

/** The Monday ("YYYY-MM-DD") of the ISO week containing `dateStr`. Both sides
 *  of crossCheck() bucket by this, so their weeks are the same weeks. */
export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 Sun .. 6 Sat
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().slice(0, 10);
}

/** Regular season games per team per calendar week, for the whole league:
 *  team abbrev -> (week start date -> games). */
export async function gamesPerTeamPerWeek(nhlSeasonId, opts = {}) {
  const teams = await nhlTeamAbbrevs(opts);
  const perTeam = new Map();
  // Small batches: fast on a warm cache, polite on a cold one.
  const BATCH = 6;
  for (let i = 0; i < teams.length; i += BATCH) {
    const batch = teams.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((team) => clubScheduleSeason(team, nhlSeasonId, opts)));
    batch.forEach((team, idx) => {
      const weekMap = new Map();
      for (const g of results[idx]) {
        if (g.gameType !== GAME_TYPE_REGULAR) continue;
        const wk = weekStartOf(g.gameDate);
        weekMap.set(wk, (weekMap.get(wk) || 0) + 1);
      }
      perTeam.set(team, weekMap);
    });
  }
  return perTeam;
}

// ---------------------------------------------------------------------------
// ESPN's hockey schedule, checked against the NHL's
// ---------------------------------------------------------------------------
//
// Every game count a hockey lineup or streaming decision uses comes from one
// schedule, and a single-source schedule has no way to catch a wrong season
// year or a genuine data error, because nothing disagrees with it. crossCheck()
// is the second source: ESPN's proTeamSchedules_wl view against the NHL's own
// club schedules, team by team and week by week. Any disagreement is a lineup
// that would bench or start the wrong player.
//
// ESPN's endpoint needs no league id and no cookie. Its season is the END year.
//
// TEAM ABBREVIATIONS DIFFER between the two vendors for four franchises, and
// ESPN also lists an "FA" placeholder team with no games. Without the map
// below, the first run reported 220 disagreements, every one of them those
// four teams' whole schedules compared under different keys. A check that
// cries wolf that loudly trains people to stop reading it.
const ESPN_TO_NHL_ABBREV = { LA: "LAK", NJ: "NJD", SJ: "SJS", TB: "TBL" };

// ESPN game dates are instants; they are bucketed by the Eastern calendar date,
// the same convention the NHL's own gameDate uses for a game's local night.
const easternDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** ESPN's hockey schedule for a season: team abbrev (NHL spelling) -> sorted
 *  list of Eastern game dates. Throws on any shape it does not recognise. */
export async function espnHockeySchedule(espnSeason, opts = {}) {
  const key = `espn-schedule-${espnSeason}`;
  if (!opts.forceRefresh) { const c = loadCache(key, TTL_CURRENT_MS); if (c) return new Map(c); }

  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/${espnSeason}?view=proTeamSchedules_wl`;
  const res = await getJSON(url, { timeoutMs: 15000 });
  if (!res.ok) throw new Error(`nhl-stats espnHockeySchedule(${espnSeason}): fetch failed (${res.fatal || res.soft})`);
  const teams = res.json?.settings?.proTeams;
  if (!Array.isArray(teams) || !teams.length)
    throw new Error(`nhl-stats espnHockeySchedule(${espnSeason}): no settings.proTeams array. Top level keys: ` +
      `${Object.keys(res.json || {}).join(", ") || "(none)"}. ESPN may have changed the view, or this season has no schedule yet.`);

  const byTeam = new Map();
  for (const t of teams) {
    if (!t.abbrev || t.abbrev === "FA") continue;
    const seen = new Set();
    const dates = [];
    for (const list of Object.values(t.proGamesByScoringPeriod || {}))
      for (const g of list || []) {
        if (!Number.isFinite(g.date) || seen.has(g.id)) continue;
        seen.add(g.id);
        dates.push(easternDate(g.date));
      }
    byTeam.set(ESPN_TO_NHL_ABBREV[t.abbrev] || t.abbrev, dates.sort());
  }
  if (![...byTeam.values()].some((d) => d.length))
    throw new Error(`nhl-stats espnHockeySchedule(${espnSeason}): ${teams.length} teams but no games on any of them.`);
  const latest = [...byTeam.values()].flat().sort().pop();
  if (latest < easternDate(Date.now()) && !opts.allowPast)
    throw new Error(`nhl-stats espnHockeySchedule(${espnSeason}): every game is already in the past (latest ${latest}). ` +
      "That is a finished season, almost certainly the wrong season year (ESPN names a hockey season for the year it ends).");

  saveCache(key, [...byTeam]);
  return byTeam;
}

/**
 * Compare ESPN's and the NHL's schedules for every team-week of a season.
 *
 * @param {number} espnSeason  ESPN's end-year season, e.g. 2027
 * @returns {Promise<{ disagreements: Array<{team, week, espn, nhl}>, teams: number }>}
 *   An empty disagreements array is the healthy result. Teams are reported
 *   under their NHL abbreviations.
 */
export async function crossCheck(espnSeason, opts = {}) {
  const espn = await espnHockeySchedule(espnSeason, opts);
  const nhlWeeks = await gamesPerTeamPerWeek(espnSeasonToNhlSeasonId(espnSeason), opts);

  const espnWeeks = new Map();
  for (const [team, dates] of espn) {
    const weekMap = new Map();
    for (const d of dates) weekMap.set(weekStartOf(d), (weekMap.get(weekStartOf(d)) || 0) + 1);
    espnWeeks.set(team, weekMap);
  }

  const allTeams = new Set([...espnWeeks.keys(), ...nhlWeeks.keys()]);
  const disagreements = [];
  for (const team of allTeams) {
    const e = espnWeeks.get(team) || new Map();
    const n = nhlWeeks.get(team) || new Map();
    for (const week of new Set([...e.keys(), ...n.keys()])) {
      const ec = e.get(week) || 0, nc = n.get(week) || 0;
      if (ec !== nc) disagreements.push({ team, week, espn: ec, nhl: nc });
    }
  }
  return { disagreements: disagreements.sort((a, b) => a.week.localeCompare(b.week) || a.team.localeCompare(b.team)), teams: allTeams.size };
}
