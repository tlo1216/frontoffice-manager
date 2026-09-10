// One time Yahoo sign in. Run: node tools/yahoo-auth.mjs
// Needs YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in .env (see YAHOO-SETUP.md).
// Prints a link; you click Allow; Yahoo shows a short code; you paste it here.
// Then this script saves the refresh token, finds your leagues and your team,
// and writes YAHOO_LEAGUE_KEY, YAHOO_TEAM_KEY, YAHOO_SPORT and YAHOO_SEASON
// into .env by itself when there is only one league for the current season.
import fs from 'node:fs';
import readline from 'node:readline';

const envPath = process.env.FRONTOFFICE_ENV || '.env';
const readEnv = () => fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })) : {};
const setEnv = (pairs) => { let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''; for (const [k, v] of Object.entries(pairs)) { text = text.split('\n').filter(l => !l.startsWith(k + '=')).join('\n').replace(/\n*$/, '\n') + k + '=' + v + '\n'; } fs.writeFileSync(envPath, text); };
const env = readEnv();
if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET) { console.error('Add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET to ' + envPath + ' first (YAHOO-SETUP.md, step 1).'); process.exit(1); }
const redirect = 'oob'; // Yahoo shows the code on screen instead of redirecting anywhere
const basic = Buffer.from(env.YAHOO_CLIENT_ID + ':' + env.YAHOO_CLIENT_SECRET).toString('base64');
const token = async (params) => { const r = await fetch('https://api.login.yahoo.com/oauth2/get_token', { method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ redirect_uri: redirect, ...params }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j; };
const api = async (path, access) => { const r = await fetch('https://fantasysports.yahooapis.com/fantasy/v2' + path + '?format=json', { headers: { Authorization: 'Bearer ' + access } }); if (r.status !== 200) throw new Error('yahoo ' + r.status + ' on ' + path); return r.json(); };
const objs = (c) => Object.keys(c || {}).filter(k => k !== 'count').map(k => c[k]);
const merge = (arr) => Object.assign({}, ...arr.filter(x => x && typeof x === 'object' && !Array.isArray(x)));

const url = 'https://api.login.yahoo.com/oauth2/request_auth?' + new URLSearchParams({ client_id: env.YAHOO_CLIENT_ID, redirect_uri: redirect, response_type: 'code', language: 'en-us' });
console.log('\n1. Open this link (copy it into any browser where you are signed into Yahoo):\n\n   ' + url + '\n\n2. Click Allow. Yahoo shows a short code on the next page.\n');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('3. Paste the code here and press Enter: ', async (code) => {
  rl.close();
  try {
    const t = await token({ grant_type: 'authorization_code', code: code.trim() });
    setEnv({ YAHOO_REFRESH_TOKEN: t.refresh_token });
    console.log('\nSigned in. Refresh token saved to ' + envPath + ' (it renews itself from now on).');
    const gj = await api('/users;use_login=1/games/leagues', t.access_token);
    const found = [];
    const games = gj.fantasy_content.users[0].user[1].games;
    for (const g of objs(games)) { const meta = g.game[0]; const leagues = g.game[1] && g.game[1].leagues; if (!leagues) continue; for (const l of objs(leagues)) { const L = l.league[0]; found.push({ code: meta.code, season: meta.season, name: L.name, key: L.league_key, current: meta.is_game_over === 0 || meta.is_game_over === '0' }); } }
    if (!found.length) { console.log('No leagues found on this Yahoo account.'); return; }
    console.log('\nYour leagues:'); found.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f.code.toUpperCase() + ' ' + f.season + '  ' + f.name + '  (' + f.key + ')'));
    const live = found.filter(f => f.current);
    const pick = live.length === 1 ? live[0] : (found.length === 1 ? found[0] : null);
    if (!pick) { console.log('\nMore than one active league. Tell your agent which one; it will write YAHOO_LEAGUE_KEY, YAHOO_SPORT and YAHOO_SEASON into ' + envPath + '.'); return; }
    let teamKey = '';
    try { const tj = await api('/league/' + pick.key + '/teams', t.access_token); for (const tm of objs(tj.fantasy_content.league[1].teams)) { const m = merge(tm.team[0]); if (m.is_owned_by_current_login === 1 || m.is_owned_by_current_login === '1') teamKey = m.team_key; } } catch (e) { }
    setEnv({ YAHOO_LEAGUE_KEY: pick.key, YAHOO_SPORT: pick.code, YAHOO_SEASON: String(pick.season), ...(teamKey ? { YAHOO_TEAM_KEY: teamKey } : {}) });
    console.log('\nWrote YAHOO_LEAGUE_KEY=' + pick.key + ', YAHOO_SPORT=' + pick.code + ', YAHOO_SEASON=' + pick.season + (teamKey ? ', YAHOO_TEAM_KEY=' + teamKey : '') + ' to ' + envPath + '.\nDone. Tell your agent "Yahoo is connected".');
  } catch (e) { console.error('\nSomething went wrong: ' + e.message + '\nMost common cause: the code was pasted with a space, or the app was created without the Fantasy Sports permission.'); process.exit(1); }
});
