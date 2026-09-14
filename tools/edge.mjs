// Every cheap analysis lever, from one data pull.
//
//   node tools/edge.mjs --week 1            print the boards
//   node tools/edge.mjs --week 1 --write    also write reports/edge-week-N.md
//   node tools/edge.mjs --week 1 --refresh  ignore the day's cache
//
// Cost: about 500 KB of CSV from nflverse plus a handful of ESPN reads, all
// cached for the day. One node process, no model turn. The point is that every
// board below comes out of the SAME pull, so adding a lever costs arithmetic
// rather than another download.
//
// THE IDEA. Fantasy points are a lagging indicator. They are the product of
// opportunity (targets, carries, snaps, air yards) and efficiency (catch rate,
// yards per touch, touchdowns). Opportunity is sticky week to week because it
// reflects what a coaching staff decided to do. Efficiency is noisy and
// regresses hard, and touchdowns are the noisiest part of it. So a player whose
// opportunity is high and whose points are low is usually underpriced, and one
// whose points ran ahead of his opportunity is usually overpriced. Everyone
// else in the league is reading the points column.
//
// BOARDS PRODUCED
//   1. Buy       — players on the wire whose usage outruns their scoring
//   2. Sell high — our players whose scoring outran their usage
//   3. Missed    — the best scorers nobody on our roster had (opportunity cost)
//   4. Streaming — next week's defenses and kickers ranked by the Vegas number
//   5. Volatility— who is boom/bust, for the weeks we need ceiling not floor
//
// SMALL SAMPLE. Early in a season every one of these is one or two games of
// evidence. The report says so and ranks by usage rather than by points on
// purpose, because usage stabilises many weeks before scoring does.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(REPO, "tools", ".cache");
const argv = process.argv.slice(2);
const week = Number(argv[argv.indexOf("--week") + 1]) || 1;
const doWrite = argv.includes("--write");
const refresh = argv.includes("--refresh");
const SEASON = 2026;
// Your team id, from ESPN_TEAM_ID in .env. Everything else about the league
// comes from the API, so this is the only thing that has to be told.
const MY_TEAM = Number(process.env.ESPN_TEAM_ID ||
  (fs.existsSync(new URL('../.env', import.meta.url))
    ? (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^ESPN_TEAM_ID=([0-9]+)/m) || [])[1]
    : 0) || 0);
if (!MY_TEAM) { console.error('Set ESPN_TEAM_ID in .env so this knows which team is yours.'); process.exit(2); }

fs.mkdirSync(CACHE, { recursive: true });

// --- plumbing ---------------------------------------------------------------

async function csv(name, url) {
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(CACHE, `${day}-${name}.csv`);
  if (!refresh && fs.existsSync(file)) return parseCsv(fs.readFileSync(file, "utf8"));
  const text = await (await fetch(url)).text();
  fs.writeFileSync(file, text);
  return parseCsv(text);
}

/** Minimal CSV reader that respects quoted fields (player names contain commas). */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function mcp(tool, args) {
  const r = spawnSync(process.execPath, [path.join(REPO, "tools/mcp-call.mjs"), tool, JSON.stringify(args)], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  let out = r.stdout || "";
  const note = out.indexOf("-- Response truncated");
  if (note >= 0) out = out.slice(0, note);
  const end = Math.max(out.lastIndexOf("]"), out.lastIndexOf("}"));
  if (end < 0) throw new Error(`${tool}: no JSON. ${out.slice(0, 160)}`);
  return JSON.parse(out.slice(0, end + 1));
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fx = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");

/** Standard score within a group; 0 when the group cannot vary. */
function zscores(items, pick) {
  const vals = items.map(pick);
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1));
  return items.map((it, i) => (sd > 0 ? (vals[i] - mean) / sd : 0));
}

// --- data -------------------------------------------------------------------

const [stats, snaps, games, rosterWeekly] = await Promise.all([
  csv("stats", `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${SEASON}.csv`),
  csv("snaps", `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${SEASON}.csv`),
  csv("games", "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"),
  csv("roster", `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${SEASON}.csv`),
]);

// gsis id -> espn id, so nothing is matched by name
const espnOf = new Map();
for (const r of rosterWeekly) if (r.gsis_id && r.espn_id) espnOf.set(r.gsis_id, r.espn_id);

const snapPct = new Map();
for (const s of snaps) if (num(s.week) === week) snapPct.set(`${s.player}|${s.team}`, num(s.offense_pct));

// who is rostered anywhere in the league, and by whom
const owner = new Map();
for (let t = 1; t <= 8; t++) {
  let rs; try { rs = mcp("get_rosters", { team_id: t }); } catch { continue; }
  for (const p of (rs[0] || rs).players || []) owner.set(String(p.id), t);
}

const weekStats = stats.filter((s) => num(s.week) === week && ["RB", "WR", "TE", "QB"].includes(s.position));

const players = weekStats.map((s) => {
  const espnId = espnOf.get(s.player_id);
  const touches = num(s.carries) + num(s.targets);
  return {
    name: s.player_display_name || s.player_name,
    pos: s.position,
    team: s.team,
    espnId,
    ownedBy: espnId ? owner.get(String(espnId)) : undefined,
    pts: num(s.fantasy_points_ppr ?? s.fantasy_points),
    targets: num(s.targets),
    carries: num(s.carries),
    touches,
    targetShare: num(s.target_share),
    airShare: num(s.air_yards_share),
    wopr: num(s.wopr),
    epa: num(s.receiving_epa) + num(s.rushing_epa),
    tds: num(s.receiving_tds) + num(s.rushing_tds),
    snapPct: snapPct.get(`${s.player_display_name}|${s.team}`) ?? undefined,
  };
});

// Usage score per position. Receivers and tight ends live on targets and air
// yards; backs live on touches and snaps. Comparing a back's target share to a
// receiver's would be meaningless, so each position is scored inside its own
// group and never across groups.
const boards = {};
for (const pos of ["WR", "TE", "RB"]) {
  const group = players.filter((p) => p.pos === pos && (p.touches > 0 || p.pts > 0));
  if (group.length < 4) continue;
  const usage = pos === "RB"
    ? zscores(group, (p) => p.touches + (p.snapPct ?? 0) / 10)
    : zscores(group, (p) => p.wopr * 10 + p.targets);
  const scoring = zscores(group, (p) => p.pts);
  boards[pos] = group.map((p, i) => ({ ...p, usageZ: usage[i], ptsZ: scoring[i], gap: usage[i] - scoring[i] }));
}
const all = Object.values(boards).flat();

// --- report -----------------------------------------------------------------

const L = [];
const say = (s = "") => L.push(s);

say(`# Edge boards, week ${week}`);
say("");
say("Built locally by `tools/edge.mjs` from nflverse usage data and ESPN rosters.");
say("No model turn produced these numbers.");
say("");
say(`Sample so far: week ${week}. Usage settles long before scoring does, so every`);
say("board below ranks on usage and shows points as the consequence, not the other");
say("way round. One week is a hint, not a finding.");
say("");

say("## 1. Buy — usage is there, the points are not yet");
say("");
say("Unrostered players whose opportunity ran well ahead of their scoring. These are");
say("the ones the points column hides, which is the only column most managers read.");
say("");
say("| Player | Pos | Team | Pts | Targets | Carries | Snap % | WOPR | Usage vs points |");
say("|---|---|---|---|---|---|---|---|---|");
for (const p of all.filter((p) => !p.ownedBy).sort((a, b) => b.gap - a.gap).slice(0, 12))
  say(`| ${p.name} | ${p.pos} | ${p.team} | ${fx(p.pts, 1)} | ${p.targets} | ${p.carries} | ${p.snapPct !== undefined ? fx(p.snapPct, 0) + "%" : "—"} | ${fx(p.wopr)} | +${fx(p.gap)} |`);

say("");
say("## 2. Sell high — the points ran ahead of the usage");
say("");
say("Our players whose production outstripped their opportunity. Touchdowns are the");
say("noisiest thing in the box score and the first thing to disappear. Best trade bait.");
say("");
say("| Player | Pos | Pts | TDs | Targets | Carries | WOPR | Points vs usage |");
say("|---|---|---|---|---|---|---|---|");
for (const p of all.filter((p) => p.ownedBy === MY_TEAM).sort((a, b) => a.gap - b.gap).slice(0, 8))
  say(`| ${p.name} | ${p.pos} | ${fx(p.pts, 1)} | ${p.tds} | ${p.targets} | ${p.carries} | ${fx(p.wopr)} | ${fx(-p.gap)} |`);

say("");
say("## 3. Missed — best scorers nobody on our roster had");
say("");
say("Opportunity cost. If a name here is still unrostered it belongs on board 1 too.");
say("");
say("| Player | Pos | Team | Pts | Rostered by |");
say("|---|---|---|---|---|");
for (const p of players.filter((p) => p.ownedBy !== MY_TEAM).sort((a, b) => b.pts - a.pts).slice(0, 10))
  say(`| ${p.name} | ${p.pos} | ${p.team} | ${fx(p.pts, 1)} | ${p.ownedBy ? "team " + p.ownedBy : "**nobody**"} |`);

say("");
say("## 4. Streaming board — next week's defenses and kickers");
say("");
say("Defense scoring tracks the Vegas number better than it tracks last week's");
say("defensive points: a heavy favourite in a low total is playing from ahead against");
say("a team that has to throw. Kickers want the opposite kind of game, a high total.");
say("");
const next = games.filter((g) => num(g.season) === SEASON && num(g.week) === week + 1);
if (next.length === 0) say("_No schedule rows for next week yet._");
else {
  const priced = next.filter((g) => num(g.total_line) > 0).length;
  if (priced === 0) say("_Sportsbook lines for next week are not posted yet; re-run closer to the week._");
  say("| Defense of | Opponent | Favoured by | Game total | D/ST look | Kicker look |");
  say("|---|---|---|---|---|---|");
  const lines = [];
  for (const g of next) {
    const spread = num(g.spread_line); // positive favours the home side
    // 'total' is the actual points scored and is empty until the game is played.
    // 'total_line' is the Vegas number, which is the one that predicts anything.
    const total = num(g.total_line);
    lines.push({ team: g.home_team, opp: g.away_team, fav: spread, total });
    lines.push({ team: g.away_team, opp: g.home_team, fav: -spread, total });
  }
  // A defense wants to be favoured in a low-scoring game; score both together.
  for (const l of lines.sort((a, b) => b.fav - a.fav - (b.total - a.total) / 3).slice(0, 10))
    say(`| ${l.team} | ${l.opp} | ${l.fav > 0 ? "+" : ""}${fx(l.fav, 1)} | ${fx(l.total, 1)} | ${l.fav >= 3 && l.total <= 45 ? "**strong**" : l.fav >= 3 ? "decent" : "no"} | ${l.total >= 47 ? "**strong**" : l.total >= 43 ? "decent" : "no"} |`);
}

say("");
say("## 5. Volatility — who swings");
say("");
say("Points per touch, high to low. When we are trailing late we want the top of this");
say("list in the lineup and the bottom of it on the bench; when we are ahead, reverse");
say("it. Expected points alone cannot tell us that, and it is the one lever in here");
say("that costs nothing and nobody else in this league is pulling.");
say("");
say("| Player | Pos | Pts | Touches | Points per touch |");
say("|---|---|---|---|---|");
for (const p of all.filter((p) => p.ownedBy === MY_TEAM && p.touches >= 3).sort((a, b) => b.pts / b.touches - a.pts / a.touches))
  say(`| ${p.name} | ${p.pos} | ${fx(p.pts, 1)} | ${p.touches} | ${fx(p.pts / p.touches)} |`);

say("");
say("## What to do with this");
say("");
const topBuy = all.filter((p) => !p.ownedBy).sort((a, b) => b.gap - a.gap)[0];
const topSell = all.filter((p) => p.ownedBy === MY_TEAM).sort((a, b) => a.gap - b.gap)[0];
if (topBuy) say(`- Best claim on usage alone: **${topBuy.name}** (${topBuy.pos}, ${topBuy.team}) — ${topBuy.targets} targets, ${fx(topBuy.pts, 1)} points.`);
if (topSell) say(`- Best trade bait: **${topSell.name}** — ${fx(topSell.pts, 1)} points on ${topSell.touches} touches is not repeatable.`);
say("- Anything here is one week of evidence. Re-run weekly; act on what repeats.");

const text = L.join("\n") + "\n";
console.log(text);
if (doWrite) {
  const out = path.join(REPO, "reports", `edge-week-${week}.md`);
  fs.writeFileSync(out, text);
  console.log(`written: ${out}`);
}
