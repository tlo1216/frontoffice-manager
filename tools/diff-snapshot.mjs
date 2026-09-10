// Usage: node tools/diff-snapshot.mjs <snapshot file or saved tool result> [--apply]
// Extracts the SNAPSTART..SNAPEND block from a saved javascript_tool result,
// diffs it against league-snapshot.txt, prints the changes and pending
// transactions, and with --apply replaces the snapshot.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const [file, flag] = process.argv.slice(2);
let txt = fs.readFileSync(file, 'utf8');
try { const raw = JSON.parse(txt); if (Array.isArray(raw)) { txt = raw.map(r => r.text).join(''); try { txt = JSON.parse(txt.split('\n')[0]); } catch { } } } catch { }
const pend = (txt.match(/^PEND:(.*)$/m) || [, '[]'])[1];
const snap = txt.slice(txt.indexOf('SNAPSTART\n') + 10, txt.indexOf('\nSNAPEND'));
const snapPath = path.join(dir, 'league-snapshot.txt');
const oldT = fs.readFileSync(snapPath, 'utf8');
const parse = t => { const m = {}; for (const l of t.split('\n')) { if (!l || l.startsWith('#')) continue; const f = l.split('|'); if (f[0] === 'SETTINGS' || f[0] === 'WAIVERORDER') { m[f[0]] = l; continue; } m[f[0] + '|' + f[1]] = { name: f[2], inj: f[3], proj: +f[4], team: f[0] }; } return m; };
const o = parse(oldT), n = parse(snap);
const out = [];
for (const k in n) {
  if (!o[k]) { if (typeof n[k] !== 'string') out.push('NEW ' + k + ' ' + n[k].name + ' proj ' + n[k].proj); continue; }
  if (typeof n[k] === 'string') { if (n[k] !== o[k]) out.push('CHANGED ' + k + '\n  old ' + o[k] + '\n  new ' + n[k]); continue; }
  if (n[k].inj !== o[k].inj) out.push('INJ ' + n[k].team + ' ' + n[k].name + ' ' + o[k].inj + ' -> ' + n[k].inj);
  if (Math.abs(n[k].proj - o[k].proj) >= 15) out.push('PROJ ' + n[k].team + ' ' + n[k].name + ' ' + o[k].proj + ' -> ' + n[k].proj);
}
for (const k in o) { if (!n[k] && typeof o[k] !== 'string') out.push('GONE ' + k + ' ' + o[k].name + ' proj ' + o[k].proj); }
console.log('PENDING ' + pend);
console.log(out.length ? out.join('\n') : 'no changes');
if (flag === '--apply') { fs.writeFileSync(snapPath, snap); console.log('snapshot replaced (' + snap.split('\n').length + ' lines)'); }
