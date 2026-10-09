// Every remaining week of the season, played out with the roster we hold.
//
// WHY THIS IS A LIBRARY AND NOT A TOOL. Two things need this answer and they
// need exactly the same answer: the report that says which weeks are thin, and
// the fixer that goes and signs somebody. When the same question was answered
// in two places the two drifted, which is how a "second VOR definition" got
// written and deleted once already. One computation, two front ends.
//
// WHAT COUNTS AS WEAKNESS. Not the number of men on bye. What matters is
// whether the BENCH CAN COVER, which depends on which positions are missing.
// Losing two receivers out of five costs almost nothing. Losing the only tight
// end is a zero in that slot, which no amount of depth elsewhere compensates.
//
// So: build the best legal lineup for every week ahead from the players who
// actually play that week, and report both the points lost against a normal
// week and, separately and loudly, any slot that cannot be filled at all.

import { num, forwardProjection } from "./data.mjs";

export const POSN = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
export const ELIG = { 0: ["QB"], 2: ["RB"], 4: ["WR"], 6: ["TE"], 16: ["D/ST"], 17: ["K"], 23: ["RB", "WR", "TE"] };
export const SLOTN = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 23: "FLEX", 20: "BE", 21: "IR" };
export const SLOT_FOR = { QB: 0, RB: 2, WR: 4, TE: 6, "D/ST": 16, K: 17 };

// A hole at one of these is a calendar note, not a transaction. Kickers and
// defences are replaceable off the wire any week of the season for nothing, so
// holding a spare for nine weeks costs more than the hole does. A missing
// running back in week eleven is a different thing entirely.
export const STREAMABLE = new Set(["K", "D/ST"]);

/**
 * @param j     an ESPN league response with mRoster, mSettings and mStatus
 * @param byeOf player full name -> bye week
 * @returns analysis of every week from the current one to the end
 */
export function weakness(j, byeOf, teamId, season) {
  const me = (j.teams || []).find((t) => t.id === teamId);
  if (!me) return { error: `team ${teamId} was not in the response` };

  const spNow = num(j.scoringPeriodId) || 1;
  const spLast = num(j.status?.finalScoringPeriod);
  if (!spLast)
    throw new Error("weakness: ESPN status.finalScoringPeriod is missing (fetch with view=mStatus?); refusing to assume a 17 week season, since a league can run 16 or 18.");
  const weeksLeft = Math.max(1, spLast - spNow + 1);

  // A rest of season total spreads over the weeks that remain; a preseason
  // total, which is all that exists before week one, spreads over the whole
  // season, whatever length THIS league actually runs.
  const perWeek = (pl) => {
    const f = forwardProjection(pl, season);
    return f.total / (f.basis === "rest of season" ? weeksLeft : spLast);
  };

  const roster = (me.roster?.entries || []).map((e) => {
    const p = e.playerPoolEntry.player;
    return { id: p.id, name: p.fullName, pos: POSN[p.defaultPositionId] || "?",
      slot: e.lineupSlotId, slotName: SLOTN[e.lineupSlotId] ?? String(e.lineupSlotId),
      proj: perWeek(p), season: forwardProjection(p, season).total,
      bye: (typeof byeOf === "function" ? byeOf(p) : byeOf[p.fullName]) ?? null,
      injury: p.injuryStatus || "ACTIVE",
      out: ["OUT", "IR", "INJURY_RESERVE"].includes(p.injuryStatus || "") };
  });
  const active = roster.filter((p) => !p.out);

  const counts = j.settings?.rosterSettings?.lineupSlotCounts || {};
  const WEEKS = j.settings?.scheduleSettings?.matchupPeriodCount || 14;
  const slots = [];
  for (const [id, n] of Object.entries(counts)) {
    const s = Number(id);
    if (s === 20 || s === 21 || !n) continue;
    for (let k = 0; k < n; k++) slots.push(s);
  }
  // Fill the most restrictive slot first. A flex filled before the tight end
  // slot can eat the only tight end and invent a hole that does not exist.
  slots.sort((a, b) => (ELIG[a]?.length || 9) - (ELIG[b]?.length || 9));

  const lineupFor = (w) => {
    const left = active.filter((p) => p.bye !== w);
    let total = 0; const holes = [];
    for (const s of slots) {
      const ok = left.filter((p) => (ELIG[s] || []).includes(p.pos));
      if (!ok.length) { holes.push(SLOTN[s] ?? String(s)); continue; }
      const pick = ok.reduce((a, b) => (b.proj > a.proj ? b : a));
      total += pick.proj; left.splice(left.indexOf(pick), 1);
    }
    return { total, holes };
  };

  const full = lineupFor(-1);
  const weeks = [];
  for (let w = spNow; w <= WEEKS; w++) {
    const r = lineupFor(w);
    weeks.push({ w, total: r.total, holes: r.holes, loss: full.total - r.total,
      off: active.filter((p) => p.bye === w).length });
  }
  const bad = weeks.filter((x) => x.loss > 0.5 || x.holes.length).sort((a, b) => b.loss - a.loss);

  // The holes worth a transaction: a slot that cannot be filled at a position
  // that cannot simply be streamed the week before.
  const urgent = [];
  for (const x of bad) for (const h of x.holes)
    if (!STREAMABLE.has(h)) urgent.push({ week: x.w, slot: h, loss: x.loss });

  const START = {};
  for (const [id, n] of Object.entries(counts)) {
    const nm = SLOTN[Number(id)];
    if (nm && nm !== "BE" && nm !== "IR" && nm !== "FLEX") START[nm] = num(n);
  }
  return { spNow, spLast, weeksLeft, WEEKS, roster, active, slots, START,
    FLEX: num(counts["23"]), full, weeks, bad, urgent, lineupFor };
}

/** The one bye map on file. It is per season, not per league. */
export function byeMap(fs, path, REPO) {
  for (const f of fs.readdirSync(path.join(REPO, "reports")))
    if (/^bye-map-\d+\.json$/.test(f))
      return JSON.parse(fs.readFileSync(path.join(REPO, "reports", f), "utf8"));
  return null;
}

// --- Who to drop ------------------------------------------------------------
//
// SURPLUS FIRST, THEN VALUE AGAINST THE WIRE. This rule was arrived at by being
// wrong twice, and both wrong versions shipped.
//
//   v1 ranked the bench by RAW PROJECTION. Quarterbacks project a hundred
//   points above receivers, so a third quarterback outranked every receiver on
//   the roster and survived every cut. He could never start.
//
//   v2 ranked by value against the best UNOWNED player at the same position,
//   which is the right yardstick for an add. It still kept a third quarterback
//   in Miami, because that league's wire quarterback was weak enough to make
//   ours look above replacement. It does not matter what he is worth against
//   the wire: in a one quarterback league the third one never takes the field.
//
// So a man at a position where we already hold more than we could ever use
// (starters, plus flex if he is flex eligible, plus one backup) is pure surplus
// and goes before anybody who might one day play. Only among equals does value
// against the wire decide.
//
// BYE COVER IS THE LAST TIEBREAK, and it has to be genuinely last. The first
// version put it above value, and the tool immediately proposed releasing a
// three hundred point quarterback to fill one tight end week, for no reason
// except that his bye happened to fall in the week being fixed. Preferring the
// man who is off that week is worth a point or two. Preferring the cheaper man
// is worth whatever the gap is. So value decides, and the bye breaks a tie.
//
// AND wireAt MUST BE REAL AT EVERY POSITION. When the caller knew the wire only
// at the position it was shopping for and answered zero everywhere else, every
// other position got scored at full projection against a replacement of
// nothing, and the ordering was raw projection wearing a disguise: exactly the
// v1 bug, back through the front door. A caller that cannot price a position
// must say so, so this throws rather than rank on a number it knows is fake.

const TIE = 5;   // points of season value inside which two men are the same man

export function rankDrops(roster, { START, FLEX, wireAt, forWeek = null }) {
  const countAt = (pos) => roster.filter((r) => r.pos === pos).length;
  const usable = (pos) => (START[pos] || 0) + (["RB", "WR", "TE"].includes(pos) ? FLEX : 0) + 1;
  const surplus = (r) => (countAt(r.pos) > usable(r.pos) ? 1 : 0);
  const alsoOff = (r) => (forWeek !== null && r.bye === forWeek ? 1 : 0);
  const over = (r) => {
    const w = wireAt(r.pos);
    if (w === null || w === undefined)
      throw new Error("rankDrops: no wire price for " + r.pos +
        "; ranking it would be raw projection in disguise");
    return r.season - w;
  };

  return roster
    // Never a starter, and never the last man at his position: cutting him
    // trades one hole for another.
    .filter((r) => r.slotName === "BE")
    .filter((r) => countAt(r.pos) > 1)
    .sort((a, b) => {
      if (surplus(b) !== surplus(a)) return surplus(b) - surplus(a);
      const d = over(a) - over(b);
      if (Math.abs(d) > TIE) return d;
      return alsoOff(b) - alsoOff(a);
    });
}

/** What releasing him hands the rest of the league: his margin over the best
 *  man already sitting on the wire at his position. A large number means he is
 *  a TRADE asset, and cutting him is a gift whatever the roster math says. */
export function giftValue(player, wireAt) {
  const w = wireAt(player.pos);
  return (w === null || w === undefined) ? null : player.season - w;
}

// --- Byes, derived rather than remembered ------------------------------------
//
// THE FILE VERSION ROTS AND CANNOT ANNOUNCE IT. tools/bye-map.mjs writes a JSON
// of 517 players keyed by FULL NAME, built once. Two things are wrong with that
// and only one of them is obvious.
//
// It goes stale. A player who changes NFL team in November keeps his old team's
// bye in the file for the rest of the season, and the tools that drive waiver
// claims read it without complaint. Checked on 2026-09-17 it was still correct
// for all 110 rostered players, which is exactly how a rotting input looks
// right up until it does not.
//
// And it matches by NAME, which this repo has a rule against for good reason: a
// name join between two feeds matched 45 of 357 players once and the rest came
// back undefined.
//
// A bye is not a property of a player at all. It is a property of his CURRENT
// NFL team and the published schedule, both of which we already have. So this
// derives it, keyed on proTeamId, and cannot be stale by construction.

/**
 * @returns {Promise<(player: {proTeamId?: number}) => number|null>}
 *   the bye week for whatever team the player is on RIGHT NOW.
 */
export async function byeTable(season, { games, PRO }) {
  const g = (await games()).filter((x) => Number(x.season) === season);
  const weeks = [...new Set(g.map((x) => num(x.week)))].sort((a, b) => a - b);
  const last = Math.max(...weeks.filter((w) => w <= 14));
  const byeOfTeam = new Map();
  for (const t of new Set(g.flatMap((x) => [x.home_team, x.away_team]))) {
    const played = new Set(g.filter((x) => x.home_team === t || x.away_team === t).map((x) => num(x.week)));
    // A bye is the single week inside the bye window with no game. More than
    // one missing week means the schedule is partial, and guessing from a
    // partial schedule is how a roster ends up with a hole nobody predicted.
    const missing = weeks.filter((w) => w <= last && !played.has(w));
    if (missing.length === 1) byeOfTeam.set(t, missing[0]);
  }
  return (player) => {
    const code = PRO[player?.proTeamId];
    return code ? (byeOfTeam.get(code) ?? null) : null;
  };
}
