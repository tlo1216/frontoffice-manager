// ESPN league snapshot, for the hourly watch. Paste into the browser pane's
// JavaScript tool while on a fantasy.espn.com page that is logged in.
// Output format: teamId|playerId|name|injury|seasonProj ; FA rows add |pctOwned
// plus SETTINGS and WAIVERORDER lines, wrapped so the tool saves it to a file.
// Then: node tools/diff-snapshot.mjs <saved file> --apply
const SEASON = 2026, LEAGUE_ID = 'YOUR_LEAGUE_ID', SPORT = 'ffl'; // ffl football, fba basketball, flb baseball
const base = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/' + SPORT + '/seasons/' + SEASON + '/segments/0/leagues/' + LEAGUE_ID;
const j = async (u, h) => { const r = await fetch(u, { credentials: 'include', headers: h || {} }); if (r.status !== 200) throw new Error('status ' + r.status + ' pageHasRoster=' + /[A-Z][a-z]+ [A-Z][a-z]+/.test(document.body.innerText)); return r.json(); };
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
'PEND:' + JSON.stringify(pend) + '\nSNAPSTART\n' + lines.join('\n') + '\nSNAPEND\n' + 'x'.repeat(95000);
