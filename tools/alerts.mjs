// The mistakes that are invisible until kickoff, plus what every injury tag is
// measured to cost.
//
//   node tools/alerts.mjs                  this week
//   node tools/alerts.mjs --week 4
//
// Local arithmetic over free data. No model is called, nothing is sent to an AI
// provider, and nothing is written back to your league. Reads ESPN_LEAGUE_ID
// and ESPN_TEAM_ID from the environment, the same as every other tool here.
//
// WHY THIS IS THE TOOL WORTH RUNNING OFTEN. The weekly report tells you how the
// week went. This tells you what is about to go wrong, which is the half you can
// still do something about:
//
//   1. An EMPTY starting slot. The most expensive mistake in fantasy football
//      and the easiest to make, because nothing on the page is red.
//   2. A starter on BYE. Scores exactly zero and looks completely normal.
//   3. A starter who is OUT or on injured reserve.
//   4. A bench player projected above one of your starters.
//   5. A free agent projected above one of your starters.
//   6. A bye week pile-up in the next six weeks, while you can still plan.
//   7. Injury and practice flags, with what each is measured to cost.
//
// THE INJURY NUMBERS ARE MEASURED, not guessed. Five seasons of weekly injury
// reports joined to results, each player week compared to the SAME player's
// average across his other games that season so player quality cancels out:
//
//   questionable and plays          -1.16
//   questionable, did not practise  -1.97
//   practice: full / limited / none  -0.31 / -0.68 / -1.26
//
// The practice column separates players better than the status word does, and
// the status word is the only one most fantasy sites show you. Practice reports
// publish Wednesday through Friday, so early in the week that column is
// legitimately empty and says so rather than guessing.

import process from "node:process";
import { games, injuries, idMap, num } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const SEASON = Number(arg("season", new Date().getFullYear()));
const LEAGUE = arg("league", process.env.ESPN_LEAGUE_ID || "");
const TEAM = Number(arg("team", process.env.ESPN_TEAM_ID || 0));
const WEEK_ARG = Number(arg("week", 0));
if (!LEAGUE || !TEAM) {
  console.error("Set ESPN_LEAGUE_ID and ESPN_TEAM_ID, or pass --league and --team.");
  process.exit(1);
}

const S2 = process.env.ESPN_S2 || "", SWID = process.env.ESPN_SWID || "";
const headers = { accept: "application/json", ...(S2 && SWID ? { cookie: `espn_s2=${S2}; SWID=${SWID}` } : {}) };
const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const SLOT = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 23: "FLEX", 20: "BE", 21: "IR" };
const PRO = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB",
  10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO",
  19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
  28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
const COST = { "no practice": -1.26, limited: -0.68, "full practice": -0.31, Q_none: -1.97, Q_any: -1.16 };
const practiceBucket = (p) => {
  const t = (p || "").trim().toLowerCase();
  if (t.startsWith("did not")) return "no practice";
  if (t.startsWith("limited")) return "limited";
  if (t.startsWith("full")) return "full practice";
  return null;
};

const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE}`;
// TWO REQUESTS ON PURPOSE. ESPN only includes a week projection when the URL
// asks for that scoring period, and the week itself comes from the league. Ask
// for settings first, work out the week, then fetch the roster FOR that week.
// Fetching once without the period returns every projection as zero, which is
// not an error and looks exactly like a roster of broken players.
const metaRes = await getJSON(`${base}?view=mSettings&view=mTeam&nocache=${Math.random()}`, { headers });
if (metaRes.fatal) { console.error("ESPN returned 401. Your cookies have expired; refresh ESPN_S2 and ESPN_SWID."); process.exit(2); }
if (!metaRes.ok) { console.error("ESPN did not answer after three tries: " + metaRes.soft + ". Nothing is wrong with your roster; try again in a few minutes."); process.exit(2); }
const meta = metaRes.json;
const week = WEEK_ARG || num(meta.status?.currentMatchupPeriod) || 1;

const lgRes = await getJSON(`${base}?view=mRoster&view=mSettings&view=mTeam&scoringPeriodId=${week}&nocache=${Math.random()}`, { headers });
if (!lgRes.ok) { console.error("ESPN did not answer after three tries: " + (lgRes.fatal || lgRes.soft)); process.exit(2); }
const lg = lgRes.json;
const team = (lg.teams || []).find((t) => t.id === TEAM);
if (!team) { console.error(`Team ${TEAM} is not in league ${LEAGUE}.`); process.exit(2); }
const sched = (await games()).filter((g) => Number(g.season) === SEASON);
const weekGames = (w) => sched.filter((g) => Number(g.week) === w);
const counts = lg.settings?.rosterSettings?.lineupSlotCounts || {};

// practice reports for the latest published week
let practiceBy = new Map(), practiceWeek = null;
try {
  const inj = await injuries(SEASON);
  practiceWeek = Math.max(...inj.map((r) => Number(r.week) || 0));
  const espnOf = await idMap(SEASON);
  for (const r of inj) {
    if (Number(r.week) !== practiceWeek || !r.gsis_id) continue;
    const id = espnOf.get(r.gsis_id);
    if (id) practiceBy.set(String(id), { practice: r.practice_status, part: r.report_primary_injury });
  }
} catch { /* early in a season the file may not exist yet */ }

const roster = (team.roster?.entries || []).map((e) => {
  const p = e.playerPoolEntry.player;
  const proj = (p.stats || []).find((s) => s.statSourceId === 1 && s.scoringPeriodId === week && Number(s.seasonId) === SEASON)?.appliedTotal ?? 0;
  return { id: p.id, name: p.fullName, pos: POS[p.defaultPositionId] || "?", team: PRO[p.proTeamId],
    slot: SLOT[e.lineupSlotId] ?? String(e.lineupSlotId), slotId: e.lineupSlotId,
    status: p.injuryStatus && p.injuryStatus !== "ACTIVE" ? p.injuryStatus : null, proj };
});
if (!roster.length) { console.log("This team has no players yet. Nothing to check."); process.exit(0); }

const starters = roster.filter((p) => p.slot !== "BE" && p.slot !== "IR");
const bench = roster.filter((p) => p.slot === "BE");
const alerts = [];

for (const [slotId, n] of Object.entries(counts)) {
  if (slotId === "20" || slotId === "21" || !n) continue;
  const filled = starters.filter((p) => String(p.slotId) === slotId).length;
  if (filled < n) alerts.push(`EMPTY SLOT: ${n - filled} ${SLOT[slotId] || slotId} unfilled. This scores zero.`);
}
{
  const gs = weekGames(week);
  if (gs.length) {
    const playing = new Set(gs.flatMap((g) => [g.home_team, g.away_team]));
    for (const p of starters)
      if (p.team && !playing.has(p.team)) alerts.push(`BYE: ${p.name} (${p.pos}, ${p.team}) is starting with no game in week ${week}.`);
  }
}
for (const p of starters)
  if (/^(OUT|INJURY_RESERVE|DOUBTFUL|SUSPENSION)$/.test(p.status || ""))
    alerts.push(`${p.status}: ${p.name} (${p.pos}) is in your starting lineup. That is a hole, not a discount.`);
for (const b of bench)
  for (const s of starters.filter((s) => s.pos === b.pos && b.proj > s.proj + 2 && !/^(OUT|INJURY_RESERVE)$/.test(b.status || "")))
    alerts.push(`Bench over starter: ${b.name} ${b.proj.toFixed(1)} beats your starter ${s.name} ${s.proj.toFixed(1)} at ${b.pos}.`);
try {
  const fa = await fetch(`${base}?view=kona_player_info&scoringPeriodId=${week}&nocache=${Math.random()}`, {
    headers: { ...headers, "x-fantasy-filter": JSON.stringify({ players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] }, limit: 60, sortPercOwned: { sortAsc: false, sortPriority: 1 } } }) },
  }).then((r) => r.json());
  const pool = (fa.players || []).map((e) => e.player).filter(Boolean).map((p) => ({
    name: p.fullName, pos: POS[p.defaultPositionId] || "?",
    proj: (p.stats || []).find((x) => x.statSourceId === 1 && x.scoringPeriodId === week && Number(x.seasonId) === SEASON)?.appliedTotal ?? 0,
    out: /OUT|INJURY_RESERVE/.test(p.injuryStatus || ""),
  })).filter((p) => !p.out);
  for (const st of starters) {
    if (st.pos === "D/ST" || st.pos === "K") continue;
    const better = pool.filter((f) => f.pos === st.pos && f.proj > st.proj + 3).sort((a, b) => b.proj - a.proj)[0];
    if (better) alerts.push(`On the wire: ${better.name} ${better.proj.toFixed(1)} is projected above your starter ${st.name} ${st.proj.toFixed(1)} at ${st.pos}.`);
  }
} catch { /* the pool is a nice to have */ }
for (let ahead = week + 1; ahead <= week + 6; ahead++) {
  const gs = weekGames(ahead);
  if (!gs.length) continue;
  const playing = new Set(gs.flatMap((g) => [g.home_team, g.away_team]));
  const off = starters.filter((p) => p.team && p.pos !== "D/ST" && !playing.has(p.team));
  if (off.length >= 3) alerts.push(`BYE PILE-UP in week ${ahead}: ${off.length} starters off (${off.map((p) => p.name).join(", ")}). Plan the bench now.`);
}

// injury and practice table
const flagged = [];
for (const p of roster) {
  const pr = practiceBy.get(String(p.id));
  const bucket = pr ? practiceBucket(pr.practice) : null;
  if (!p.status && !bucket) continue;
  let cost = null;
  if (p.status === "QUESTIONABLE") cost = bucket === "no practice" ? COST.Q_none : COST.Q_any;
  else if (bucket) cost = COST[bucket];
  flagged.push({ ...p, bucket, part: pr?.part, cost, starting: p.slot !== "BE" && p.slot !== "IR" });
}

console.log(`# Alerts, week ${week}\n`);
console.log(`${new Date().toLocaleString()}. Only problems are listed.\n`);
if (!alerts.length) console.log("No empty slots, nobody on bye, nobody out, nothing on the bench or the wire beating a starter.\n");
else { for (const a of [...new Set(alerts)]) console.log(`- ${a}`); console.log(""); }

if (flagged.length) {
  console.log("## Injury and practice\n");
  console.log(practiceWeek ? `Practice participation from the week ${practiceWeek} report.\n` : "Practice reports are not published yet this week.\n");
  console.log("| Slot | Player | Status | Practice | Body part | Measured cost |");
  console.log("|---|---|---|---|---|---|");
  flagged.sort((a, b) => (b.starting - a.starting) || ((a.cost ?? 0) - (b.cost ?? 0)));
  for (const f of flagged)
    console.log(`| ${f.starting ? `**${f.slot}**` : f.slot} | ${f.name} | ${f.status || "active"} | ${f.bucket || "not reported yet"} | ${f.part || "-"} | ${f.cost !== null ? f.cost.toFixed(2) : "-"} |`);
  console.log("");
  console.log("Costs are points per game against that player's own average, measured on");
  console.log("five seasons, for a player who plays. A man who is OUT is a lineup hole");
  console.log("rather than a discount, and is listed above instead.");
}
