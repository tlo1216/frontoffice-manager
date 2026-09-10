// Multi model second opinion on a decision file.
// Sends decisions/<file>.md plus AGENTS.md to every reviewer you have a key for
// (OpenAI, Google Gemini, Anthropic), asks each for a structured verdict, and
// appends a weighted consensus to the decision file's "## Review" section.
// No Codex subscription needed; these are plain API calls billed per use.
//
// .env (never committed):
//   OPENAI_API_KEY=...      OPENAI_MODEL=<model id>     OPENAI_WEIGHT=1
//   GEMINI_API_KEY=...      GEMINI_MODEL=<model id>     GEMINI_WEIGHT=1
//   ANTHROPIC_API_KEY=...   ANTHROPIC_MODEL=<model id>  ANTHROPIC_WEIGHT=1
// Set the model ids to the strongest reasoning model each provider offers on your plan.
// Usage: node tools/second-opinion.mjs decisions/2026-09-12-example.md
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/second-opinion.mjs <decision file>'); process.exit(1); }
const env = fs.existsSync('.env') ? Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })) : {};
const decision = fs.readFileSync(file, 'utf8');
const guide = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
const rules = fs.existsSync('rules') ? fs.readdirSync('rules').filter(f => f.endsWith('.md')).map(f => fs.readFileSync('rules/' + f, 'utf8')).join('\n\n') : '';

const system = `You are an independent reviewer of a fantasy football management decision. Follow these review instructions exactly:\n\n${guide}\n\nStanding rules the agent works under:\n\n${rules}\n\nReply with JSON only: {"verdict":"AGREE"|"DISAGREE","confidence":0..1,"disputed_numbers":[{"claim":"...","your_figure":"...","source":"..."}],"strongest_alternative":"...","reasoning":"three sentences at most"}`;
const user = `Decision under review:\n\n${decision}`;

const reviewers = [];
if (env.OPENAI_API_KEY) reviewers.push({ name: 'openai', weight: +(env.OPENAI_WEIGHT || 1), call: async () => {
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: JSON.stringify({ model: env.OPENAI_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' } }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j.choices[0].message.content; } });
if (env.GEMINI_API_KEY) reviewers.push({ name: 'gemini', weight: +(env.GEMINI_WEIGHT || 1), call: async () => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json' } }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j.candidates[0].content.parts[0].text; } });
if (env.ANTHROPIC_API_KEY) reviewers.push({ name: 'anthropic', weight: +(env.ANTHROPIC_WEIGHT || 1), call: async () => {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j.content.map(c => c.text || '').join(''); } });
if (!reviewers.length) { console.error('no reviewer keys in .env'); process.exit(1); }

const results = [];
for (const rv of reviewers) {
  try {
    const raw = await rv.call();
    const m = raw.match(/\{[\s\S]*\}/); const parsed = JSON.parse(m ? m[0] : raw);
    results.push({ name: rv.name, weight: rv.weight, ...parsed });
  } catch (e) { results.push({ name: rv.name, weight: rv.weight, verdict: 'ERROR', confidence: 0, reasoning: String(e.message).slice(0, 200) }); }
}
const valid = results.filter(r => r.verdict === 'AGREE' || r.verdict === 'DISAGREE');
const total = valid.reduce((a, r) => a + r.weight * (r.confidence || 0.5), 0);
const agree = valid.filter(r => r.verdict === 'AGREE').reduce((a, r) => a + r.weight * (r.confidence || 0.5), 0);
const score = total ? agree / total : null;
const consensus = score === null ? 'NO REVIEW' : score >= 0.6 ? 'AGREE' : score <= 0.4 ? 'DISAGREE' : 'SPLIT';

let out = `\n### Second opinions (${new Date().toISOString()})\n\n`;
for (const r of results) {
  out += `- **${r.name}** (weight ${r.weight}): ${r.verdict}${r.confidence != null ? ', confidence ' + r.confidence : ''}. ${r.reasoning || ''}\n`;
  for (const d of (r.disputed_numbers || [])) out += `  - disputes "${d.claim}": ${d.your_figure} (${d.source})\n`;
  if (r.strongest_alternative) out += `  - alternative: ${r.strongest_alternative}\n`;
}
out += `\n**Weighted consensus: ${consensus}${score !== null ? ' (' + Math.round(score * 100) + '% agree by weight and confidence)' : ''}.** A DISAGREE or SPLIT goes to the owner before any timer runs.\n`;
fs.appendFileSync(file, out);
console.log(out);
