// ESPN league snapshot without a browser pane (Codex, terminals, servers).
// Reads cookies from a local .env (never committed):
//   ESPN_S2=...   SWID={...}   ESPN_LEAGUE_ID=...   ESPN_SEASON=2026
// How to get the cookies: log into fantasy.espn.com in any browser, open the
// developer tools, Application (or Storage), Cookies, copy the values of
// espn_s2 and SWID. They last about a month.
// Usage: node tools/espn-cookie-fetch.mjs > snapshot.txt
//        node tools/diff-snapshot.mjs snapshot.txt --apply   (diff-snapshot accepts a plain snapshot file too)
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const SEASON = +env.ESPN_SEASON, LEAGUE_ID = env.ESPN_LEAGUE_ID;
const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;
const headers = { Cookie: `espn_s2=${env.ESPN_S2}; SWID=${env.SWID}` };
const j = async (u, extra) => { const r = await fetch(u, { headers: { ...headers, ...(extra || {}) } }); if (r.status !== 200) throw new Error('status ' + r.status + ' (cookies expired?)'); return r.json(); };
const R = await j(base + '?view=mRoster');
const M = await j(base + '?view=mTeam');
const S = await j(base + '?view=mSettings');
const P = await j(base + '?view=mPendingTransactions');
const FA = await j(base + '?scoringPeriodId=1&view=kona_player_info', { 'X-Fantasy-Filter': JSON.stringify({ players: { filterStatus: { value: ['FREEAGENT', 'WAIVERS'] }, limit: 60, sortPercOwned: { sortPriority: 1, sortAsc: false } } }) });
const sp = p => { const s = (p.stats || []).find(x => x.statSourceId === 1 && x.scoringPeriodId === 0 && x.seasonId === SEASON); return s ? Math.round(s.appliedTotal) : 0; };
const lines = ['# League snapshot ' + new Date().toLocaleString() + '. Format: teamId|playerId|name|injury|seasonProj ; FA rows add |pctOwned'];
for (const t of R.teams) for (const e of (t.roster ? t.roster.entries : [])) { const p = e.playerPoolEntry.player; lines.push([t.id, p.id, p.fullName, p.injuryStatus, sp(p)].join('|')); }
for (const x of (FA.players || [])) { const p = x.player; lines.push(['FA', p.id, p.fullName, p.injuryStatus, sp(p), Math.round(p.ownership ? p.ownership.percentOwned : 0)].join('|')); }
const a = S.settings.acquisitionSettings, sc = S.settings.scheduleSettings, tr = S.settings.tradeSettings;
lines.push('SETTINGS|acquisitionType=' + a.acquisitionType + '|waiverOrderReset=' + a.waiverOrderReset + '|waiverHours=' + a.waiverHours + '|processDays=' + (a.waiverProcessDays || []).map(d => d.slice(0, 3)).join(',') + '|processHour=' + a.waiverProcessHour + '|tradeDeadline=' + new Date(tr.deadlineDate).toISOString().slice(0, 16).replace('T', ' ') + '|vetoVotes=' + tr.vetoVotesRequired + '|playoffTeams=' + sc.playoffTeamCount + '|keepers=' + S.settings.draftSettings.keeperCount);
lines.push('WAIVERORDER|' + M.teams.map(t => t.id + ':' + t.waiverRank).join('|'));
const pend = (P.pendingTransactions || []).map(x => x.teamId + ' ' + x.type + ' ' + x.status + ' ' + (x.items || []).map(i => i.type + ':' + i.playerId).join(' '));
process.stdout.write('PEND:' + JSON.stringify(pend) + '\nSNAPSTART\n' + lines.join('\n') + '\nSNAPEND\n');
