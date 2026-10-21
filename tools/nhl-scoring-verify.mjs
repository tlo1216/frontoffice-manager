// Does your hockey config's scoring map reproduce ESPN's own totals, on real
// players, right now?
//
//   node tools/nhl-scoring-verify.mjs
//   node tools/nhl-scoring-verify.mjs --limit 300 --json
//   node tools/nhl-scoring-verify.mjs --config other.json
//
// Read only: one ESPN GET, nothing written anywhere.
//
// WHY THIS EXISTS. A points league prices every player as the dot product of
// its scoring map (points per unit of each ESPN stat id) and his stats. ESPN
// computes the same thing and publishes it as appliedTotal. If the two agree
// on hundreds of players across every position, the map is right; if they do
// not, every value built on it is wrong in a way no single line shows. The
// football side of a kit like this checks its formula against appliedTotal in
// several places. Hockey had no such check, and a scoring map was once
// changed in six places mid-setup while a one-off check from the week before
// still read as proof.
//
// It reads the config file directly rather than through lib/nhl-config.mjs, on
// purpose: it has to stay correct on its own, so it can say when the shared
// config-reading code or the config itself is what is wrong.
//
// Exit 0 when every player reproduces within tolerance; 1 on a mismatch; 2 when
// the league cannot be read; 3 when the sample is too thin to mean anything.

import fs from "node:fs";
import path from "node:path";
import { REPO, espnConfig, espnHeaders, num } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const AS_JSON = argv.includes("--json");
const LIMIT = Number(arg("limit", 300)) || 300;
const CONFIG_ARG = arg("config", process.env.FRONTOFFICE_HOCKEY_CONFIG || "league/hockey-league.json");
const CONFIG_PATH = path.isAbsolute(CONFIG_ARG) ? CONFIG_ARG : path.join(REPO, CONFIG_ARG);

// The largest gap between our dot product and ESPN's appliedTotal that still
// counts as reproduced. Chosen, not measured: ESPN prints appliedTotal to two
// decimals, so anything inside that rounding is noise, not a wrong formula.
const TOLERANCE = 0.05;

// Below these the sample is too thin for "0 mismatches" to mean anything: it
// could just mean the sample never touched a rare stat id.
const MIN_PLAYERS_WITH_ENTRY = 40;
const MIN_PER_POSITION = 5;

const POSNAME = { 1: "C", 2: "LW", 3: "RW", 4: "D", 5: "G" };

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`no hockey config at ${CONFIG_PATH}. This checks the config's own scoring.byStatId; it will not invent one.`);
  process.exit(2);
}
const L = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const env = espnConfig();
const LEAGUE = String(arg("league", L.id || (env.sport === "fhl" ? env.leagueId : "")) || "");
const season = Number(L.season);
const byStatId = L.scoring?.byStatId || {};
if (!LEAGUE || !season || !Object.keys(byStatId).length) {
  console.error(`${CONFIG_PATH} has no ${!LEAGUE ? "league id" : !season ? "season" : "scoring.byStatId"} to check. ` +
    "The config looks incomplete, not wrong; tools/nhl-league-verify.mjs prints the live values to fill it from.");
  process.exit(2);
}

let headers;
try { headers = espnHeaders(); } catch (e) { console.error(e.message); process.exit(2); }
const res = await getJSON(
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/${season}/segments/0/leagues/${LEAGUE}` +
  `?view=kona_player_info&nocache=${Date.now()}`,
  { headers: { ...headers, "x-fantasy-filter": JSON.stringify({ players: {
    limit: LIMIT, sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "STANDARD" } } }) } });

if (!res.ok) {
  // A dead cookie gets its own line: everything downstream of it looks like a
  // scoring bug otherwise, and somebody debugs the wrong layer.
  const msg = res.fatal || res.soft || "unknown failure";
  if (/\b40[13]\b/.test(msg)) console.error("ESPN refused the cookies; log in again and refresh ESPN_S2 and ESPN_SWID.");
  console.error(`could not read league ${LEAGUE} season ${season}: ${msg}`);
  process.exit(2);
}

const rawPlayers = res.json.players || [];
if (!rawPlayers.length) {
  console.error(`ESPN returned 0 players for league ${LEAGUE} season ${season}. The league id, the season or the ` +
    "x-fantasy-filter shape is wrong; a real player pool is never empty.");
  process.exit(2);
}

// Check EVERY season projection entry a player carries: statSourceId 1
// (projection), scoringPeriodId 0 (season), seasonId matching the league, at
// ANY split. The dot product must reproduce appliedTotal on each, and reading
// them all means the day ESPN adds a rest-of-season split for hockey (only
// split 0 existed when this was written) it gets verified instead of ignored.
// The splits seen are printed so that day is visible.
let noEntry = 0, checked = 0, maxAbsError = 0;
const byPos = { 1: [], 2: [], 3: [], 4: [], 5: [] };
const statIdsSeenNonzero = new Set();
const byStatIdEverNonzero = new Set();
const identity = { total: 0, violations: [] };
const splitsSeen = new Map();
const mismatches = [];

for (const entry of rawPlayers) {
  const p = entry.player;
  if (!p) continue;
  const entries = (p.stats || []).filter((s) => s.statSourceId === 1 && s.scoringPeriodId === 0 && Number(s.seasonId) === season);
  if (!entries.length) { noEntry++; continue; }
  checked++;
  if (byPos[p.defaultPositionId]) byPos[p.defaultPositionId].push(p.fullName);

  for (const stat of entries) {
    splitsSeen.set(stat.statSplitTypeId, (splitsSeen.get(stat.statSplitTypeId) || 0) + 1);
    const stats = stat.stats || {};
    const appliedTotal = num(stat.appliedTotal);
    // Every stat id the pool carries nonzero, scored here or not: the list of
    // candidates for a stat your league might score that the map is missing.
    for (const [id, v] of Object.entries(stats)) if (num(v) !== 0) statIdsSeenNonzero.add(id);

    let ours = 0;
    const contributions = {};
    for (const [id, weight] of Object.entries(byStatId)) {
      const v = num(stats[id]);
      if (v !== 0) byStatIdEverNonzero.add(id);
      const c = num(weight) * v;
      if (c !== 0) contributions[id] = c;
      ours += c;
    }
    const diff = Math.abs(ours - appliedTotal);
    if (diff > maxAbsError) maxAbsError = diff;
    if (diff > TOLERANCE)
      mismatches.push({ name: p.fullName, position: POSNAME[p.defaultPositionId] || `id${p.defaultPositionId}`,
        split: stat.statSplitTypeId, ourTotal: ours, appliedTotal, diff, contributions });

    // Goals (13) plus assists (14) equals points (16), wherever all three are
    // carried. A check on the raw stats, independent of your weights: the
    // closest thing available to an ESPN-verified fact about what id 16 means.
    if (stats["13"] !== undefined && stats["14"] !== undefined && stats["16"] !== undefined) {
      identity.total++;
      if (num(stats["13"]) + num(stats["14"]) !== num(stats["16"]))
        identity.violations.push({ name: p.fullName, g: num(stats["13"]), a: num(stats["14"]), pts: num(stats["16"]) });
    }
  }
}

// Sample thinness, before trusting anything above.
const posCounts = Object.fromEntries(Object.entries(byPos).map(([id, arr]) => [POSNAME[id], arr.length]));
const thin = Object.entries(posCounts).filter(([, n]) => n < MIN_PER_POSITION);
if (checked < MIN_PLAYERS_WITH_ENTRY || thin.length) {
  console.error(`sample too thin: ${checked} players had a usable projection (need ${MIN_PLAYERS_WITH_ENTRY}), ` +
    `positions below ${MIN_PER_POSITION}: ${thin.length ? thin.map(([p, n]) => `${p}=${n}`).join(", ") : "none"}. ` +
    "A clean result over a sample this thin would not mean the map is right. Before projections are published there is nothing to check yet.");
  process.exit(3);
}

const neverNonzero = Object.keys(byStatId).filter((id) => !byStatIdEverNonzero.has(id));
const unscored = [...statIdsSeenNonzero].filter((id) => !(id in byStatId)).sort((a, b) => Number(a) - Number(b));

if (AS_JSON) {
  console.log(JSON.stringify({
    season, playersReturned: rawPlayers.length, players: checked, noEntry, positionCounts: posCounts,
    projectionSplitsSeen: Object.fromEntries([...splitsSeen].sort()), maxAbsError, tolerance: TOLERANCE,
    mismatches: mismatches.length, mismatchDetail: mismatches,
    identityChecked: identity.total, identityViolations: identity.violations.length, identityViolationDetail: identity.violations,
    byStatIdNeverNonzero: neverNonzero, statIdsObservedNonzeroButUnscored: unscored,
  }, null, 2));
} else {
  console.log(`season ${season}: ${rawPlayers.length} players returned, ${checked} had a usable projection ` +
    `(${noEntry} did not and were skipped).`);
  console.log(`per position: ${Object.entries(posCounts).map(([p, n]) => `${p}=${n}`).join(", ")}`);
  console.log(`projection splits carried (statSplitTypeId: entries): ${[...splitsSeen].sort().map(([k, n]) => `${k}: ${n}`).join(", ")}`);
  console.log(`max abs error vs ESPN appliedTotal: ${maxAbsError.toFixed(6)} (tolerance ${TOLERANCE})\n`);
  if (mismatches.length) {
    console.log(`${mismatches.length} mismatch(es):`);
    for (const m of mismatches)
      console.log(`  ${m.name} (${m.position}): ours ${m.ourTotal.toFixed(4)} vs ESPN ${m.appliedTotal.toFixed(4)} ` +
        `(diff ${m.diff.toFixed(4)}), contributions: ${JSON.stringify(m.contributions)}`);
  } else console.log("no mismatches.");
  console.log(`\ngoals + assists = points (ids 13 + 14 = 16): checked ${identity.total}, ${identity.violations.length} violation(s).`);
  for (const v of identity.violations) console.log(`  ${v.name}: g=${v.g} a=${v.a} pts=${v.pts}`);
  console.log(`\nscored ids never nonzero in this sample: ${neverNonzero.length ? neverNonzero.join(", ") : "none"}`);
  console.log(`ids carried nonzero that your map does not score: ${unscored.length ? unscored.join(", ") : "none"}`);
  console.log(`\n${mismatches.length} mismatches over ${checked} players (max abs error ${maxAbsError.toFixed(6)})`);
}

process.exit(mismatches.length === 0 && identity.violations.length === 0 ? 0 : 1);
