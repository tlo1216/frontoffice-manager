// Kickoffs, the passes scheduled to protect them, and the log of what ran.
//
// Shared by tools/kickoff-guard.mjs, tools/lock-coverage.mjs and
// tools/reconcile.mjs, so the three agree on what a kickoff is, what a cron
// means and what a logged pass looks like. Each of them used to carry its own
// copy of at least one of these, and two copies of one truth is how a tool
// ends up reporting a slot as covered by a pass that was retimed last week.
//
// THREE THINGS LIVE HERE:
//
//   kickoffOf(game)       an nflverse schedule row to an absolute instant,
//                         correct on both sides of the clock change
//   the expected schedule league/expected-schedule.json: every recurring pass
//                         you run, as a cron in one stated timezone
//   the pass log          league/pass-log.csv: one row per real run of a
//                         pass, the only evidence that a schedule fired
//
// THE EXPECTED SCHEDULE is yours to write, because only you know what runs your
// passes (a desktop scheduler, cron, a CI workflow). Copy
// league/expected-schedule.example.json and edit it. Its shape:
//
//   { "timezone": "America/New_York",          IANA name, "UTC" or "local"
//     "tasks": [ { "taskId": "sunday-early-lineup", "cron": "10 12 * * 0",
//                  "lineupPass": true } ] }
//
// A CI workflow's cron runs in UTC, so a schedule copied out of one says
// "timezone": "UTC". A pass with "lineupPass": false (a weekly report, say) is
// checked for having run but never counted as covering a kickoff.

import fs from "node:fs";
import path from "node:path";
import { REPO, espnConfig, espnHeaders } from "./data.mjs";
import { getJSON } from "./net.mjs";

// ESPN proTeamId to the team code nflverse uses, so a fantasy starter can be
// matched to a game on the schedule.
export const PRO = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB",
  10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO",
  19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
  28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };

// Bench and IR. Everything else on a roster is a starter.
const NOT_STARTING = new Set([20, 21]);

// --- kickoff times ------------------------------------------------------------

// nflverse publishes kickoff as a local ET date and time. Converting it with a
// fixed -04:00 is right until the clocks change in November, and then every
// late-season verdict is an hour off in the direction that hides lateness. So
// the offset is found by asking what New York's wall clock reads.
const nyClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** An nflverse schedule row ({ gameday, gametime } in ET) as a Date. */
export function kickoffOf(g) {
  for (const off of ["-04:00", "-05:00"]) {
    const d = new Date(`${g.gameday}T${g.gametime}:00${off}`);
    const p = Object.fromEntries(nyClock.formatToParts(d).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === g.gameday && `${p.hour}:${p.minute}` === g.gametime) return d;
  }
  throw new Error(`cannot place ${g.gameday} ${g.gametime} ET on the clock`);
}

// --- a small cron evaluator -----------------------------------------------------
//
// Five standard fields with numbers, comma lists and a-b ranges. Deliberately no
// steps or names: anything else throws rather than being skipped, because a pass
// quietly dropped from the expected schedule reads as an uncovered kickoff or a
// missing task, which is an alarm, not a silence. That is the safe direction.

function cronField(spec, lo, hi, label) {
  if (spec === "*") return null;                       // null means every value
  const out = new Set();
  for (const part of spec.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`cron field "${spec}" (${label}) is a shape this evaluator does not handle. ` +
      "Use numbers, lists and ranges, or extend lib/kickoffs.mjs, rather than letting a pass vanish.");
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    if (a < lo || b > hi || b < a) throw new Error(`cron field "${spec}" (${label}) is out of range ${lo}-${hi}`);
    for (let v = a; v <= b; v++) out.add(v);
  }
  return out;
}

/** Parse a five field cron into [minute, hour, dom, month, dow] sets. */
export function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron "${expr}" does not have 5 fields`);
  const f = [
    cronField(parts[0], 0, 59, "minute"), cronField(parts[1], 0, 23, "hour"),
    cronField(parts[2], 1, 31, "day-of-month"), cronField(parts[3], 1, 12, "month"),
    cronField(parts[4], 0, 7, "day-of-week"),
  ];
  if (f[4] && f[4].has(7)) f[4].add(0);                // 7 is also Sunday
  return f;
}

const fmtCache = new Map();
/** Wall clock fields of `date` in `tz` ("local", "UTC" or an IANA name). */
export function wallClock(date, tz = "local") {
  if (tz === "local")
    return { y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(),
      h: date.getHours(), mi: date.getMinutes(), dow: date.getDay() };
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" }));
  const p = Object.fromEntries(fmtCache.get(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24,
    mi: Number(p.minute), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

/** Does a parsed cron fire at this minute, read in `tz`. Day-of-month and
 *  day-of-week are ANDed: the schedules this checks pin one or the other,
 *  and treating a date-pinned holiday pass as firing on every matching weekday
 *  is a false "covered". */
export function cronFiresAt(fields, date, tz = "local") {
  const [minF, hourF, domF, monF, dowF] = fields;
  const w = wallClock(date, tz);
  const hit = (set, v) => set === null || set.has(v);
  return hit(minF, w.mi) && hit(hourF, w.h) && hit(domF, w.d) && hit(monF, w.mo) && hit(dowF, w.dow);
}

/** Every minute in [from, to] at which a parsed cron fires, oldest first. */
export function firingsBetween(fields, from, to, tz = "local") {
  const out = [];
  const t = new Date(from); t.setSeconds(0, 0);
  for (let ms = t.getTime(); ms <= to.getTime(); ms += 60000) {
    const d = new Date(ms);
    if (cronFiresAt(fields, d, tz)) out.push(d);
  }
  return out;
}

/** The latest firing at or before `boundary`, within `lookbackDays`, or null. */
export function lastFiringAtOrBefore(fields, boundary, lookbackDays, tz = "local") {
  const t = new Date(boundary); t.setSeconds(0, 0);
  const earliest = t.getTime() - lookbackDays * 86400000;
  for (let ms = t.getTime(); ms >= earliest; ms -= 60000) {
    const d = new Date(ms);
    if (cronFiresAt(fields, d, tz)) return d;
  }
  return null;
}

// --- the expected schedule ------------------------------------------------------

export const SCHEDULE_FILE = path.join(REPO, "league", "expected-schedule.json");

/** league/expected-schedule.json parsed and validated, or null when the file
 *  does not exist. A file that exists but is malformed throws: a broken
 *  schedule must never read as an empty one. */
export function loadSchedule(file = SCHEDULE_FILE) {
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const tz = raw.timezone || "local";
  if (tz !== "local") {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); }
    catch { throw new Error(`${file}: timezone "${tz}" is not a timezone this runtime knows`); }
  }
  if (!Array.isArray(raw.tasks) || !raw.tasks.length)
    throw new Error(`${file} lists no tasks; refusing to treat an empty schedule as a checked one`);
  const tasks = raw.tasks.map((t, i) => {
    if (!t || !t.taskId || !t.cron) throw new Error(`${file}: task ${i} is missing taskId or cron`);
    return { taskId: String(t.taskId), cron: String(t.cron), lineupPass: t.lineupPass !== false,
      fields: parseCron(t.cron) };
  });
  return { timezone: tz, tasks, file };
}

// --- the pass log ----------------------------------------------------------------
//
// One row per real run of a pass, on time or not. A pattern of late runs (a
// machine asleep at 5 PM on weekdays, a queued CI runner on Sunday mornings)
// only shows up across weeks, and a log that recorded only failures could not
// show that a pass was ever on time.

export const PASS_LOG = path.join(REPO, "league", "pass-log.csv");
export const PASS_LOG_HEADER = "ran_utc,slot,kickoff_utc,minutes_before_kickoff,verdict,our_starters_in_wave,task";
const PASS_LOG_COLS = PASS_LOG_HEADER.split(",").length;

export function appendPassLog(fields) {
  if (!Array.isArray(fields) || fields.length !== PASS_LOG_COLS)
    throw new Error(`appendPassLog: expected ${PASS_LOG_COLS} fields, got ${Array.isArray(fields) ? fields.length : typeof fields}`);
  if (!fs.existsSync(PASS_LOG)) {
    fs.mkdirSync(path.dirname(PASS_LOG), { recursive: true });
    fs.writeFileSync(PASS_LOG, PASS_LOG_HEADER + "\n");
  }
  fs.appendFileSync(PASS_LOG, fields.map((v) => String(v ?? "").replace(/[,\r\n]/g, ";")).join(",") + "\n");
}

/** Every logged row as an object, oldest first. Empty when there is no log. */
export function readPassLog() {
  if (!fs.existsSync(PASS_LOG)) return [];
  const cols = PASS_LOG_HEADER.split(",");
  return fs.readFileSync(PASS_LOG, "utf8").split(/\r?\n/).slice(1).filter(Boolean)
    .map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i], v])));
}

// --- your starters ------------------------------------------------------------------

/** Your starters this scoring period, keyed by NFL team code. `known` is false
 *  when the roster could not be read, which a caller must report rather than
 *  treat as "no starters": an unread roster is not an empty one. */
export async function startersByTeam(season, week) {
  const { leagueId, teamId } = espnConfig();
  if (!leagueId || !teamId) return { known: false, why: "ESPN_LEAGUE_ID or ESPN_TEAM_ID is not set", byTeam: new Map() };
  let headers;
  try { headers = espnHeaders(); } catch (e) { return { known: false, why: e.message, byTeam: new Map() }; }
  const r = await getJSON(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
    `/segments/0/leagues/${leagueId}?view=mRoster${week ? `&scoringPeriodId=${week}` : ""}&nocache=${Date.now()}`, { headers });
  if (!r.ok) return { known: false, why: r.fatal || r.soft, byTeam: new Map() };
  const me = (r.json.teams || []).find((t) => t.id === teamId);
  if (!me) return { known: false, why: `team ${teamId} is not in league ${leagueId}`, byTeam: new Map() };
  const byTeam = new Map();
  for (const e of me.roster?.entries || []) {
    if (NOT_STARTING.has(e.lineupSlotId)) continue;
    const p = e.playerPoolEntry?.player;
    const team = PRO[p?.proTeamId];
    if (!team) continue;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push({ name: p.fullName, tag: p.injuryStatus || "ACTIVE" });
  }
  return { known: true, byTeam };
}
