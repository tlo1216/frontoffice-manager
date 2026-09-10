// Draft board: value over replacement, tiers, and a pre rank list for autodraft.
// Reads the ESPN player pool with projections and ADP using cookies from .env
// (ESPN_S2, SWID, ESPN_LEAGUE_ID, ESPN_SEASON, ESPN_SPORT=ffl). For a league that
// has not drafted, the pool is every player; for a drafted league it still works
// (useful for keeper leagues and next year's prep).
// Usage: node tools/draft-board.mjs [--teams 10] [--out draft-board.json]
// Prints a tiered board to stdout and writes JSON the live assistant reads.
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const env = Object.fromEntries(fs.readFileSync(process.env.FRONTOFFICE_ENV || '.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const SEASON = +env.ESPN_SEASON, LEAGUE_ID = env.ESPN_LEAGUE_ID, SPORT = env.ESPN_SPORT || 'ffl';
const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${SPORT}/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;
const headers = { Cookie: `espn_s2=${env.ESPN_S2}; SWID=${env.SWID}` };
const get = async (u, extra) => { const r = await fetch(u, { headers: { ...headers, ...(extra || {}) } }); if (r.status !== 200) throw new Error('status ' + r.status); return r.json(); };

const settings = (await get(base + '?view=mSettings')).settings;
const teams = +(args.teams || settings.size || 10);
const slotCounts = settings.rosterSettings.lineupSlotCounts; // {slotId: count}
const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };
const SLOT_POS = { 0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 23: ['RB', 'WR', 'TE'], 16: ['DST'], 17: ['K'] };
const starters = {}; let flex = 0;
for (const [slot, n] of Object.entries(slotCounts)) { const ps = SLOT_POS[slot]; if (!ps || !n) continue; if (ps.length === 1) starters[ps[0]] = (starters[ps[0]] || 0) + n; else flex += n; }
const pool = (await get(base + '?view=kona_player_info', { 'X-Fantasy-Filter': JSON.stringify({ players: { limit: 400, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'PPR' } } }) })).players;
const sp = p => { const s = (p.stats || []).find(x => x.statSourceId === 1 && x.scoringPeriodId === 0 && x.seasonId === SEASON); return s ? s.appliedTotal : 0; };
const players = pool.map(x => x.player).map(p => ({ id: p.id, name: p.fullName, pos: POS[p.defaultPositionId] || '?', team: p.proTeamId, proj: +sp(p).toFixed(1), adp: p.ownership && p.ownership.averageDraftPosition ? +p.ownership.averageDraftPosition.toFixed(1) : 999, injury: p.injuryStatus, onTeam: !!(pool.find(y => y.player.id === p.id).onTeamId) })).filter(p => p.pos !== '?');

// Replacement level per position: the projection of the last player who would start
// across the league (starters × teams, plus flex spread over RB/WR/TE by projection).
const byPos = {}; for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
for (const k in byPos) byPos[k].sort((a, b) => b.proj - a.proj);
const flexShare = { RB: 0.5, WR: 0.4, TE: 0.1 };
const repl = {};
for (const pos of Object.keys(byPos)) { const n = Math.round(((starters[pos] || 0) + flex * (flexShare[pos] || 0)) * teams); repl[pos] = byPos[pos][Math.min(n, byPos[pos].length - 1)]?.proj || 0; }
for (const p of players) p.vorp = +(p.proj - (repl[p.pos] || 0)).toFixed(1);
// Kickers and defenses: value is real but small and unpredictable; push them behind every positive skill player.
for (const p of players) if (p.pos === 'K' || p.pos === 'DST') p.vorp = Math.min(p.vorp, 5) - 30;
players.sort((a, b) => b.vorp - a.vorp);
// Tiers: a new tier starts where the VORP gap to the previous player at that position exceeds 8 percent of the top value.
const tiers = {}; for (const pos in byPos) { let t = 1, prev = null; for (const p of byPos[pos]) { if (prev && prev.proj - p.proj > 0.08 * byPos[pos][0].proj) t++; p.tier = t; prev = p; } }
const out = { generated: new Date().toISOString(), teams, starters, flex, replacement: repl, players };
fs.writeFileSync(args.out || 'draft-board.json', JSON.stringify(out, null, 1));
console.log(`Draft board, ${teams} teams, starters ${JSON.stringify(starters)} plus ${flex} flex. Replacement level: ${Object.entries(repl).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', ')}\n`);
console.log('rank pos tier  vorp   proj   adp  player');
players.slice(0, 120).forEach((p, i) => console.log(String(i + 1).padStart(4), p.pos.padEnd(3), String(p.tier).padStart(4), String(p.vorp).padStart(6), String(p.proj).padStart(6), String(p.adp).padStart(5), ' ', p.name + (p.injury && p.injury !== 'ACTIVE' ? ' (' + p.injury + ')' : '')));
console.log('\nPre rank list for the platform autodraft (paste order): ' + players.slice(0, 200).map(p => p.name).join(', '));
