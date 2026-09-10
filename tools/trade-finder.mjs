// Weekly trade finder. Searches every package of your spare players against
// every player on every other roster, scores BOTH sides by the change to their
// optimal starting lineup, and ranks what is worth proposing.
//
// The key idea: a trade is only worth proposing when it improves YOUR starting
// lineup. A player who never cracks your lineup is worth zero to you no matter
// what he is "worth" on a value chart, and the same is true for your partner.
// That is why this scores lineups, not players.
//
// Input: a JSON file the agent builds from the platform (get_rosters or the
// equivalent), shaped like:
// {
//   "slots": {"QB":1,"RB":2,"WR":3,"TE":1,"FLEX":2,"D/ST":1,"K":1},
//   "flexPositions": ["RB","WR","TE"],
//   "myTeam": "5",
//   "allies": ["3","6"],
//   "names": {"5":"You","3":"Robert","6":"Brennan"},
//   "teams": {"5":[{"name":"Joe Burrow","pos":"QB","proj":304,"untouchable":false}], ...}
// }
// Mark your starters and anyone you refuse to move with "untouchable": true, or
// pass --keep "Name,Name" on the command line.
//
// Usage: node tools/trade-finder.mjs rosters.json [--keep "Name,Name"] [--max-give 2] [--min-gain 20]
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('usage: node tools/trade-finder.mjs <rosters.json> [--keep "Name,Name"] [--max-give 2] [--min-gain 20]'); process.exit(1); }
const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 ? args[i + 1] : d; };
const D = JSON.parse(fs.readFileSync(file, 'utf8'));
const KEEP = new Set(String(flag('keep', '')).split(',').map(s => s.trim()).filter(Boolean));
const MAX_GIVE = +flag('max-give', 2);
const MIN_GAIN = +flag('min-gain', 20);
const FLEX = D.flexPositions || ['RB', 'WR', 'TE'];
const names = D.names || {};
const allies = new Set(D.allies || []);
const me = String(D.myTeam);

function optimal(players) {
  const by = {};
  for (const p of players) (by[p.pos] = by[p.pos] || []).push(p);
  for (const k in by) by[k].sort((a, b) => b.proj - a.proj);
  let total = 0;
  for (const [pos, n] of Object.entries(D.slots)) {
    if (pos === 'FLEX') continue;
    const took = (by[pos] || []).splice(0, n);
    total += took.reduce((a, p) => a + p.proj, 0);
  }
  const flexPool = FLEX.flatMap(p => by[p] || []).sort((a, b) => b.proj - a.proj);
  total += flexPool.slice(0, D.slots.FLEX || 0).reduce((a, p) => a + p.proj, 0);
  return Math.round(total);
}

// Anyone who is in your optimal lineup is not spare. Everyone else is.
function spareOf(teamId) {
  const roster = D.teams[teamId];
  const base = optimal(roster);
  return roster.filter(p => {
    if (p.untouchable || KEEP.has(p.name)) return false;
    return optimal(roster.filter(x => x.name !== p.name)) === base; // removing him costs nothing
  });
}

const mine = D.teams[me];
const myBase = optimal(mine);
const mySpare = spareOf(me);
if (!mySpare.length) { console.log('You have no spare pieces: every player on your roster is in your optimal lineup. Nothing to offer without weakening yourself.'); process.exit(0); }

const packages = [];
const build = (start, cur) => {
  if (cur.length) packages.push([...cur]);
  if (cur.length === MAX_GIVE) return;
  for (let i = start; i < mySpare.length; i++) build(i + 1, [...cur, mySpare[i]]);
};
build(0, []);

const results = [];
for (const [tid, roster] of Object.entries(D.teams)) {
  if (tid === me) continue;
  const theirBase = optimal(roster);
  for (const target of roster) {
    for (const give of packages) {
      const giveNames = new Set(give.map(p => p.name));
      const mineAfter = mine.filter(p => !giveNames.has(p.name)).concat([target]);
      const theirsAfter = roster.filter(p => p.name !== target.name).concat(give);
      const myGain = optimal(mineAfter) - myBase;
      const theirGain = optimal(theirsAfter) - theirBase;
      if (myGain < MIN_GAIN) continue;
      results.push({ tid, who: names[tid] || tid, target, give, myGain, theirGain, ally: allies.has(tid) });
    }
  }
}

if (!results.length) { console.log(`No trade improves your lineup by ${MIN_GAIN} or more right now. That usually means your starters are already the best you can field and the upgrades all belong to teams that start them too.`); process.exit(0); }

// Dedupe per target: keep the package that costs the partner least, because
// that is the one he accepts. Giving a better spare piece often costs you
// nothing in your own lineup and softens his loss a lot.
const best = new Map();
for (const r of results) {
  const k = r.tid + '|' + r.target.name;
  const prev = best.get(k);
  const worth = (x) => x.give.reduce((a, p) => a + p.proj, 0);
  if (!prev || r.myGain > prev.myGain
    || (r.myGain === prev.myGain && r.theirGain > prev.theirGain)
    || (r.myGain === prev.myGain && r.theirGain === prev.theirGain && worth(r) > worth(prev))) best.set(k, r);
}
const list = [...best.values()];

const fmt = (r) => `${(r.who + ':').padEnd(12)} get ${(r.target.name + ' (' + r.target.pos + ' ' + r.target.proj + ')').padEnd(34)} give ${r.give.map(p => p.name).join(' + ').padEnd(38)} you +${r.myGain}   them ${r.theirGain >= 0 ? '+' : ''}${r.theirGain}${r.ally ? '   [ally]' : ''}`;

const mutual = list.filter(r => r.theirGain >= 0).sort((a, b) => b.myGain - a.myGain);
const fair = list.filter(r => r.theirGain < 0 && r.theirGain >= -25).sort((a, b) => b.myGain - a.myGain);
const lopsided = list.filter(r => r.theirGain < -25).sort((a, b) => (b.myGain + b.theirGain) - (a.myGain + a.theirGain));

console.log(`Your optimal lineup: ${myBase}. Spare pieces: ${mySpare.map(p => p.name).join(', ')}\n`);
if (mutual.length) { console.log('BOTH SIDES WIN. Propose these first, they sell themselves.'); mutual.slice(0, 8).forEach(r => console.log('  ' + fmt(r))); console.log(); }
if (fair.length) { console.log('FAIR. You gain more than they lose. Worth asking, especially if the target does not start for them.'); fair.slice(0, 10).forEach(r => console.log('  ' + fmt(r))); console.log(); }
if (lopsided.length) { console.log('LOPSIDED. You gain, they lose badly. Expect a no, and think about the relationship before asking an ally.'); lopsided.slice(0, 8).forEach(r => console.log('  ' + fmt(r))); console.log(); }
if (!mutual.length && !fair.length) console.log('Nothing fair is available this week. Every upgrade costs the other manager about what it gains you, which means the market is closed at honest prices. Wait for an injury or a slump to change someone\'s needs.');
if (list.every(r => r.theirGain <= 0)) console.log("Note: none of your spare players crack another team's starting lineup, so adding more of them to an offer does not reduce what the other manager loses. It only makes the offer look more generous, which is still worth something when you ask.");
console.log('Reminder: these are suggestions. The agent never sends, accepts or rejects a trade. You do.');
