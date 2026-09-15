// Yahoo league snapshot for the hourly watch, same line format as the ESPN and
// Sleeper snapshots so tools/diff-snapshot.mjs works unchanged.
// .env needs YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_REFRESH_TOKEN (from
// tools/yahoo-auth.mjs), YAHOO_LEAGUE_KEY (like 461.l.12345), YAHOO_SPORT
// (nfl, nba or mlb) and YAHOO_SEASON. Projections come from Sleeper's
// unofficial projections endpoint matched by name; zero when unavailable.
// Usage: node tools/yahoo-snapshot-fetch.mjs > snapshot.txt
//        node tools/diff-snapshot.mjs snapshot.txt --apply
import fs from 'node:fs';
const envPath = process.env.FRONTOFFICE_ENV || '.env';
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const basic = Buffer.from(env.YAHOO_CLIENT_ID + ':' + env.YAHOO_CLIENT_SECRET).toString('base64');
const tok = await (await fetch('https://api.login.yahoo.com/oauth2/get_token', { method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.YAHOO_REFRESH_TOKEN, redirect_uri: 'oob' }) })).json();
if (!tok.access_token) { console.error('Yahoo token refresh failed; rerun tools/yahoo-auth.mjs'); process.exit(1); }
const base = 'https://fantasysports.yahooapis.com/fantasy/v2';
const j = async (path) => { const r = await fetch(base + path + (path.includes('?') ? '&' : '?') + 'format=json', { headers: { Authorization: 'Bearer ' + tok.access_token } }); if (r.status !== 200) throw new Error('yahoo ' + r.status + ' on ' + path); return r.json(); };
const LK = env.YAHOO_LEAGUE_KEY, SPORT = env.YAHOO_SPORT || 'nfl', SEASON = env.YAHOO_SEASON || new Date().getFullYear();

// Yahoo's JSON is a nested array soup; these helpers flatten the common shapes.
const objs = (container) => Object.keys(container || {}).filter(k => k !== 'count').map(k => container[k]);
const merge = (arr) => Object.assign({}, ...arr.filter(x => x && typeof x === 'object' && !Array.isArray(x)));

const settings = merge(await j(`/league/${LK}/settings`).then(x => x.fantasy_content.league));
const teamsRaw = await j(`/league/${LK}/teams`);
const teams = objs(teamsRaw.fantasy_content.league[1].teams).map(t => merge(t.team[0]));
let proj = {};
try {
  const p = await (await fetch(`https://api.sleeper.com/projections/${SPORT}/${SEASON}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&position[]=PG&position[]=SG&position[]=SF&position[]=PF&position[]=C&order_by=pts_ppr`)).json();
  for (const row of p) { const pl = row.player || {}; const key = ((pl.first_name || '') + ' ' + (pl.last_name || '')).trim().toLowerCase(); proj[key] = Math.round(((row.stats && (row.stats.pts_ppr || row.stats.pts_std)) || 0) * 100) / 100; }
} catch (e) { /* projections unavailable; zeros */ }
const lines = ['# Yahoo snapshot ' + new Date().toLocaleString() + '. Format: teamId|playerId|name|injury|seasonProj ; FA rows add |pctOwned. Projections from Sleeper by name; 0 means unmatched or unavailable.'];
for (const t of teams) {
  const r = await j(`/team/${t.team_key}/roster`);
  const players = objs(r.fantasy_content.team[1].roster[0].players).map(p => merge(p.player[0]));
  for (const p of players) { const name = p.name && p.name.full || ''; lines.push([t.team_id, p.player_id, name, (p.status || 'ACTIVE'), proj[name.toLowerCase()] || 0].join('|')); }
}
const fa = await j(`/league/${LK}/players;status=A;sort=AR;count=60;out=percent_owned`);
for (const p of objs(fa.fantasy_content.league[1].players).map(p => merge(p.player[0].concat ? p.player[0] : p.player[0]))) { const name = p.name && p.name.full || ''; lines.push(['FA', p.player_id, name, (p.status || 'ACTIVE'), proj[name.toLowerCase()] || 0, p.percent_owned && p.percent_owned.value || 0].join('|')); }
const s = settings;
lines.push('SETTINGS|waiverType=' + s.waiver_type + '|waiverRule=' + s.waiver_rule + '|usesFaab=' + s.uses_faab + '|tradeEndDate=' + s.trade_end_date + '|playoffTeams=' + s.num_playoff_teams + '|maxAdds=' + (s.max_adds || '') + '|scoringType=' + s.scoring_type);
lines.push('WAIVERORDER|' + teams.map(t => t.team_id + ':' + (t.waiver_priority || '')).join('|'));
let pend = [];
try { const tx = await j(`/league/${LK}/transactions;types=waiver`); pend = objs(tx.fantasy_content.league[1].transactions).map(x => merge(x.transaction[0])).filter(x => x.status === 'pending').map(x => x.type + ' ' + x.status + ' ' + x.transaction_key); } catch (e) { }
process.stdout.write('PEND:' + JSON.stringify(pend) + '\nSNAPSTART\n' + lines.join('\n') + '\nSNAPEND\n');
