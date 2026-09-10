// Sleeper league snapshot, for the hourly watch. Paste into the browser pane's
// JavaScript tool on any page (no login needed), or run with node (node 18+).
// Produces the same line format as the ESPN snapshot so tools/diff-snapshot.mjs
// works unchanged: teamId|playerId|name|injury|seasonProj ; FA rows add |trend
// plus SETTINGS and WAIVERORDER lines. Wrap the result as
// 'PEND:'+json+'\nSNAPSTART\n'+lines+'\nSNAPEND\n' and pad it so the tool saves
// it to a file, then run: node tools/diff-snapshot.mjs <file> --apply
const LEAGUE_ID = 'YOUR_LEAGUE_ID';
const base = 'https://api.sleeper.app/v1';
const j = async (u) => (await fetch(u)).json();
const state = await j(base + '/state/nfl');
const league = await j(base + '/league/' + LEAGUE_ID);
const rosters = await j(base + '/league/' + LEAGUE_ID + '/rosters');
const users = await j(base + '/league/' + LEAGUE_ID + '/users');
const players = await j(base + '/players/nfl'); // cache this in a real run; it is large
const trendingAdd = await j(base + '/players/nfl/trending/add?lookback_hours=24&limit=60');
let proj = {};
try {
  const p = await j('https://api.sleeper.com/projections/nfl/' + state.season + '?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=pts_ppr');
  for (const row of p) proj[row.player_id] = Math.round((row.stats && row.stats.pts_ppr) || 0);
} catch (e) { /* projections endpoint is unofficial; leave zeros and say so */ }
const name = (id) => { const p = players[id]; return p ? ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || id : id; };
const inj = (id) => (players[id] && players[id].injury_status) || 'ACTIVE';
const lines = ['# Sleeper snapshot ' + new Date().toLocaleString() + '. Format: rosterId|playerId|name|injury|seasonProj ; FA rows add |trendCount'];
const owned = new Set();
for (const r of rosters) for (const id of (r.players || [])) { owned.add(id); lines.push([r.roster_id, id, name(id), inj(id), proj[id] || 0].join('|')); }
for (const t of trendingAdd) if (!owned.has(t.player_id)) lines.push(['FA', t.player_id, name(t.player_id), inj(t.player_id), proj[t.player_id] || 0, t.count].join('|'));
const s = league.settings || {};
lines.push('SETTINGS|waiverType=' + s.waiver_type + '|waiverBudget=' + s.waiver_budget + '|waiverDay=' + s.waiver_day_of_week + '|tradeDeadline=' + s.trade_deadline + '|playoffTeams=' + s.playoff_teams + '|vetoVotes=' + s.trade_review_days + '|positions=' + (league.roster_positions || []).join(','));
lines.push('WAIVERORDER|' + rosters.map(r => r.roster_id + ':' + (r.settings && r.settings.waiver_position)).join('|'));
const week = state.week;
const tx = await j(base + '/league/' + LEAGUE_ID + '/transactions/' + week);
const pend = tx.filter(t => t.status !== 'complete').map(t => t.type + ' ' + t.status + ' ' + JSON.stringify(t.adds) + ' ' + JSON.stringify(t.drops));
'PEND:' + JSON.stringify(pend) + '\nSNAPSTART\n' + lines.join('\n') + '\nSNAPEND\n' + 'x'.repeat(95000);
