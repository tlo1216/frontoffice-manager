// Kickers and defenses: stop picking the player, start picking the game.
//
//   node tools/stream-check.mjs --week 2
//   node tools/stream-check.mjs --week 2 --write      file the swap
//
// Local compute plus a few ESPN reads. No model turn.
//
// MEASURED FIRST, 2021 to 2025 nflverse box scores against the Vegas lines
// for those games, and the numbers are the whole argument.
//
//   KICKERS, 2,845 player weeks. Mean 8.08 a game, standard deviation 4.60, so
//   they do swing week to week. But:
//     week to week persistence, same kicker     r = 0.029
//     correlation with his team's implied total r = 0.133
//     bottom quarter implied total  7.04 pts
//     top quarter implied total     8.77 pts      a spread of 1.73 a week
//
//   DEFENSES, 2,848 team weeks, points-allowed component only:
//     week to week persistence, same defense            r = 0.042
//     correlation with the OPPONENT's implied total      r = -0.382
//     facing a bottom quarter offense   +1.14 pts
//     facing a top quarter offense      -0.68 pts         a spread of 1.83 a week
//
// Two conclusions, and they point the same way.
//
// WHO THE KICKER IS DOES NOT MATTER. A persistence of 0.029 means last week's
// big game tells you essentially nothing about this week's. Every minute spent
// deciding which kicker is "good" is wasted, and so is every waiver claim made
// to acquire one on the strength of a hot streak.
//
// WHICH GAME HE IS IN DOES. That -0.382 is a strong relationship by the
// standard of anything measurable in fantasy football: bigger than a typical
// home-field edge, bigger than the implied-total effect on a skill player. And
// the 1.83 is a floor, not a ceiling, because it counts only points allowed.
// Sacks and turnovers also arrive more often against bad offenses, and they
// are not in this measurement.
//
// Together, streaming both is worth roughly 3.6 points a week, near enough 58
// over a season, for two claims a week that cost nothing in a league where
// nobody else wants a kicker.
//
// THE ONE THING THAT WOULD MAKE THIS WRONG is a league where the wire has no
// kicker or defense worth having. So this compares against what is ACTUALLY
// available in your league rather than against a league-wide ideal, and says
// plainly when the one you already hold is the best of them.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, num, games, pendingAdds, espnHeaders, espnConfig } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const cfg = espnConfig();
const SEASON = Number(arg("season", cfg.season));
const LEAGUE = arg("league", cfg.leagueId);
const TEAM = Number(arg("team", cfg.teamId));
const WEEK = Number(arg("week", 0));
const doWrite = argv.includes("--write");
if (!LEAGUE || !TEAM) { console.error("Set ESPN_LEAGUE_ID and ESPN_TEAM_ID in .env, or pass --league and --team."); process.exit(2); }

// THE THRESHOLD IS IN FANTASY POINTS, NOT IN VEGAS POINTS. Two points of
// implied scoring converts to about 0.6 fantasy points for a kicker, which is
// nowhere near worth a waiver claim and a roster spot even though "2" sounds
// like it might be. The conversion is the measured slope: 1.73 fantasy points
// across roughly 5.5 implied points for a kicker, 1.83 across the same for a
// defense.
const K_SLOPE = 1.73 / 5.5;      // fantasy points per point of implied total
const D_SLOPE = 1.83 / 5.5;
const MIN_EDGE = Number(arg("min-edge", 1.5));   // in FANTASY points

const headers = espnHeaders();

function mcp(tool, args) {
  const r = spawnSync(process.execPath, [path.join(REPO, "tools/mcp-call.mjs"), tool, JSON.stringify(args)],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") };
}

// --- the Vegas numbers for the week ----------------------------------------
const g = await games();
const week = WEEK || (() => {
  // Fall back to the first week of this season with no score on file.
  const unplayed = g.filter((x) => Number(x.season) === SEASON && !x.away_score)
    .map((x) => num(x.week)).sort((a, b) => a - b);
  return unplayed[0] || 1;
})();

const ownImplied = new Map(), oppImplied = new Map(), opponent = new Map();
for (const x of g) {
  if (Number(x.season) !== SEASON || num(x.week) !== week) continue;
  if (!x.total_line || !x.spread_line) continue;
  const t = num(x.total_line), sp = num(x.spread_line);
  ownImplied.set(x.home_team, t / 2 + sp / 2); oppImplied.set(x.home_team, t / 2 - sp / 2);
  ownImplied.set(x.away_team, t / 2 - sp / 2); oppImplied.set(x.away_team, t / 2 + sp / 2);
  opponent.set(x.home_team, x.away_team); opponent.set(x.away_team, x.home_team);
}

// ESPN's numeric pro team ids to the abbreviations nflverse uses.
const PRO = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN", 17: "NE",
  18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA",
  27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };

const L = [];
const say = (s = "") => L.push(s);
say(`# Streaming kickers and defenses, week ${week}`);
say("");
if (!ownImplied.size) {
  say(`**No Vegas lines are published for week ${week} yet.** Every recommendation here would be`);
  say("a guess dressed as arithmetic, so there are none. Try again closer to the games.");
  say("");
  console.log(L.join("\n"));
  process.exit(0);
}
say("A kicker is picked by his own team's implied total, a defense by its opponent's.");
say("Measured 2021 to 2025: kicker persistence week to week is 0.029 and defense 0.042,");
say("so who they are barely matters; the matchup is worth 1.73 and 1.83 points a week.");
say("");

let swaps = 0, filed = 0;

const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${cfg.sport}/seasons/${SEASON}/segments/0/leagues/${LEAGUE}`;
const res = await getJSON(`${base}?view=mRoster&view=mSettings&nocache=${Math.random()}`, { headers });
if (!res.ok) { say(`Could not read the league: ${res.fatal || res.soft}`); console.log(L.join("\n")); process.exit(2); }
const me = (res.json.teams || []).find((t) => t.id === TEAM);
if (!me) { say(`Team ${TEAM} not found.`); console.log(L.join("\n")); process.exit(2); }

// WHAT WE ALREADY CLAIMED IS NOT STILL AVAILABLE TO CLAIM. A pending claim has
// not changed the roster, so the bad matchup it was filed to fix still reads
// as bad. Run on a schedule without this, the tool files the same swap every
// morning until the waiver run settles it, which looks to a league like
// somebody spamming the wire.
const claimed = await pendingAdds(TEAM);
if (claimed.size) { say(`Already claimed and waiting: ${[...claimed].join(", ")}.`); say(""); }

for (const [pos, slotId] of [["K", 17], ["D/ST", 16]]) {
  const mine = (me.roster?.entries || [])
    .map((e) => e.playerPoolEntry.player)
    .filter((p) => (pos === "K" ? p.defaultPositionId === 5 : p.defaultPositionId === 16));

  const k = await getJSON(`${base}?view=kona_player_info&nocache=${Math.random()}`, {
    headers: { ...headers, "x-fantasy-filter": JSON.stringify({ players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      filterSlotIds: { value: [slotId] }, limit: 40,
      sortPercOwned: { sortPriority: 1, sortAsc: false, value: null } } }) } });
  if (!k.ok) { say(`Could not read the ${pos} wire: ${k.fatal || k.soft}`); continue; }

  // THE NUMBER THAT RANKS THEM. For a kicker it is his own offense; for a
  // defense it is the offense it has to stop, negated so that higher is
  // always better and the two read the same way.
  const score = (team) => pos === "K"
    ? (ownImplied.has(team) ? ownImplied.get(team) : null)
    : (oppImplied.has(team) ? -oppImplied.get(team) : null);
  const show = (team) => pos === "K"
    ? `${team} implied ${ownImplied.get(team)?.toFixed(1)}`
    : `${team} vs ${opponent.get(team)} implied ${oppImplied.get(team)?.toFixed(1)}`;

  const rank = (p, status) => {
    const team = PRO[p.proTeamId];
    return { id: p.id, name: p.fullName, team, status: status || "ROSTERED", s: team ? score(team) : null };
  };
  const held = mine.map((p) => rank(p)).filter((x) => x.s !== null);
  // STATUS COMES FROM THE WIRE ROW, NOT FROM AN ASSUMPTION. A defense sitting
  // on waivers cannot be added outright, and the MCP refuses it rather than
  // pretending. A defense that was just dropped is exactly the one in a good
  // spot, so this is not an edge case worth skipping.
  const wire = (k.json.players || []).map((x) => rank(x.player, x.status))
    .filter((x) => x.s !== null)
    // A claim already in flight has not changed the roster yet, so without
    // this the same swap is proposed and filed again every morning until the
    // waiver run settles it.
    .filter((x) => !claimed.has(x.name))
    .sort((a, b) => b.s - a.s);

  // A man on bye has no game and therefore no number. He is not "the worst
  // option", he is not an option, and both sides above already exclude him by
  // having no line for his team this week.
  if (!held.length) {
    const best = wire[0];
    say(`**No ${pos} on the roster plays in week ${week}.** ` +
      (best ? `Best available is ${best.name}, ${show(best.team)}.` : "And nothing on the wire plays either."));
    say("");
    continue;
  }
  const ours = held.reduce((a, b) => (b.s > a.s ? b : a));
  const best = wire[0];
  if (!best || best.s <= ours.s) {
    say(`${pos}: keeping ${ours.name}, ${show(ours.team)}. Nothing available is in a better spot.`);
    say("");
    continue;
  }

  const edge = (best.s - ours.s) * (pos === "K" ? K_SLOPE : D_SLOPE);
  const impliedGap = best.s - ours.s;
  say(`**${pos}: ${best.name} is in a better game than ${ours.name}.**`);
  say(`- Ours: ${show(ours.team)}`);
  say(`- Best available: ${show(best.team)}`);
  say(`- Difference: ${impliedGap.toFixed(1)} points of implied scoring, worth about ` +
    `**${edge.toFixed(1)} fantasy points** on the measured slope.`);

  if (edge < MIN_EDGE) {
    say(`- Leaving it. Under ${MIN_EDGE} fantasy points is not worth a claim and a roster spot.`);
    say("");
    continue;
  }
  swaps++;
  if (!doWrite) { say("- Not filed: proposal only."); say(""); continue; }

  if (best.status === "FREEAGENT") {
    const r = mcp("add_free_agent", { league_id: String(LEAGUE), team_id: TEAM,
      add_player_id: best.id, drop_player_id: ours.id, dry_run: false });
    const v = await getJSON(`${base}?view=mRoster&nocache=${Math.random()}`, { headers });
    const names = v.ok ? ((v.json.teams || []).find((t) => t.id === TEAM)?.roster?.entries || [])
      .map((e) => e.playerPoolEntry.player.fullName) : [];
    const landed = names.includes(best.name) && !names.includes(ours.name);
    say(landed ? `- **Verified on a fresh read:** ${best.name} in, ${ours.name} out.`
               : `- **Not verified.** ${r.out.slice(0, 200)}`);
    if (landed) filed++;
  } else {
    const acq = res.json.settings?.acquisitionSettings || {};
    const bid = acq.isUsingAcquisitionBudget === true ? Math.max(1, num(acq.minimumBid) || 1) : undefined;
    const r = mcp("waiver_claim", { league_id: String(LEAGUE), team_id: TEAM,
      add_player_id: best.id, drop_player_id: ours.id, ...(bid ? { bid } : {}), dry_run: false });
    const pend = mcp("get_pending", { team_id: TEAM });
    const held2 = pend.ok && pend.out.includes(best.name);
    say(held2 ? `- **Filed as a waiver claim${bid ? ` at ${bid}` : ""}** and ESPN is holding it. A streamed
defense is worth the minimum bid and no more: the edge is the matchup, not the name.`
              : `- **Not verified.** ${r.out.slice(0, 200)}`);
    if (held2) filed++;
  }
  say("");
}

say("---");
say(`${swaps} swap(s) worth making, ${filed} filed.`);
say("");
say("A reminder of what this is NOT doing: it is not trying to find a good kicker.");
say("There is no such thing week to week. It is buying the matchup, every week, for");
say("free, and the only way it loses is if somebody else in the league starts doing");
say("the same and the wire runs dry.");

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) { fs.writeFileSync(path.join(REPO, "reports", "stream-check.md"), text); console.log("written: reports/stream-check.md"); }
