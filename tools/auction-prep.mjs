// Auction (salary cap) draft values.
//
// SCORING IS INHERITED, NOT COMPUTED. Every dollar here is seasonProjection
// minus replacement, and those projections come from ESPN for a specific
// league, so the board is full PPR or half PPR entirely according to which
// league supplied them. An earlier version computed a half-PPR historical curve,
// never used the result, and printed "half-PPR" over every board it produced.
//
//   node tools/auction-prep.mjs --teams 10 --budget 200 --roster 16
//   node tools/auction-prep.mjs --league <id> --write     once the league exists
//
// Local compute, no model turn.
//
// WHY AN AUCTION IS A DIFFERENT PROBLEM. In a snake draft the only question is
// who is best available, so a ranked queue answers everything. In an auction any
// player can be had for money, so ranking is nearly useless: what matters is a
// MAXIMUM BID, and the discipline to stop one dollar above it. The whole game is
// not overpaying for the player you like.
//
// HOW VALUES ARE DERIVED. The standard method, and it is standard because it is
// right: money is finite and only value ABOVE REPLACEMENT can justify spending.
//
//   1. The league's whole budget is teams x cap.
//   2. Every roster spot costs at least one dollar, so reserve that first.
//   3. What is left is the money chasing value over replacement.
//   4. A player's share of that money equals his share of the league's total
//      value over replacement, plus his one dollar.
//
// A consequence people get wrong: replacement-level players are worth exactly
// one dollar, not "cheap". If a position has ten startable players and ten
// teams, the tenth is worth a dollar no matter how good he looks in isolation.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, num } from "../lib/data.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const LEAGUE = arg("league", "");
const TEAMS = Number(arg("teams", 10));
const BUDGET = Number(arg("budget", 200));
const ROSTER = Number(arg("roster", 16));
const doWrite = argv.includes("--write");

const SEASONS = [2021, 2022, 2023, 2024, 2025];
const SLOT_ID = { QB: 0, RB: 2, WR: 4, TE: 6, "D/ST": 16, K: 17 };
// Sensible ESPN public-league default; overridden by the league once we have it.
let STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, "D/ST": 1, K: 1 };
let FLEX = 1;

function mcp(tool, args) {
  const r = spawnSync(process.execPath, [path.join(REPO, "tools/mcp-call.mjs"), tool, JSON.stringify(args)], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  let out = r.stdout || "";
  const n = out.indexOf("-- Response truncated");
  if (n >= 0) out = out.slice(0, n);
  const end = Math.max(out.lastIndexOf("]"), out.lastIndexOf("}"));
  if (end < 0) throw new Error(`${tool}: no JSON`);
  return JSON.parse(out.slice(0, end + 1));
}

// --- current pool -----------------------------------------------------------

function pool() {
  const all = [];
  for (const slotId of Object.values(SLOT_ID)) {
    const args = { position_slot_id: slotId, limit: 60, sort_by: "projection" };
    if (LEAGUE) args.league_id = String(LEAGUE);
    try { all.push(...mcp("get_free_agents", args)); } catch {}
  }
  const seen = new Set();
  return all.filter((p) => !seen.has(p.id) && seen.add(p.id));
}

if (LEAGUE) {
  try {
    const lg = mcp("get_league", { league_id: String(LEAGUE) });
    const c = lg.rosterSlotCounts || {};
    STARTERS = { QB: num(c["0"]), RB: num(c["2"]), WR: num(c["4"]), TE: num(c["6"]), "D/ST": num(c["16"]), K: num(c["17"]) };
    FLEX = num(c["23"]);
    console.error(`read league ${LEAGUE}: ${JSON.stringify(STARTERS)} flex ${FLEX}`);
  } catch { console.error("could not read the league; using defaults"); }
}

const players = pool();
if (players.length < 50) { console.error(`Only ${players.length} players returned. Check the league id and cookies.`); process.exit(2); }

// GUARD: without a league id the MCP answers from the league in .env, which is
// already drafted, so the "available pool" is that league's leftovers. The first
// run of this produced Braelon Allen as the most valuable player in football at
// $71, with Gibbs and Nacua absent entirely, and formatted it beautifully.
//
// A pool that has not been drafted from must contain several players projected
// above 300. If the best player available projects like a flex back, this is not
// a draft pool and no amount of correct arithmetic downstream will fix it.
const best = Math.max(...players.map((p) => p.seasonProjection));
const elite = players.filter((p) => p.seasonProjection > 300).length;
if (!LEAGUE) {
  console.error("ABORT: no --league given, so the player pool came from the league in .env, which is already drafted.");
  console.error("Auction values computed from one league's leftovers are meaningless. Pass --league <id> for the new league.");
  process.exit(2);
}
if (elite < 3) {
  console.error(`ABORT: the pool's best projection is ${best.toFixed(0)} and only ${elite} players clear 300.`);
  console.error("That is a drafted league's remainder, not a draft pool. Check the league id.");
  process.exit(2);
}

// If the pool came from a full-PPR league, convert projections toward half-PPR
// using the historical ratio at each position. Stated, not hidden: this is an
// approximation and is unnecessary once the real league supplies its own
// projections.
const NOTE = LEAGUE ? "projections come from the league itself, so scoring already matches"
                    : "projections are full-PPR and scaled toward half-PPR by the historical ratio at each position";
const RATIO = { QB: 1.0, RB: 0.93, WR: 0.88, TE: 0.89, "D/ST": 1.0, K: 1.0 };
for (const p of players) if (!LEAGUE) p.seasonProjection *= (RATIO[p.position] ?? 0.92);

// --- replacement and dollar values ------------------------------------------

const repl = {};
for (const [pos, n] of Object.entries(STARTERS)) {
  if (!n) continue;
  const flexShare = ["RB", "WR", "TE"].includes(pos) ? FLEX / 3 : 0;
  const idx = Math.round(TEAMS * (n + flexShare));
  const l = players.filter((p) => p.position === pos).sort((a, b) => b.seasonProjection - a.seasonProjection);
  repl[pos] = l[idx] ? l[idx].seasonProjection : (l.length ? l[l.length - 1].seasonProjection : 0);
}

const OUT = new Set(["OUT", "INJURY_RESERVE", "DOUBTFUL"]);
const priced = players
  .filter((p) => repl[p.position] !== undefined && !OUT.has(p.injuryStatus))
  .map((p) => ({ ...p, vor: p.seasonProjection - repl[p.position] }))
  .filter((p) => p.vor > 0)
  .sort((a, b) => b.vor - a.vor);

const totalMoney = TEAMS * BUDGET;
const reserved = TEAMS * ROSTER;            // one dollar a slot, which every team must keep
const discretionary = totalMoney - reserved;
const totalVor = priced.reduce((s, p) => s + p.vor, 0);
for (const p of priced) p.dollars = Math.max(1, Math.round((p.vor / totalVor) * discretionary) + 1);

// --- report -----------------------------------------------------------------

const L = [];
const say = (s = "") => L.push(s);
say(`# Auction values${LEAGUE ? `, league ${LEAGUE}, its own scoring` : " (pre-join estimate)"}`);
say("");
say(`${TEAMS} teams, $${BUDGET} cap, ${ROSTER} roster spots. Starters: ` +
  Object.entries(STARTERS).filter(([, n]) => n).map(([p, n]) => `${n} ${p}`).join(", ") + (FLEX ? `, ${FLEX} FLEX` : "") + ".");
say(`Total money in the room: $${totalMoney}. Reserved at a dollar a slot: $${reserved}. Chasing value: $${discretionary}.`);
say("");
say(`Note on scoring: ${NOTE}.`);
say("");
say("## How to use this");
say("");
say("These are **maximum bids**, not predictions of the price. Bid up to the number");
say("and stop. Winning a player one dollar over his value is a small loss; winning");
say("four of them is the season.");
say("");
say("The discipline that actually wins auctions is the boring one: nominate players");
say("you do not want early, while everyone still has money, and let other people");
say("spend it. Your own targets should come up when the room is short of cash.");
say("");
say("Anyone not on this list is worth exactly **$1**. That is not a figure of");
say("speech: a replacement-level player has no value above what is freely");
say("available, so a dollar is the correct price and a second dollar is an error.");
say("");
say("## Values");
say("");
say("| Player | Pos | Team | Projection | Over replacement | **Max bid** |");
say("|---|---|---|---|---|---|");
for (const p of priced.slice(0, 90))
  say(`| ${p.name} | ${p.position} | ${p.proTeam || ""} | ${p.seasonProjection.toFixed(0)} | +${p.vor.toFixed(0)} | **$${p.dollars}** |`);

say("");
say("## Budget shape");
say("");
const byPos = {};
for (const p of priced.slice(0, TEAMS * 9)) byPos[p.position] = (byPos[p.position] || 0) + p.dollars;
const totalTop = Object.values(byPos).reduce((a, b) => a + b, 0);
say("Where the league's money should go, by position, if everyone bid these values.");
say("");
say("| Position | Share of the money |");
say("|---|---|");
for (const [pos, v] of Object.entries(byPos).sort((a, b) => b[1] - a[1]))
  say(`| ${pos} | ${((v / totalTop) * 100).toFixed(0)}% |`);
say("");
say("Spend against that shape. A roster that spends thirty percent of its budget on");
say("a position worth ten percent of the money has already lost, whoever it bought.");

const text = L.join("\n") + "\n";
console.log(text.split("\n").slice(0, 45).join("\n"));
console.log(`... ${priced.length} players priced`);

if (doWrite) {
  const out = path.join(REPO, "reports", `auction-values${LEAGUE ? "-" + LEAGUE : ""}.md`);
  fs.writeFileSync(out, text);
  console.log("written: " + path.relative(REPO, out));
}
