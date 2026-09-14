// What the wider market is doing, and where it disagrees with us.
//
//   node tools/market.mjs            print
//   node tools/market.mjs --write    also write reports/market.md
//
// Local compute plus three free APIs with no keys. No model turn.
//
// THREE QUESTIONS, THREE SOURCES.
//
// 1. WHAT IS THE MARKET CLAIMING? Sleeper publishes trending adds across its
//    entire user base, which is a sample hundreds of thousands of times larger
//    than one league. A player the whole market is adding who is still
//    unrostered here is a window that is closing. A player nobody outside is
//    touching is one we can take our time over. Being last in waiver priority,
//    knowing which claims are already lost is worth as much as knowing which
//    are good.
//
// 2. WHERE IS THE MARKET MISPRICED? FantasyCalc publishes trade values. Those
//    are what a player COSTS. Value over replacement is what a player is WORTH
//    in a lineup. Where the two disagree there is an arbitrage: buy the players
//    the market underprices relative to lineup value, sell the ones it
//    overprices.
//
// 3. DOES WEATHER ACTUALLY MATTER, AND HOW MUCH? Rather than assert that wind
//    hurts, this MEASURES it: every outdoor game since 1999 carries a recorded
//    wind speed and a final score, so the effect can be estimated and then
//    applied to this week's forecast. If the measurement comes back flat, the
//    section says so and we stop adjusting for weather.

import fs from "node:fs";
import path from "node:path";
import { REPO, rosters, wire, games, trendingAdds, marketValues, forecast, STADIUM, num } from "../lib/data.mjs";

const doWrite = process.argv.includes("--write");
// Your team id, from ESPN_TEAM_ID in .env. Everything else about the league
// comes from the API, so this is the only thing that has to be told.
const MY_TEAM = Number(process.env.ESPN_TEAM_ID ||
  (fs.existsSync(new URL('../.env', import.meta.url))
    ? (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^ESPN_TEAM_ID=([0-9]+)/m) || [])[1]
    : 0) || 0);
if (!MY_TEAM) { console.error('Set ESPN_TEAM_ID in .env so this knows which team is yours.'); process.exit(2); }
const SEASON = 2026;
const SLOT_ID = { QB: 0, RB: 2, WR: 4, TE: 6, "D/ST": 16, K: 17 };

let owners = {};
try { owners = JSON.parse(fs.readFileSync(path.join(REPO, "league/owners.json"), "utf8")); } catch { /* optional: falls back to team numbers */ }
const who = (id) => (owners[id] && owners[id].name) || `team ${id}`;

const all = await rosters();
const ownerOf = new Map();
for (const t of all) for (const p of t.players) ownerOf.set(String(p.id), t.teamId);
const byName = new Map();
for (const t of all) for (const p of t.players) byName.set(p.name.toLowerCase(), { ...p, ownedBy: t.teamId });

const fa = await wire();
for (const p of fa) byName.set(p.name.toLowerCase(), { ...p, ownedBy: null });

// replacement level per position, from what is addable on demand
const repl = {};
for (const pos of Object.keys(SLOT_ID)) {
  const addable = fa.filter((p) => p.position === pos && p.availability !== "WAIVERS" && p.injuryStatus !== "OUT");
  repl[pos] = addable.length ? Math.max(...addable.map((p) => p.seasonProjection)) : 0;
}
const vor = (p) => (p.seasonProjection ?? 0) - (repl[p.position] ?? 0);

const L = [];
const say = (s = "") => L.push(s);
say("# Market view");
say("");
say("Local compute plus three free APIs. No model turn produced these numbers.");
say("");

// --- 1. what the market is claiming ----------------------------------------

const trend = await trendingAdds(24, 100);
say("## 1. What the whole market is adding, and whether we can still get him");
say("");
say("Sleeper trending adds over the last 24 hours, across its entire user base.");
say("A name high on this list that is still on our wire is a closing window.");
say("");
say("| Market rank | Player | Pos | Adds | Status in our league |");
say("|---|---|---|---|---|");
let shown = 0;
for (const t of trend) {
  const rec = byName.get((t.name || "").toLowerCase());
  if (!rec) continue;
  let status;
  if (rec.ownedBy === MY_TEAM) status = "**ours**";
  else if (rec.ownedBy) status = who(rec.ownedBy) + " has him";
  else status = rec.availability === "WAIVERS" ? "on waivers, needs a claim" : "**free agent, addable now**";
  say(`| ${t.rank} | ${t.name} | ${t.pos || rec.position} | ${t.adds.toLocaleString()} | ${status} |`);
  if (++shown >= 15) break;
}
if (!shown) say("| | _no trending player matched a name in this league_ | | | |");

const gettable = trend.filter((t) => {
  const r = byName.get((t.name || "").toLowerCase());
  return r && !r.ownedBy && r.availability !== "WAIVERS";
}).slice(0, 5);
say("");
if (gettable.length) {
  say("**Addable right now, and the market wants them:** " + gettable.map((g) => `${g.name} (market rank ${g.rank})`).join(", ") + ".");
  say("These need no claim and no priority. That is the cheapest edge on this page.");
} else {
  say("Nothing the market is chasing is addable here without winning a claim.");
}

// --- 2. market price against lineup value ----------------------------------

const mv = await marketValues({ ppr: 1, numQbs: 1 });
say("");
say("## 2. Where the market price disagrees with lineup value");
say("");
if (!mv.length) {
  say("_FantasyCalc did not respond, so there is no market price to compare against._");
} else {
  const priceOf = new Map(mv.map((m) => [m.name.toLowerCase(), m]));
  const rows = [];
  for (const t of all) {
    for (const p of t.players) {
      const m = priceOf.get(p.name.toLowerCase());
      if (!m || !m.value) continue;
      rows.push({ ...p, ownedBy: t.teamId, v: vor(p), price: m.value });
    }
  }
  if (rows.length < 10) say("_Too few names matched between the two sources to be worth reading._");
  else {
    // Rank within our league on each axis, then compare the ranks. Comparing a
    // trade value to a projection directly would be comparing two different
    // units; comparing ranks is unit free.
    const byVor = [...rows].sort((a, b) => b.v - a.v);
    const byPrice = [...rows].sort((a, b) => b.price - a.price);
    const vorRank = new Map(byVor.map((r, i) => [r.id, i + 1]));
    const priceRank = new Map(byPrice.map((r, i) => [r.id, i + 1]));
    for (const r of rows) r.gap = priceRank.get(r.id) - vorRank.get(r.id);

    say("Rank on what the market pays against rank on what he is worth in a lineup.");
    say("A positive gap means the market is cheaper than he plays: buy. Negative means");
    say("the market pays more than he plays: sell.");
    say("");
    say("| Player | Held by | Market rank | Lineup value rank | Gap |");
    say("|---|---|---|---|---|");
    const interesting = [...rows].sort((a, b) => b.gap - a.gap);
    for (const r of interesting.slice(0, 6))
      say(`| ${r.name} | ${r.ownedBy === MY_TEAM ? "**us**" : who(r.ownedBy)} | ${priceRank.get(r.id)} | ${vorRank.get(r.id)} | +${r.gap} buy |`);
    for (const r of interesting.slice(-6).reverse())
      say(`| ${r.name} | ${r.ownedBy === MY_TEAM ? "**us**" : who(r.ownedBy)} | ${priceRank.get(r.id)} | ${vorRank.get(r.id)} | ${r.gap} sell |`);
    say("");
    const ourSells = interesting.filter((r) => r.ownedBy === MY_TEAM).slice(-3).reverse();
    if (ourSells.length) say("**Ours the market overpays for:** " + ourSells.map((r) => r.name).join(", ") + ". Those are the pieces to trade.");
  }
}

// --- 3. does weather actually matter -----------------------------------------

const g = await games();
say("");
say("## 3. Weather, measured rather than assumed");
say("");
const outdoor = g.filter((x) => x.roof === "outdoors" && x.wind !== "" && x.away_score !== "" && num(x.season) >= 2006);
if (outdoor.length < 500) say("_Not enough recorded outdoor games to measure anything._");
else {
  const bucket = (w) => (w < 8 ? "calm, under 8" : w < 15 ? "moderate, 8 to 14" : w < 20 ? "windy, 15 to 19" : "gale, 20 plus");
  const agg = {};
  for (const x of outdoor) {
    const b = bucket(num(x.wind));
    const a = agg[b] || (agg[b] = { n: 0, pts: 0 });
    a.n++; a.pts += num(x.away_score) + num(x.home_score);
  }
  const order = ["calm, under 8", "moderate, 8 to 14", "windy, 15 to 19", "gale, 20 plus"];
  say(`Every outdoor game since 2006 with a recorded wind speed, ${outdoor.length.toLocaleString()} of them.`);
  say("");
  say("| Wind | Games | Mean combined points |");
  say("|---|---|---|");
  for (const b of order) if (agg[b]) say(`| ${b} | ${agg[b].n.toLocaleString()} | ${(agg[b].pts / agg[b].n).toFixed(1)} |`);
  const calm = agg[order[0]], gale = agg[order[3]];
  if (calm && gale) {
    const drop = (calm.pts / calm.n) - (gale.pts / gale.n);
    say("");
    say(`A gale costs about **${drop.toFixed(1)} combined points** against a calm game, which is`);
    say(drop > 3
      ? "large enough to matter for a kicker and for a passing game, and worth acting on."
      : "small enough that adjusting lineups for wind is not worth the complexity. Measured, not assumed.");
  }
}

// this week's forecast for outdoor games touching our roster
const ourTeams = new Set((all.find((t) => t.teamId === MY_TEAM)?.players || []).map((p) => p.proTeam));
const thisWeek = g.filter((x) => num(x.season) === SEASON && num(x.week) >= 1 && num(x.week) <= 3 && x.roof === "outdoors");
const relevant = thisWeek.filter((x) => ourTeams.has(x.home_team) || ourTeams.has(x.away_team)).slice(0, 8);
if (relevant.length) {
  say("");
  say("### Forecast where we have players, outdoor games only");
  say("");
  say("| Game | Kickoff | Wind mph | Temp F | Rain chance |");
  say("|---|---|---|---|---|");
  for (const x of relevant) {
    const wx = await forecast(x.home_team);
    if (!wx) continue;
    const target = `${x.gameday}T${(x.gametime || "13:00").slice(0, 2)}:00`;
    let i = wx.time.findIndex((t) => t.startsWith(target.slice(0, 13)));
    if (i < 0) i = 0;
    say(`| ${x.away_team} at ${x.home_team} | ${x.gameday} ${x.gametime || ""} | ${Math.round(wx.wind[i] ?? 0)} | ${Math.round(wx.temp[i] ?? 0)} | ${wx.precip[i] ?? 0}% |`);
  }
  say("");
  say("Open-Meteo, free and keyless. Indoor games are omitted because the roof settles it.");
}

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) { fs.writeFileSync(path.join(REPO, "reports", "market.md"), text); console.log("written: reports/market.md"); }
