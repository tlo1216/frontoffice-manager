// One cached data layer for every analysis tool.
//
// WHY THIS EXISTS. Before it, each tool independently shelled out to
// mcp-call.mjs once per team, then again for the wire, then re-fetched the same
// nflverse CSVs. A full weekly pass spawned roughly forty node subprocesses and
// downloaded the same files several times. Everything here is fetched once per
// day, cached to disk, and shared. The weekly pass now costs one fetch of each
// source regardless of how many tools read it.
//
// Sources, all free and all without a key except ESPN, which uses the cookies
// already in the MCP server's .env:
//
//   ESPN (via the MCP)  rosters, free agents, boxscores, league settings
//   nflverse            weekly player stats, schedules with Vegas lines and
//                       historical temperature and wind, snap counts
//   Sleeper             trending adds, meaning what the whole fantasy market is
//                       claiming right now, with no auth at all
//   Open-Meteo          forecast wind, temperature and precipitation by stadium
//   FantasyCalc         market trade values
//
// Everything is read only. Nothing here writes to a league.

import fs from "node:fs";
import path from "node:path";

import { mcpText } from "./mcp.mjs";
export const REPO = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(REPO, "tools", ".cache");
fs.mkdirSync(CACHE, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);
const memo = new Map();

/** Cache anything to disk for the day, and in memory for the process. */
async function cached(key, ext, produce) {
  if (memo.has(key)) return memo.get(key);
  const file = path.join(CACHE, `${today()}-${key}.${ext}`);
  let raw;
  if (fs.existsSync(file)) raw = fs.readFileSync(file, "utf8");
  else { raw = await produce(); fs.writeFileSync(file, raw); }
  memo.set(key, raw);
  return raw;
}

// Retry transient failures. GitHub's release CDN returns 502, 503 and 504 under
// load often enough that a single attempt makes a scheduled run flaky, and a
// flaky data layer produces analyses that silently skip a season.
const get = async (url, attempts = 4) => {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.text();
      last = new Error(`${r.status} from ${url.slice(0, 80)}`);
      if (r.status < 500 && r.status !== 429) throw last;
    } catch (e) { last = e; }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
  throw last;
};

// --- CSV --------------------------------------------------------------------

/** Quote aware. A naive split broke on a column containing a quoted comma and
 *  silently misaligned every row, so this is not worth shortcutting. */
export function parseCsv(text, keepCols) {
  const nl = text.indexOf("\n");
  const head = text.slice(0, nl).trim().split(",");
  const keep = keepCols ? head.map((h, i) => (keepCols.has(h) ? [h, i] : null)).filter(Boolean)
                        : head.map((h, i) => [h, i]);
  const rows = [];
  for (const line of text.slice(nl + 1).split("\n")) {
    if (!line.trim()) continue;
    const cells = [];
    let cell = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { cells.push(cell); cell = ""; }
      else cell += c;
    }
    cells.push(cell);
    const o = {};
    for (const [n, i] of keep) o[n] = cells[i];
    rows.push(o);
  }
  return rows;
}

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// --- ESPN through the MCP ---------------------------------------------------

// lib/mcp.mjs, not a local copy of the spawn: a single dropped ESPN read used
// to fail the whole run, and the error it threw carried no exit code, no stderr
// and none of the bytes that did come back.
const mcpRaw = (tool, args) => mcpText(tool,args);

// Every call below is scoped to ESPN_LEAGUE_ID (espnConfig().leagueId) when it
// is set, both on the MCP request itself (so a second configured league is
// never answered by the MCP's own default) and on the disk cache key (so
// switching ESPN_LEAGUE_ID and running again the same day cannot read back
// the OTHER league's cache). Left unset, behaviour is exactly what it was: the
// MCP's own default league, one unkeyed cache file per kind.
function leagueArgs(extra) {
  const { leagueId } = espnConfig();
  return leagueId ? { ...extra, league_id: leagueId } : extra;
}
function leagueKey(base) {
  const { leagueId } = espnConfig();
  return leagueId ? `${base}-${leagueId}` : base;
}

/** Every roster in the league, one spawn per team, cached for the day. Team
 *  count comes from the league's own settings (get_league's teamCount), not
 *  an assumed number: a fixed 8 silently dropped every roster past the eighth
 *  in a bigger league, with nothing in the output to say a team went missing. */
export async function rosters() {
  const raw = await cached(leagueKey("rosters"), "json", async () => {
    const lg = await league();
    const teamCount = num(lg.teamCount);
    if (!teamCount)
      throw new Error("rosters(): get_league answered with no teamCount; refusing to assume an 8 team league.");
    const all = [];
    for (let id = 1; id <= teamCount; id++) {
      try {
        const rs = JSON.parse(mcpRaw("get_rosters", leagueArgs({ team_id: id })));
        all.push({ teamId: id, players: (rs[0] || rs).players || [] });
      } catch { /* a team that cannot be read is reported by the caller */ }
    }
    return JSON.stringify(all);
  });
  return JSON.parse(raw);
}

export const SLOT_ID = { QB: 0, RB: 2, WR: 4, TE: 6, "D/ST": 16, K: 17 };

/** The wire, by position, with availability so waiver players are separable. */
export async function wire() {
  const raw = await cached(leagueKey("wire"), "json", () => {
    const all = [];
    for (const slotId of Object.values(SLOT_ID)) {
      try { all.push(...JSON.parse(mcpRaw("get_free_agents", leagueArgs({ position_slot_id: slotId, limit: 40, sort_by: "projection" })))); }
      catch { /* skip a position that fails */ }
    }
    const seen = new Set();
    return JSON.stringify(all.filter((p) => !seen.has(p.id) && seen.add(p.id)));
  });
  return JSON.parse(raw);
}

export async function boxscore(week, teamId) {
  const raw = await cached(leagueKey(`box-${week}-${teamId ?? "all"}`), "json",
    () => mcpRaw("get_boxscore", leagueArgs(teamId ? { scoring_period_id: week, team_id: teamId } : { scoring_period_id: week })));
  return JSON.parse(raw);
}

export async function league() {
  return JSON.parse(await cached(leagueKey("league"), "json", () => mcpRaw("get_league", leagueArgs({}))));
}

/** Players this team already has a pending claim on, by name. A tool that
 *  files on a schedule has to know what it already filed: a pending claim has
 *  not changed the roster yet, so the hole it was filed to fix still looks
 *  open, and re-running the same tool the next morning would file it again.
 *  Returns an empty Set on any failure, which is the safe default: at worst a
 *  claim gets proposed twice, never silently dropped. */
export async function pendingAdds(teamId) {
  try {
    const j = JSON.parse(mcpRaw("get_pending", leagueArgs({ team_id: teamId })));
    const names = new Set();
    for (const t of j) for (const i of t.items || []) if (i.type === "ADD" && i.playerName) names.add(i.playerName);
    return names;
  } catch { return new Set(); }
}

/** One nflverse weekly row scored at a league's own reception weight.
 *  nflverse publishes standard (fantasy_points, 0 per catch) and full PPR
 *  (fantasy_points_ppr); the difference is exactly the receptions, so any
 *  weight in between is a straight line between the two. Without this, a
 *  tool that reads fantasy_points_ppr prices a half-PPR league's players in
 *  full PPR points, which does not round off, it moves a season total. */
export function pointsAt(row, receptionPoints) {
  const rp = Number(receptionPoints);
  if (!Number.isFinite(rp))
    throw new Error(`pointsAt: receptionPoints must be a number (see receptionPoints()), got ${receptionPoints}`);
  const std = num(row.fantasy_points), ppr = num(row.fantasy_points_ppr);
  return std + rp * (ppr - std);
}

/** A league's own PPR weight, read from its live scoring settings rather than
 *  assumed. ESPN statId 53 is a reception; whatever points that item is worth
 *  IS this league's reception weight (0 standard, 1 full PPR, 0.5 half PPR, or
 *  anything else a commissioner set it to). Takes a get_league() response. */
export function receptionPoints(lg) {
  const item = (lg?.scoringSettings?.scoringItems || []).find((x) => x.statId === 53);
  if (!item)
    throw new Error("receptionPoints: no statId 53 (receptions) scoring item in this league's settings.");
  return num(item.points);
}

// --- ESPN direct, for tools that need a raw fetch --------------------------
//
// Everything above goes through the MCP, which is the right path for anything
// that can wait for a subprocess round trip. A few tools need the cookies
// directly: a call ESPN answers with a shape the MCP does not expose, or a
// read of a league other than the one the MCP is configured for. Both used to
// read ESPN_S2 and ESPN_SWID with their own copy of this logic, which is
// exactly the kind of duplication that goes stale in one copy and not the
// others. This is the one place it lives now.

let _envFile = null;
function envFile() {
  if (_envFile) return _envFile;
  const file = process.env.FRONTOFFICE_ENV || path.join(REPO, ".env");
  _envFile = fs.existsSync(file) ? Object.fromEntries(
    fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])) : {};
  return _envFile;
}

/** Cookie header for a direct ESPN fetch. Throws if the cookies are not set:
 *  every read after this would 401 anyway, so this fails here, once, with a
 *  clear reason, instead of in whichever tool happens to call it first. */
export function espnHeaders() {
  const file = envFile();
  const s2 = process.env.ESPN_S2 || file.ESPN_S2;
  const swid = process.env.ESPN_SWID || file.ESPN_SWID;
  if (!s2 || !swid)
    throw new Error("espnHeaders: ESPN_S2 or ESPN_SWID is not set in the environment or in .env. Every ESPN read would 401.");
  return { cookie: `espn_s2=${s2}; SWID=${swid}`, accept: "application/json" };
}

/** The NFL season a date belongs to. A season named 2026 runs from September
 *  2026 into February 2027, so the calendar year is wrong for the fantasy
 *  playoffs: weeks 17 and 18 fall in January, after the calendar year has
 *  already rolled over to the next season's number. Anything before August
 *  belongs to the season that started the previous September. */
export function nflSeason(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getUTCMonth() < 7 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

/** Your league, team and season, from .env. Everything else about the league
 *  comes from the API, so this is the only thing a direct-fetch tool has to
 *  be told. */
export function espnConfig() {
  const file = envFile();
  return {
    leagueId: process.env.ESPN_LEAGUE_ID || file.ESPN_LEAGUE_ID || "",
    teamId: Number(process.env.ESPN_TEAM_ID || file.ESPN_TEAM_ID || 0),
    season: Number(process.env.ESPN_SEASON || file.ESPN_SEASON || nflSeason()),
    sport: process.env.ESPN_SPORT || file.ESPN_SPORT || "ffl",
  };
}

// --- Forward-looking projections, pinned rather than found ------------------
//
// ESPN stores more than one number under scoringPeriodId 0 for a player: a
// preseason projection and, once the season is under way, a separately
// updated rest-of-season one, as different entries in the same stats array.
// find()-ing on statSourceId alone returns whichever of them ESPN lists
// first, which is not stable and is a real class of bug (tools/draft-board.mjs
// and tools/espn-cookie-fetch.mjs pin the same three fields for the same
// reason). Pinning statSourceId, statSplitTypeId, scoringPeriodId AND seasonId
// together is what makes the read stable.
export const PROJ = { REST: 2, PRE: 0 };

/** Season projection for one ESPN player object, for a given split. Null when
 *  ESPN has no such split, which is normal for PROJ.REST before week one. */
export function seasonProjection(player, which = PROJ.REST, season = nflSeason()) {
  const hit = (player?.stats || []).find((x) => x.statSourceId === 1 &&
    x.statSplitTypeId === which && x.scoringPeriodId === 0 && Number(x.seasonId) === season);
  return hit ? num(hit.appliedTotal) : null;
}

/** Forward-looking projection: rest of season once ESPN publishes one,
 *  falling back to the preseason total before week one. Use this for
 *  anything that decides what to do NEXT, never the frozen preseason number. */
export function forwardProjection(player, season = nflSeason()) {
  const ros = seasonProjection(player, PROJ.REST, season);
  if (ros !== null) return { total: ros, basis: "rest of season" };
  const pre = seasonProjection(player, PROJ.PRE, season);
  if (pre !== null) return { total: pre, basis: "preseason" };
  return { total: 0, basis: "missing" };
}

/** Points already banked this season, pinned the same way. */
export function actualToDate(player, season = nflSeason()) {
  const hit = (player?.stats || []).find((x) => x.statSourceId === 0 &&
    x.statSplitTypeId === 0 && x.scoringPeriodId === 0 && Number(x.seasonId) === season);
  return hit ? num(hit.appliedTotal) : 0;
}

// --- nflverse ---------------------------------------------------------------

const STAT_COLS = new Set(["player_id", "player_display_name", "position", "season", "week", "team",
  "game_id", "opponent_team",
  "targets", "carries", "target_share", "air_yards_share", "wopr", "receiving_tds", "rushing_tds",
  "fantasy_points_ppr", "fantasy_points"]);

export async function playerWeeks(season) {
  const text = await cached(`stats-${season}`, "csv",
    () => get(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`));
  return parseCsv(text, STAT_COLS);
}

// Weekly injury reports: the body part, the practice participation through the
// week, and the game status the team finally published. Richer than the one
// word a fantasy site shows you, which is the last of those three.
const INJURY_COLS = new Set(["season", "week", "team", "gsis_id", "position", "full_name",
  "report_primary_injury", "report_status", "practice_status"]);

export async function injuries(season) {
  const text = await cached(`injuries-${season}`, "csv",
    () => get(`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`));
  return parseCsv(text, INJURY_COLS);
}

const GAME_COLS = new Set(["game_id", "season", "week", "gameday", "gametime", "weekday",
  "away_team", "home_team", "away_score", "home_score", "spread_line", "total_line", "roof", "temp", "wind"]);

export async function games() {
  const text = await cached("games", "csv",
    () => get("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"));
  return parseCsv(text, GAME_COLS);
}

/** gsis id to espn id, so nothing is ever matched by player name. */
export async function idMap(season) {
  const text = await cached(`roster-weekly-${season}`, "csv",
    () => get(`https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`));
  const m = new Map();
  for (const r of parseCsv(text, new Set(["gsis_id", "espn_id", "full_name", "team"]))) {
    if (r.gsis_id && r.espn_id) m.set(r.gsis_id, r.espn_id);
  }
  return m;
}

// --- Sleeper: what the whole market is claiming -----------------------------

/** Trending adds across all of Sleeper, which is a far larger sample than one
 *  league. Free, no key. Returns espn-name keyed counts where a match exists. */
export async function trendingAdds(hours = 24, limit = 100) {
  const trend = JSON.parse(await cached(`sleeper-trending-${hours}`, "json",
    () => get(`https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=${hours}&limit=${limit}`)));
  const players = JSON.parse(await cached("sleeper-players", "json",
    () => get("https://api.sleeper.app/v1/players/nfl")));
  return trend.map((t, i) => {
    const p = players[t.player_id] || {};
    return { rank: i + 1, adds: t.count, name: p.full_name || p.last_name || t.player_id,
             pos: p.position, team: p.team, espnId: p.espn_id ? String(p.espn_id) : undefined };
  }).filter((p) => p.name);
}

// --- Open-Meteo: forecast for outdoor stadiums ------------------------------

export const STADIUM = {
  ARI: [33.53, -112.26], ATL: [33.76, -84.40], BAL: [39.28, -76.62], BUF: [42.77, -78.79],
  CAR: [35.23, -80.85], CHI: [41.86, -87.62], CIN: [39.10, -84.52], CLE: [41.51, -81.70],
  DAL: [32.75, -97.09], DEN: [39.74, -105.02], DET: [42.34, -83.05], GB: [44.50, -88.06],
  HOU: [29.68, -95.41], IND: [39.76, -86.16], JAX: [30.32, -81.64], KC: [39.05, -94.48],
  LV: [36.09, -115.18], LAC: [33.95, -118.34], LA: [33.95, -118.34], LAR: [33.95, -118.34],
  MIA: [25.96, -80.24], MIN: [44.97, -93.26], NE: [42.09, -71.26], NO: [29.95, -90.08],
  NYG: [40.81, -74.07], NYJ: [40.81, -74.07], PHI: [39.90, -75.17], PIT: [40.45, -80.02],
  SEA: [47.60, -122.33], SF: [37.40, -121.97], TB: [27.98, -82.50], TEN: [36.17, -86.77],
  WAS: [38.91, -76.86], WSH: [38.91, -76.86],
};

/** Forecast wind, temperature and precipitation chance at one stadium. Free,
 *  no key. Only meaningful for outdoor roofs; the caller checks that. */
export async function forecast(team) {
  const c = STADIUM[team];
  if (!c) return null;
  const j = JSON.parse(await cached(`wx-${team}`, "json", () => get(
    `https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}` +
    `&hourly=temperature_2m,wind_speed_10m,precipitation_probability&forecast_days=7&temperature_unit=fahrenheit&wind_speed_unit=mph`)));
  const h = j.hourly || {};
  return { time: h.time || [], temp: h.temperature_2m || [], wind: h.wind_speed_10m || [], precip: h.precipitation_probability || [] };
}

// --- FantasyCalc: what the market pays --------------------------------------

export async function marketValues({ ppr = 1, numQbs = 1 } = {}) {
  try {
    const j = JSON.parse(await cached(`fantasycalc-${ppr}-${numQbs}`, "json",
      () => get(`https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${numQbs}&ppr=${ppr}`)));
    return j.map((r) => ({
      name: r.player?.name, pos: r.player?.position, team: r.player?.maybeTeam,
      value: r.value, overall: r.overallRank, posRank: r.positionRank,
      espnId: r.player?.espnId ? String(r.player.espnId) : undefined,
    })).filter((r) => r.name);
  } catch { return []; }
}
