// Lists the model ids each API key in .env can reach. Never prints the keys.
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
console.log('keys present:', Object.keys(env).filter(k => k.endsWith('_KEY')).map(k => k + '(' + (env[k] ? env[k].length : 0) + ' chars)').join(', '));
if (env.OPENAI_API_KEY) {
  const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY } });
  const j = await r.json();
  if (!r.ok) console.log('openai error:', JSON.stringify(j).slice(0, 200));
  else console.log('openai models:', j.data.map(m => m.id).filter(id => !/embed|tts|whisper|dall|audio|realtime|moderation|image|transcribe|search|instruct|babbage|davinci/.test(id)).sort().join(', '));
}
if (env.GEMINI_API_KEY) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + env.GEMINI_API_KEY);
  const j = await r.json();
  if (!r.ok) console.log('gemini error:', JSON.stringify(j).slice(0, 200));
  else console.log('gemini models:', j.models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', '') + (m.displayName ? ' [' + m.displayName + ']' : '')).join(', '));
}
