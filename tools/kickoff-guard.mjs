// Is this pass running before the kickoff it exists to protect?
//
//   node tools/kickoff-guard.mjs --slot Thursday           the Thursday night game
//   node tools/kickoff-guard.mjs --slot Sunday --et 13:00  the Sunday 1 PM ET wave
//   node tools/kickoff-guard.mjs                           the next kickoff you have a starter in
//   node tools/kickoff-guard.mjs --window 25-90            only act if a kickoff is 25-90 minutes out
//   node tools/kickoff-guard.mjs --task sunday-early-lineup   name the pass in the log
//
// Local compute plus one ESPN read. Every pre-lock pass runs this FIRST and
// leads its report with the verdict. Reads ESPN_LEAGUE_ID, ESPN_TEAM_ID and the
// cookies from .env, like lib/data.mjs.
//
// WHY IT EXISTS. A Thursday lineup pass once started 47 minutes after kickoff:
// the scheduler that should have started it at 5:20 PM had refused to, over and
// over, and nothing said so. The run then did its job perfectly on a lineup
// that could no longer change, and a pass that runs after kickoff reports
// exactly as cleanly as one that runs before it. Nothing in it knew what time
// it was supposed to be protecting, so nothing could say it was late.
//
// That is the usual failure, confident output after a lost input, moved out of
// the code and into the calendar. The lost input is the clock.
//
// THE VERDICTS, and the exit codes a scheduled pass can branch on. The first
// word of stdout is always the verdict.
//
//   ON TIME  0   kickoff is ahead and inside the inactive window
//   EARLY    0   more than 90 minutes ahead, so the inactive list is not out
//                yet. Not an error: a Thursday pass may deliberately run early
//                to leave room for a waiver-free replacement. Reported so a
//                reader knows OUT tags may still be coming.
//   LATE     3   kickoff has passed. Lists which of your starters are already
//                locked in, and flags any of them tagged OUT, because that is
//                the zero the pass existed to prevent.
//   ACT      0   --window only: this is the run of a pair that should act
//   SKIP     4   --window only: this is the run of a pair that should not
//
// EVERY REAL RUN IS LOGGED to league/pass-log.csv, on time or not (see
// lib/kickoffs.mjs). tools/reconcile.mjs reads that log to prove each scheduled
// pass actually fired, so pass --task with the same taskId the pass has in
// league/expected-schedule.json.

import { games, nflSeason } from "../lib/data.mjs";
import { kickoffOf, startersByTeam, appendPassLog, readPassLog } from "../lib/kickoffs.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const SEASON = Number(arg("season", nflSeason()));
const SLOT = arg("slot", "");          // weekday name, e.g. Thursday
const ET = arg("et", "");              // optional kickoff time in ET, e.g. 13:00
const TASK = arg("task", "");          // the scheduled pass this run belongs to
// --now replays the guard at another time. A replay is a test of the guard,
// never a pass, and logging it would plant fake history in the one file whose
// job is to be the true record, so a replay is never logged.
const IS_TEST = Boolean(arg("now", ""));
const NOW = IS_TEST ? new Date(arg("now")) : new Date();
if (Number.isNaN(NOW.getTime())) { console.error(`--now is not a date: ${arg("now")}`); process.exit(2); }
const INACTIVES_MIN = 90;              // inactives are published this long before kickoff

// WHY WAS IT LATE? This tool cannot see your scheduler. Rather than guess a
// cause (a guessed cause sends the fix in the wrong direction), it names the
// usual ones and says plainly that it does not know which.
const whyLate = () => "Cause unknown from here: check the run history of whatever starts this pass. " +
  "A sleeping machine, a scheduler refusing to start a run, and a queued CI runner all look the same from inside the run.";

const all = (await games()).filter((g) => Number(g.season) === SEASON && g.gameday && g.gametime);
if (!all.length) throw new Error(`no ${SEASON} schedule loaded; refusing to call anything on time without one`);
for (const g of all) g.kick = kickoffOf(g);

// Your starters, read before the target is chosen, because with no --slot the
// target IS "the next game you have a starter in".
const st = await startersByTeam(SEASON);
const starters = st.byTeam;
// Without the roster the guard can still tell the time, but it cannot say
// whether lateness cost anything, and it must not imply that it checked.
const rostersKnown = st.known;

// THE TARGET. With --slot, the game of that weekday (and time, if given)
// nearest to now, in either direction: nearest, because a run that fires 3
// hours late must still find the game it was for, not skip ahead to next week's.
let pool = all;
if (SLOT) pool = pool.filter((g) => g.weekday.toLowerCase() === SLOT.toLowerCase());
if (ET) pool = pool.filter((g) => g.gametime === ET);
if (!SLOT && rostersKnown) pool = pool.filter((g) => starters.has(g.home_team) || starters.has(g.away_team));
if (!pool.length) throw new Error(`no ${SEASON} game matches slot=${SLOT || "next"} et=${ET || "any"}`);

let target;
if (SLOT) {
  target = pool.reduce((a, b) => Math.abs(b.kick - NOW) < Math.abs(a.kick - NOW) ? b : a);
} else {
  target = pool.filter((g) => g.kick > NOW).sort((a, b) => a.kick - b.kick)[0];
  if (!target) throw new Error("no kickoff left this season with one of your starters in it");
}

// Every game sharing that kickoff locks together.
const waveOf = (kick) => all.filter((g) => +g.kick === +kick);
const oursIn = (wave) => [...new Set(wave.flatMap((g) => [g.home_team, g.away_team]))]
  .flatMap((t) => (starters.get(t) || []).map((s) => ({ ...s, team: t })));
const describe = (wave) => wave.map((g) => `${g.away_team} at ${g.home_team}`).join(", ");
const isOut = (s) => /OUT|INJURY_RESERVE|SUSPENSION/.test(s.tag);

const wave = waveOf(target.kick);
const ours = oursIn(wave);
const mins = Math.round((target.kick - NOW) / 60000);
const et = target.kick.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short",
  hour: "numeric", minute: "2-digit" });

let verdict, code;
const lines = [];
if (mins < 0) {
  verdict = "LATE"; code = 3;
  lines.push(`LATE: this pass is running ${-mins} minutes AFTER the ${et} ET kickoff it exists to protect (${describe(wave)}).`);
  if (!rostersKnown) {
    lines.push(`Your roster could not be read (${st.why}), so whether this cost anything is UNKNOWN. Do not report it as harmless.`);
  } else if (!ours.length) {
    lines.push("None of your starters play in that wave, so the lateness cost nothing this time.");
  } else {
    const dead = ours.filter(isOut);
    lines.push(`${ours.length} of your starters are already locked in: ` +
      ours.map((s) => `${s.name} (${s.team}, ${s.tag})`).join("; ") + ".");
    lines.push(dead.length
      ? `DAMAGE: ${dead.map((s) => s.name).join(", ")} locked in a starting slot while tagged out. That is the zero this pass existed to prevent.`
      : "None of them is tagged out, so the lateness cost nothing this time. It will not always be free.");
  }
  lines.push(whyLate());
} else if (mins > INACTIVES_MIN) {
  verdict = "EARLY"; code = 0;
  lines.push(`EARLY: ${et} ET kickoff (${describe(wave)}) is ${mins} minutes out, before the inactive list is published. ` +
    `OUT tags can still arrive after this pass; a pass inside ${INACTIVES_MIN} minutes is what catches them.`);
} else {
  verdict = "ON TIME"; code = 0;
  lines.push(`ON TIME: ${et} ET kickoff (${describe(wave)}) is ${mins} minutes out, inside the inactive window.`);
}
if (verdict !== "LATE" && rostersKnown) lines.push(`${ours.length} of your starters play in that wave.`);
if (verdict !== "LATE" && !rostersKnown) lines.push(`Your roster could not be read (${st.why}); the target is the slot asked for, not one known to hold your starters.`);

// --window MIN-MAX: FOR SCHEDULES FIRED IN PAIRS.
//
// A CI cron runs in UTC, which does not move when the clocks change in
// November, while kickoffs are fixed in local time. A single UTC fire set 50
// minutes before a kickoff in October lands 110 minutes before it in November,
// ahead of the inactive list. So each slot fires TWICE, an hour apart, and this
// decides which of the two acts: the one whose next kickoff is between MIN and
// MAX minutes away. The other prints SKIP and exits 4 without doing anything.
// Always exactly one of the pair, in either half of the season, with nobody
// having to remember to edit a cron twice a year.
//
// It is arithmetic rather than a judgement made at run time, because deciding
// "is 88 minutes close enough" by feel is how a pair ends up running twice or
// not at all.
const WINDOW = arg("window", "");
if (WINDOW) {
  const [lo, hi] = WINDOW.split("-").map(Number);
  if (!(lo >= 0 && hi > lo)) throw new Error(`--window wants MIN-MAX minutes, got ${WINDOW}`);
  // --late-check N, FOR SCHEDULERS THAT CATCH UP. A local scheduler that missed
  // a fire while the machine slept often runs it on wake. In window mode that
  // catch-up would look for the NEXT kickoff, find it days away and print a
  // quiet SKIP, which is the original failure with better manners. So when this
  // run is not the one to act, it also asks whether a wave you have starters in
  // kicked off within the last N minutes, and if so says LATE. CI pairs do not
  // pass it: their idle half routinely fires just after a kickoff by design.
  //
  // AND ONLY IF NO PASS COVERED IT. Asking only "did a kickoff just happen"
  // cries LATE at every spare fire landing shortly after a wave another pass
  // already handled. The question is whether ANY pass ran on time for that
  // wave, and the pass log records every on-time run with its kickoff.
  const LATE_CHECK = Number(arg("late-check", 0));
  let recent = LATE_CHECK > 0 ? all.filter((g) => g.kick <= NOW && (NOW - g.kick) / 60000 <= LATE_CHECK &&
    (!rostersKnown || starters.has(g.home_team) || starters.has(g.away_team))).sort((a, b) => b.kick - a.kick)[0] : null;
  if (recent && readPassLog().some((r) => r.kickoff_utc === recent.kick.toISOString() && r.verdict === "ON TIME")) recent = null;

  if (verdict !== "LATE" && (mins < lo || mins > hi) && recent) {
    const ago = Math.round((NOW - recent.kick) / 60000);
    const rw = waveOf(recent.kick);
    const rOurs = oursIn(rw);
    const dead = rOurs.filter(isOut);
    verdict = "LATE"; code = 3;
    lines.length = 0;
    lines.push(`LATE: this pass is running ${ago} minutes AFTER a kickoff it should have covered ` +
      `(${describe(rw)}). ${rostersKnown ? `${rOurs.length} of your starters were locked in.` : "Your roster could not be read."}`);
    if (rostersKnown) lines.push(dead.length ? `DAMAGE: ${dead.map((s) => s.name).join(", ")} locked in a starting slot while tagged out.`
      : "None of them was tagged out, so it cost nothing this time.");
    lines.push(whyLate());
  } else if (verdict !== "LATE" && (mins < lo || mins > hi)) {
    verdict = "SKIP"; code = 4;
    lines.unshift(`SKIP: the next kickoff is ${mins} minutes out, outside ${lo}-${hi}. Not this pass's slot; nothing to do.`);
  } else if (verdict !== "LATE") {
    lines.unshift(`ACT: ${mins} minutes to kickoff, inside ${lo}-${hi}. Run the check.`);
  }
}

console.log(lines.join("\n"));

if (!IS_TEST)
  appendPassLog([NOW.toISOString(), SLOT || "next", target.kick.toISOString(), mins, verdict,
    rostersKnown ? ours.length : "", TASK]);
process.exit(code);
