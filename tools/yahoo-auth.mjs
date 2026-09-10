// One time Yahoo OAuth. Needs YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in .env
// (from https://developer.yahoo.com/apps/create/, Installed Application,
// redirect https://localhost:8080). Prints a URL; open it, click Allow, paste
// the code back. Stores YAHOO_REFRESH_TOKEN in .env and lists your leagues.
// Usage: node tools/yahoo-auth.mjs
import fs from 'node:fs';
import readline from 'node:readline';

const envPath = process.env.FRONTOFFICE_ENV || '.env';
const env = fs.existsSync(envPath) ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })) : {};
if (!env.YAHOO_CLIENT_ID || !env.YAHOO_CLIENT_SECRET) { console.error('Put YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in ' + envPath + ' first.'); process.exit(1); }
const redirect = env.YAHOO_REDIRECT || 'https://localhost:8080';
const basic = Buffer.from(env.YAHOO_CLIENT_ID + ':' + env.YAHOO_CLIENT_SECRET).toString('base64');

export async function refreshAccessToken() {
  const r = await fetch('https://api.login.yahoo.com/oauth2/get_token', { method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.YAHOO_REFRESH_TOKEN, redirect_uri: redirect }) });
  const j = await r.json(); if (!r.ok) throw new Error('refresh failed: ' + JSON.stringify(j).slice(0, 200)); return j.access_token;
}

const url = 'https://api.login.yahoo.com/oauth2/request_auth?' + new URLSearchParams({ client_id: env.YAHOO_CLIENT_ID, redirect_uri: redirect, response_type: 'code', language: 'en-us' });
console.log('\nOpen this URL, sign in, click Allow, then copy the code (from the page, or the code= part of the address bar):\n\n' + url + '\n');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the code here: ', async (code) => {
  rl.close();
  const r = await fetch('https://api.login.yahoo.com/oauth2/get_token', { method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: code.trim(), redirect_uri: redirect }) });
  const j = await r.json();
  if (!r.ok) { console.error('token exchange failed: ' + JSON.stringify(j).slice(0, 300)); process.exit(1); }
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  text = text.split('\n').filter(l => !l.startsWith('YAHOO_REFRESH_TOKEN=')).join('\n').replace(/\n*$/, '\n') + 'YAHOO_REFRESH_TOKEN=' + j.refresh_token + '\n';
  fs.writeFileSync(envPath, text);
  console.log('Refresh token saved to ' + envPath + '. Your leagues:');
  const g = await fetch('https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games/leagues?format=json', { headers: { Authorization: 'Bearer ' + j.access_token } });
  const gj = await g.json();
  try {
    const games = gj.fantasy_content.users[0].user[1].games;
    for (const k of Object.keys(games)) { if (k === 'count') continue; const game = games[k].game; const meta = game[0]; const leagues = game[1] && game[1].leagues; if (!leagues) continue; for (const lk of Object.keys(leagues)) { if (lk === 'count') continue; const L = leagues[lk].league[0]; console.log('  ' + meta.code + ' ' + meta.season + '  ' + L.name + '  league_key=' + L.league_key); } }
  } catch (e) { console.log(JSON.stringify(gj).slice(0, 800)); }
});
