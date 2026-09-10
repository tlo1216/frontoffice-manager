// Live draft assistant. Paste into the browser pane's JavaScript tool while the
// ESPN draft room (or any fantasy.espn.com page for your league) is open and logged
// in. First paste the contents of draft-board.json as the BOARD constant below
// (the agent does this), then run the snippet each time it is close to your pick.
// It reads every pick made so far, removes them from the board, and returns the
// best available for your remaining roster needs with a "likely gone before your
// next pick" flag based on ADP.
const SEASON = 2026, LEAGUE_ID = 'YOUR_LEAGUE_ID', MY_TEAM_ID = 0, SPORT = 'ffl';
const BOARD = null; // <- the agent replaces null with the JSON object from draft-board.json
const base = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/' + SPORT + '/seasons/' + SEASON + '/segments/0/leagues/' + LEAGUE_ID;
const d = await (await fetch(base + '?view=mDraftDetail&view=mSettings', { credentials: 'include' })).json();
const picks = (d.draftDetail && d.draftDetail.picks) || [];
const taken = new Set(picks.map(p => p.playerId));
const mine = picks.filter(p => p.teamId === MY_TEAM_ID).map(p => BOARD.players.find(b => b.id === p.playerId)).filter(Boolean);
const teams = BOARD.teams, made = picks.length, round = Math.floor(made / teams) + 1;
const order = d.settings.draftSettings.pickOrder || []; // team ids in round 1 order
const myIdx = order.indexOf(MY_TEAM_ID);
const pickInRound = (r) => (r % 2 === 1 ? myIdx : teams - 1 - myIdx) + 1;
const myNextOverall = (() => { for (let r = round; r <= 30; r++) { const o = (r - 1) * teams + pickInRound(r); if (o > made) return o; } return made + 1; })();
const myFollowing = (() => { for (let r = round; r <= 30; r++) { const o = (r - 1) * teams + pickInRound(r); if (o > myNextOverall) return o; } return myNextOverall + teams; })();
// Needs: starters not yet filled, flex counted after.
const need = Object.assign({}, BOARD.starters); let flexLeft = BOARD.flex;
for (const p of mine) { if (need[p.pos] > 0) need[p.pos]--; else if (['RB', 'WR', 'TE'].includes(p.pos) && flexLeft > 0) flexLeft--; }
const available = BOARD.players.filter(p => !taken.has(p.id));
const scored = available.map(p => { const needBoost = need[p.pos] > 0 ? 1.15 : (['RB', 'WR', 'TE'].includes(p.pos) && flexLeft > 0 ? 1.05 : (p.pos === 'K' || p.pos === 'DST') && round < 13 ? 0.2 : 0.9); return { ...p, score: +(p.vorp * needBoost).toFixed(1), likelyGoneByNext: p.adp < myFollowing }; }).sort((a, b) => b.score - a.score);
({ picksMade: made, round, myNextOverall, myFollowingOverall: myFollowing, myPicks: mine.map(p => p.pos + ' ' + p.name), needs: need, flexLeft, best: scored.slice(0, 8).map(p => `${p.pos} ${p.name} vorp ${p.vorp} adp ${p.adp}${p.likelyGoneByNext ? ' (gone before your following pick)' : ''}`), bestByPosition: Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DST'].map(pos => [pos, scored.filter(p => p.pos === pos).slice(0, 3).map(p => p.name + ' ' + p.vorp)])) });
