// Is the machinery still telling the truth?
//
//   node tools/health-check.mjs
//
// Cheap, no model turn. Worth running at the top of any scheduled pass,
// before a report built on top of it is trusted.
//
// WHY. Every tool here reads ESPN with a cookie that expires, and a dead
// cookie does not announce itself: reports keep generating, tables keep
// formatting, and the numbers quietly stop being current. The same is true of
// a commissioner changing the scoring settings, which silently invalidates
// every valuation the kit holds without changing a single line of its code.
//
// Three things are checked, and each is a way the system can be wrong while
// looking completely fine:
//
//   1. The ESPN cookie still authenticates.
//   2. The league still answers, with the team you told it is yours.
//   3. The scoring and roster settings have not changed since last run. A
//      commissioner tweak is invisible and invalidates every dollar value and
//      replacement level the kit has computed.

import fs from "node:fs";
import path from "node:path";
import { REPO, espnHeaders, espnConfig } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";

const { leagueId, teamId, season, sport } = espnConfig();
if (!leagueId || !teamId) {
  console.error("Set ESPN_LEAGUE_ID and ESPN_TEAM_ID in .env before running this.");
  process.exit(2);
}

// espnHeaders() is the one place the cookie is read from disk (lib/data.mjs).
// It throws loudly if ESPN_S2 or ESPN_SWID is unset, which is correct here:
// this tool's whole job is to say whether the cookie still authenticates, so
// hiding that failure behind a caught exception would defeat the point of it.
const headers = espnHeaders();

const STATE = path.join(REPO, "league", "settings-fingerprint.json");
let prev = null;
try { prev = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { /* first run */ }

const problems = [], notes = [];

// getJSON never throws: it has its own deadline and retries the transient
// codes (429, 502, 503...) before giving up, so a single blip that used to
// land here as an immediate PROBLEM now has a chance to resolve on retry. A
// 401/403 comes back as { fatal } instead of retrying, since retrying a dead
// cookie just repeats the same failure.
const r = await getJSON(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${season}` +
  `/segments/0/leagues/${leagueId}?view=mSettings&view=mTeam&nocache=${Math.random()}`, { headers });

let now = null;
if (r.fatal) {
  // Still tell 401 (the cookie is dead) apart from anything else getJSON
  // treats as fatal.
  problems.push(/\b401\b/.test(r.fatal)
    ? `**ESPN COOKIE IS DEAD** (401). Every report is stale until ESPN_S2 and ESPN_SWID are replaced in .env. See SETUP.md.`
    : r.fatal);
} else if (!r.ok) {
  problems.push(r.soft);
} else {
  const j = r.json;
  const team = (j.teams || []).find((t) => t.id === teamId);
  if (!team) {
    problems.push(`team ${teamId} (ESPN_TEAM_ID) is not in this league any more.`);
  } else {
    // Fingerprint the things that would invalidate a valuation built on top
    // of them.
    const s = j.settings || {};
    now = {
      scoring: JSON.stringify((s.scoringSettings?.scoringItems || []).map((x) => [x.statId, x.points, x.pointsOverrides]).sort()),
      slots: JSON.stringify(s.rosterSettings?.lineupSlotCounts || {}),
      acquisition: JSON.stringify(s.acquisitionSettings || {}),
      teams: (j.teams || []).length,
    };
    if (prev) {
      for (const k of ["scoring", "slots", "acquisition", "teams"])
        if (JSON.stringify(prev[k]) !== JSON.stringify(now[k]))
          problems.push(`**SETTINGS CHANGED: ${k}.** Every valuation built on the old settings is wrong. Re-run anything that depends on replacement level or scoring.`);
    } else {
      notes.push("first fingerprint recorded");
    }
  }
}

// cache freshness
const cacheDir = path.join(REPO, "tools", ".cache");
try {
  const files = fs.readdirSync(cacheDir);
  const old = [];
  for (const f of files) {
    const st = fs.statSync(path.join(cacheDir, f));
    const days = (Date.now() - st.mtimeMs) / 86400000;
    if (days > 8) old.push(`${f} (${days.toFixed(0)}d)`);
  }
  if (old.length) notes.push(`stale cache files, they will refresh on next use: ${old.slice(0, 5).join(", ")}${old.length > 5 ? ` and ${old.length - 5} more` : ""}`);
} catch { notes.push("no cache directory yet"); }

if (now) fs.writeFileSync(STATE, JSON.stringify(now, null, 1));

console.log(`# Health check, ${new Date().toLocaleString()}\n`);
if (!problems.length) {
  console.log("League answered. Cookie is alive, settings unchanged.");
} else {
  console.log("## Problems\n");
  for (const p of problems) console.log(`- ${p}`);
}
if (notes.length) {
  console.log("\n## Notes\n");
  for (const n of notes) console.log(`- ${n}`);
}
process.exit(problems.length ? 1 : 0);
