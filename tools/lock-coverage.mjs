// Does a pass actually run between the inactive list and every lock?
//
//   node tools/lock-coverage.mjs                 the upcoming week
//   node tools/lock-coverage.mjs --week 12       a chosen week (Thanksgiving is the hard one)
//   node tools/lock-coverage.mjs --season        every slot, all season
//   node tools/lock-coverage.mjs --write         also save reports/lock-coverage.md
//
// Local compute plus one ESPN read. Reads your passes from
// league/expected-schedule.json (copy league/expected-schedule.example.json to
// start) and your starters from the league in .env.
//
// WHY THIS IS A TOOL AND NOT A CHECKLIST. Pre-lock passes tend to get added one
// at a time, each after noticing a specific gap: Thursday night, then Sunday
// night, then the London games. Every one of those is found by accident, and
// each fix covers exactly the slot that just went wrong. That is not coverage,
// it is a list of near misses.
//
// A full NFL season has close to twenty distinct kickoff slots. Thanksgiving
// week alone adds several on days nothing else plays, and the late season puts
// games on Saturdays and Fridays. All of it is published months ahead and none
// of it is in anybody's head. So the schedule is the source of truth, not a
// memory of which days football happens on.
//
// THE WINDOW. The inactive list is published 90 minutes before kickoff, and a
// lineup locks at kickoff. A pass is useful only if it runs inside that window,
// and useful with margin if it runs in the last 60 minutes of it. A pass before
// the inactives is not early, it is blind; one after kickoff is not late, it is
// absent.
//
// IT ONLY CARES ABOUT SLOTS YOU HAVE STARTERS IN (except with --season, which
// lists every slot). A Friday game nobody on your roster plays in needs no
// pass, and reporting it would train the reader to skim.
//
// Exit 1 when an upcoming slot holding your starters has no pass; 2 when the
// question cannot be answered (no schedule file, no games).

import fs from "node:fs";
import path from "node:path";
import { REPO, games, num, nflSeason } from "../lib/data.mjs";
import { kickoffOf, loadSchedule, firingsBetween, wallClock, startersByTeam, SCHEDULE_FILE } from "../lib/kickoffs.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
// --season IS BOTH A SWITCH AND AN OPTION, and that collision once made this
// tool lie: read as an option, it found no year after it, Number(undefined) is
// NaN, every game was filtered out and the report said every slot was covered
// over ZERO slots. The year is taken only if the next token looks like one.
const seasonTok = arg("season", "");
const SEASON = /^\d{4}$/.test(String(seasonTok)) ? Number(seasonTok) : nflSeason();
const ALL = argv.includes("--season");
const doWrite = argv.includes("--write");

const DROP_MIN = 90;    // inactives published this long before kickoff
const WANT_MIN = 60;    // a pass should sit within this long of kickoff
// A pass closer than this to kickoff does not count. It matches the floor of
// kickoff-guard --window 25-90, so the two tools agree on whether a slot is
// covered: without it this tool credited a pass the guard would SKIP.
const FLOOR_MIN = 25;

let sched;
try { sched = loadSchedule(); }
catch (e) { console.error(`lock-coverage: ${e.message}`); process.exit(2); }
if (!sched) {
  console.error(`lock-coverage: no ${path.relative(REPO, SCHEDULE_FILE)}. Copy league/expected-schedule.example.json ` +
    "to it and list the passes you actually run. Without it there is nothing to check coverage against.");
  process.exit(2);
}
const TZ = sched.timezone;
const passes = sched.tasks.filter((t) => t.lineupPass);
if (!passes.length) {
  console.error("lock-coverage: the expected schedule has no task with lineupPass true, so no kickoff can be covered.");
  process.exit(2);
}

const all = await games();
const season = all.filter((x) => Number(x.season) === SEASON && x.gameday && x.gametime);
const WEEK = Number(arg("week", 0)) || (() => {
  const unplayed = season.filter((x) => !x.away_score).map((x) => num(x.week)).sort((a, b) => a - b);
  return unplayed[0] || 1;
})();

const scope = ALL ? season : season.filter((x) => num(x.week) === WEEK);
// A coverage verdict over no games is not a verdict. Refuse, loudly.
if (!scope.length) {
  console.error(`lock-coverage: no games in scope (season ${SEASON}, ${ALL ? "all weeks" : "week " + WEEK}). ` +
    "Refusing to report every slot as covered when there are none.");
  process.exit(2);
}

// Which NFL teams do you start somebody on? Only those slots matter. Rosters
// are read for the week in question; with --season the current roster stands
// in for every week, which is the best available and is said so below.
const st = await startersByTeam(SEASON, ALL ? undefined : WEEK);
if (!st.known) console.error(`lock-coverage: your roster could not be read (${st.why}); every slot is listed, starters unknown.`);

const slots = new Map();
for (const x of scope) {
  const kick = kickoffOf(x);
  const key = kick.toISOString();
  if (!slots.has(key)) slots.set(key, { week: num(x.week), day: x.weekday, kick, teams: new Set() });
  slots.get(key).teams.add(x.home_team); slots.get(key).teams.add(x.away_team);
}

const pad = (n) => String(n).padStart(2, "0");
const clock = (d) => { const w = wallClock(d, TZ); return `${pad(w.h)}:${pad(w.mi)}`; };
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const rows = [];
for (const s of [...slots.values()].sort((a, b) => a.kick - b.kick)) {
  const ours = [...s.teams].flatMap((t) => (st.byTeam.get(t) || []).map((p) => ({ ...p, team: t })));
  if (!ALL && st.known && !ours.length) continue;      // nothing of yours kicks off here
  // A pass covers this slot if one of its firings lands after the inactives and
  // at least FLOOR_MIN before the lock. Every firing is evaluated as an instant
  // in the schedule's own timezone, so a UTC cron, a date-pinned holiday pass
  // and the November clock change are all handled the same way.
  const from = new Date(s.kick.getTime() - DROP_MIN * 60000);
  const to = new Date(s.kick.getTime() - FLOOR_MIN * 60000);
  let best = null;
  for (const p of passes) for (const f of firingsBetween(p.fields, from, to, TZ))
    if (!best || f > best.at) best = { what: p.taskId, at: f };
  rows.push({ ...s, ours, best, drop: from, margin: best ? Math.round((s.kick - best.at) / 60000) : null });
}

const L = [];
const say = (t = "") => L.push(t);
say(`# Lock coverage, ${ALL ? `all of ${SEASON}` : `week ${WEEK}`}`);
say("");
say(`Times are in the schedule's timezone (${TZ}). Inactives are published 90 minutes`);
say("before kickoff and a lineup locks at kickoff. A pass is only useful inside that");
say(`window, and this counts one only if it runs at least ${FLOOR_MIN} minutes before the lock.`);
if (ALL && st.known) say("With --season the current roster stands in for every week.");
say("");

const gaps = rows.filter((r) => !r.best && (r.ours.length || !st.known));
const thin = rows.filter((r) => r.best && r.margin > WANT_MIN);

say("| Week | Slot | Inactives | Your starters | Covered by | Margin |");
say("|---|---|---|---|---|---|");
for (const r of rows)
  say(`| ${r.week} | ${r.day} ${clock(r.kick)} | ${clock(r.drop)} | ${st.known ? r.ours.length || "-" : "?"} | ` +
    `${r.best ? r.best.what + " " + clock(r.best.at) : "**NOTHING**"} | ${r.best ? r.margin + " min" : "-"} |`);
say("");

if (gaps.length) {
  say(`## ${gaps.length} slot(s) ${st.known ? "with your starters and " : ""}no pass at all`);
  say("");
  for (const r of gaps) {
    say(`**Week ${r.week}, ${r.day} ${clock(r.kick)}.** ` + (st.known
      ? `${r.ours.length} of your starters: ${r.ours.slice(0, 6).map((o) => `${o.name} (${o.team})`).join(", ")}${r.ours.length > 6 ? ", and more" : ""}.`
      : "Starters unknown."));
    const at = new Date(r.kick.getTime() - 45 * 60000);
    const w = wallClock(at, TZ);
    say(`Needs a pass about \`${clock(at)}\` ${TZ}. Cron: \`${w.mi} ${w.h} * * ${w.dow}\` (${DOW[w.dow]})`);
    say("");
  }
} else say("Every slot your starters play in has a pass inside the window.");
say("");

if (thin.length) {
  say(`## ${thin.length} slot(s) covered, but not close to the lock`);
  say("");
  say(`A pass more than ${WANT_MIN} minutes before kickoff still sees the inactives, but`);
  say("misses anything that breaks after it runs.");
  say("");
  for (const r of thin) say(`- Week ${r.week} ${r.day} ${clock(r.kick)}: ${r.best.what} at ${clock(r.best.at)}, ${r.margin} minutes early.`);
  say("");
}

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) {
  fs.mkdirSync(path.join(REPO, "reports"), { recursive: true });
  fs.writeFileSync(path.join(REPO, "reports", "lock-coverage.md"), text);
  console.log("written: reports/lock-coverage.md");
}
// Fail only on gaps still ahead. A game already played cannot be covered now,
// and counting it would fail --season forever, which is how a check gets ignored.
const ahead = gaps.filter((r) => r.kick > new Date());
if (ahead.length) console.log(`FAIL: ${ahead.length} upcoming slot(s) with no pass: ` +
  ahead.map((r) => `week ${r.week} ${r.day} ${clock(r.kick)}`).join("; "));
process.exit(ahead.length ? 1 : 0);
