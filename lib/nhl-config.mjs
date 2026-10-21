// One place every hockey tool asks "which league, which season."
//
// WHY THIS EXISTS. An ESPN hockey season is named for the year it ENDS: the
// 2026-27 NHL season is season 2027. Football is named for the year it starts,
// and every football tool in this kit defaults to that. A hockey tool that
// borrows football's default, or anybody's hardcoded year, asks ESPN for a
// season the league does not exist in. ESPN answers 404, and a 404 from the
// hockey endpoint reads exactly like an expired cookie rather than a wrong
// year. One tool doing that prints a failure and exits 0; another builds an
// empty roster and says nothing. So the season comes from your hockey config
// or from --season, and from nowhere else.
//
// THE CONFIG is league/hockey-league.json, one object describing your hockey
// league as you believe it to be (copy league/hockey-league.example.json).
// tools/nhl-league-verify.mjs compares it field by field with the live league,
// and tools/nhl-scoring-verify.mjs proves its scoring map against ESPN's own
// totals. Set FRONTOFFICE_HOCKEY_CONFIG to keep it somewhere else.
//
// If "id" or "teamId" is blank in the file and .env says ESPN_SPORT=fhl, the
// ESPN_LEAGUE_ID and ESPN_TEAM_ID from .env fill them, so a hockey-only setup
// does not have to say its league id twice. A football .env never fills a
// hockey config: that would point every hockey read at a football league.
//
// This file holds no numeric constant of its own on purpose: the season a
// league plays is a fact about that league, recorded once in its config,
// never a number this file is allowed to guess.

import fs from "node:fs";
import path from "node:path";
import { REPO, espnConfig } from "./data.mjs";

export const HOCKEY_CONFIG = process.env.FRONTOFFICE_HOCKEY_CONFIG
  ? path.resolve(process.env.FRONTOFFICE_HOCKEY_CONFIG)
  : path.join(REPO, "league", "hockey-league.json");

/**
 * Your hockey league's config, with id and teamId filled from .env where the
 * file leaves them blank and .env is a hockey setup. Null when the file does
 * not exist. A file that exists but is not valid JSON throws: a broken config
 * must never read as an absent one.
 *
 * @param {string} [file]  another config file, e.g. a doctored copy for a test
 * @returns {object|null}
 */
export function hockeyLeague(file = HOCKEY_CONFIG) {
  if (!fs.existsSync(file)) return null;
  const L = JSON.parse(fs.readFileSync(file, "utf8"));
  const env = espnConfig();
  if (env.sport === "fhl") {
    if (!L.id && env.leagueId) L.id = env.leagueId;
    if (!L.teamId && env.teamId) L.teamId = env.teamId;
  }
  return L;
}

/**
 * The season a hockey tool should run against: --season if it was passed,
 * otherwise the season in your hockey config.
 *
 * Refuses to guess when neither is available. A guessed season year against
 * ESPN's hockey endpoint does not fail where you can see it: it comes back
 * 404, which reads exactly like an expired cookie rather than a wrong year.
 * Throwing here, with the season question named, is cheaper than somebody
 * re-diagnosing that 404.
 *
 * @param {object} args
 * @param {string|number} [args.argSeason]  whatever --season handed back, or
 *   "" / undefined when the flag was not passed
 * @param {object|null} [args.league]  a config from hockeyLeague(); read fresh
 *   when omitted
 * @returns {number}
 */
export function resolveSeason({ argSeason, league } = {}) {
  const fromArg = Number(argSeason);
  if (argSeason && Number.isFinite(fromArg)) return fromArg;

  const L = league === undefined ? hockeyLeague() : league;
  const fromConfig = L ? Number(L.season) : NaN;
  if (L && Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;

  throw new Error(`resolveSeason: no --season was passed and ${path.relative(REPO, HOCKEY_CONFIG)} ` +
    `${L ? "has no season" : "does not exist"}. Pass --season (the year the NHL season ENDS, e.g. 2027 for 2026-27) ` +
    "or set it in the config. Guessing here produces a 404 from ESPN's hockey endpoint that reads like a dead cookie, " +
    "which is a harder failure to diagnose than this one.");
}

/**
 * Refuse a write aimed at a team id that is not yours.
 *
 * A write tool that takes a team id on the command line can be pointed at
 * another manager's roster by a typo or a stale copy and paste, and nothing
 * else in the path would stop it. Running another manager's team is not a
 * gray area. Call this before any lineup, add, drop or claim.
 *
 * Refuses only when your config names a teamId and the target differs. With
 * no config there is nothing to compare against, so it steps aside rather than
 * block setup and testing; `checked` says which happened.
 *
 * @param {string|number} leagueId
 * @param {string|number} teamId
 * @returns {{checked: boolean, league: object|null}}
 */
export function requireOwnTeam(leagueId, teamId, league = hockeyLeague()) {
  if (!league || !league.teamId || String(league.id) !== String(leagueId)) return { checked: false, league: null };
  if (Number(league.teamId) !== Number(teamId)) {
    throw new Error(`requireOwnTeam: your hockey config says your team in league ${leagueId} is ${league.teamId}, ` +
      `but this write was about to target team ${teamId}. Refusing. If the config is stale, fix ` +
      `${path.relative(REPO, HOCKEY_CONFIG)} rather than bypassing this check.`);
  }
  return { checked: true, league };
}
