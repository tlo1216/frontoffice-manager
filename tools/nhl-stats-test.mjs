// lib/nhl-stats.mjs, proved against the live NHL and ESPN APIs.
//
//   node tools/nhl-stats-test.mjs                 the current hockey season
//   node tools/nhl-stats-test.mjs --season 2027   ESPN's end-year season to check
//
// The last completed NHL season through every stats loader, the chosen
// season's schedule through the schedule loaders, and crossCheck() comparing
// ESPN's and the NHL's own schedules for every team-week. Network, on purpose:
// lib/nhl-stats.mjs's whole job is talking to two live hosts, and a mock would
// only prove the mock was self-consistent, not that the season id format, the
// report names or gameType 2 are what that file's header says they are.
//
// No key and no cookie needed. tools/.cache/nhl holds what lib/nhl-stats.mjs
// caches (24h for a finished season, 1h for the current one), so a second run
// is mostly cache hits; the first run of the day makes about 36 requests and
// finishes well under a minute.
//
// Exits 0 only if every loader returns real data AND crossCheck finds zero
// team-week disagreements. A disagreement is a lineup tool that would bench or
// start the wrong player because two schedules quietly differ, so it fails
// rather than warns. Before the schedule for a new season is published, the
// schedule steps fail; that is the honest answer, not a bug in the test.

import {
  skaterSummary, goalieSummary, skaterRealtime, skaterFaceoffs,
  playerGameLog, nhlTeamAbbrevs, scheduleForDate, clubScheduleSeason,
  gamesPerTeamPerWeek, espnSeasonToNhlSeasonId, espnHockeySeason, crossCheck,
  GAME_TYPE_REGULAR,
} from "../lib/nhl-stats.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };

const ESPN_SEASON = Number(arg("season", espnHockeySeason()));
const NHL_SEASON = espnSeasonToNhlSeasonId(ESPN_SEASON);          // e.g. "20262027"
const COMPLETED_SEASON = espnSeasonToNhlSeasonId(ESPN_SEASON - 1); // the one before it, finished
const STAR_ID = 8478402;   // Connor McDavid, a known everyday player, so a 0 game log means a wrong season or game type
const SAMPLE_TEAM = "EDM";
const TODAY = new Date().toISOString().slice(0, 10);

const started = Date.now();
let failed = false;
async function step(name, fn) {
  try {
    const result = await fn();
    console.log(`  ok    ${name}`);
    return result;
  } catch (e) {
    failed = true;
    console.log(`  FAIL  ${name}`);
    console.log(`          ${e.message}`);
    return null;
  }
}

console.log("# NHL stats loaders, against the live NHL and ESPN APIs\n");

console.log(`## The last completed season: ${COMPLETED_SEASON}`);
await step(`skaterSummary(${COMPLETED_SEASON})`, async () => {
  const rows = await skaterSummary(COMPLETED_SEASON);
  console.log(`          ${rows.length} skater rows`);
});

await step(`goalieSummary(${COMPLETED_SEASON})`, async () => {
  const rows = await goalieSummary(COMPLETED_SEASON);
  console.log(`          ${rows.length} goalie rows`);
});

await step(`skaterRealtime(${COMPLETED_SEASON})`, async () => {
  const rows = await skaterRealtime(COMPLETED_SEASON);
  for (const key of ["hits", "blockedShots", "giveaways", "takeaways"])
    if (!(key in (rows[0] || {}))) throw new Error(`realtime rows are missing "${key}", the whole point of pulling this report`);
  const s = rows.find((r) => r.hits > 0) || rows[0];
  console.log(`          ${rows.length} rows, sample hits/blocks/giveaways/takeaways: ${s.hits}/${s.blockedShots}/${s.giveaways}/${s.takeaways}`);
});

await step(`skaterFaceoffs(${COMPLETED_SEASON})`, async () => {
  const rows = await skaterFaceoffs(COMPLETED_SEASON);
  for (const key of ["totalFaceoffWins", "totalFaceoffLosses"])
    if (!(key in (rows[0] || {}))) throw new Error(`faceoffwins rows are missing "${key}"`);
  const top = [...rows].sort((a, b) => (b.totalFaceoffWins || 0) - (a.totalFaceoffWins || 0))[0];
  console.log(`          ${rows.length} rows, faceoff win leader: ${top.skaterFullName} ${top.totalFaceoffWins}W/${top.totalFaceoffLosses}L`);
});

await step(`playerGameLog(${STAR_ID}, ${COMPLETED_SEASON}, gameType ${GAME_TYPE_REGULAR})`, async () => {
  const log = await playerGameLog(STAR_ID, COMPLETED_SEASON, GAME_TYPE_REGULAR);
  console.log(`          ${log.games.length} games, gameTypeId echoed back: ${log.gameTypeId}`);
  if (log.games.length < 1) throw new Error("0 games for an everyday player: the season or game type passed is wrong, not the player");
});

console.log(`\n## The ${NHL_SEASON} schedule (ESPN season ${ESPN_SEASON})`);

await step("nhlTeamAbbrevs()", async () => {
  const teams = await nhlTeamAbbrevs();
  console.log(`          ${teams.length} teams: ${teams.slice(0, 5).join(", ")}...`);
});

await step(`scheduleForDate(${TODAY})`, async () => {
  const out = await scheduleForDate(TODAY);
  console.log(`          ${out.days.length} day window, ${out.days.reduce((n, d) => n + (d.games || []).length, 0)} games`);
});

await step(`clubScheduleSeason(${SAMPLE_TEAM}, ${NHL_SEASON})`, async () => {
  const games = await clubScheduleSeason(SAMPLE_TEAM, NHL_SEASON);
  console.log(`          ${games.length} games total, ${games.filter((g) => g.gameType === GAME_TYPE_REGULAR).length} regular season`);
});

await step(`gamesPerTeamPerWeek(${NHL_SEASON})`, async () => {
  const perTeam = await gamesPerTeamPerWeek(NHL_SEASON);
  const weeks = perTeam.get(SAMPLE_TEAM);
  const total = [...(weeks?.values() || [])].reduce((a, b) => a + b, 0);
  console.log(`          ${perTeam.size} teams indexed, ${SAMPLE_TEAM} plays ${weeks?.size ?? 0} distinct weeks, ${total} regular season games`);
});

console.log(`\n## crossCheck: ESPN's schedule against the NHL's own, season ${ESPN_SEASON}`);
await step(`crossCheck(${ESPN_SEASON})`, async () => {
  const result = await crossCheck(ESPN_SEASON);
  console.log(`          ${result.disagreements.length} disagreements over ${result.teams} teams`);
  if (result.disagreements.length) {
    for (const d of result.disagreements.slice(0, 25))
      console.log(`          ${d.team} week of ${d.week}: ESPN says ${d.espn} games, the NHL says ${d.nhl}`);
    if (result.disagreements.length > 25) console.log(`          ... and ${result.disagreements.length - 25} more`);
    throw new Error("the two schedules disagree. That is not formatting: a lineup tool trusting one source would bench or start the wrong player those weeks.");
  }
  if (result.teams !== 32) throw new Error(`${result.teams} teams compared, expected 32: a team is named differently by the two sources`);
});

console.log(`\nElapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(failed ? "\nFAILED." : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
