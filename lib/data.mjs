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

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

function mcpRaw(tool, args) {
  const r = spawnSync(process.execPath, [path.join(REPO, "tools/mcp-call.mjs"), tool, JSON.stringify(args)], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  let out = r.stdout || "";
  const note = out.indexOf("-- Response truncated");
  if (note >= 0) out = out.slice(0, note);
  const end = Math.max(out.lastIndexOf("]"), out.lastIndexOf("}"));
  if (end < 0) throw new Error(`${tool}: no JSON. ${(r.stderr || out).slice(0, 160)}`);
  return out.slice(0, end + 1);
}

/** All eight rosters, one spawn per team, cached for the day. */
export async function rosters() {
  const raw = await cached("rosters", "json", () => {
    const all = [];
    for (let id = 1; id <= 8; id++) {
      try {
        const rs = JSON.parse(mcpRaw("get_rosters", { team_id: id }));
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
  const raw = await cached("wire", "json", () => {
    const all = [];
    for (const slotId of Object.values(SLOT_ID)) {
      try { all.push(...JSON.parse(mcpRaw("get_free_agents", { position_slot_id: slotId, limit: 40, sort_by: "projection" }))); }
      catch { /* skip a position that fails */ }
    }
    const seen = new Set();
    return JSON.stringify(all.filter((p) => !seen.has(p.id) && seen.add(p.id)));
  });
  return JSON.parse(raw);
}

export async function boxscore(week, teamId) {
  const raw = await cached(`box-${week}-${teamId ?? "all"}`, "json",
    () => mcpRaw("get_boxscore", teamId ? { scoring_period_id: week, team_id: teamId } : { scoring_period_id: week }));
  return JSON.parse(raw);
}

export async function league() {
  return JSON.parse(await cached("league", "json", () => mcpRaw("get_league", {})));
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
