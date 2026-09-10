// Call one espn-fantasy-mcp tool over stdio from a shell, without needing the
// MCP to be loaded into the current agent session. Prints the tool's text result.
// Usage: node tools/mcp-call.mjs <tool> '<json arguments>'
//   node tools/mcp-call.mjs snapshot '{}' > snapshot.txt
//   node tools/mcp-call.mjs set_lineup '{"moves":[{"player_id":123,"to_slot":23}],"dry_run":true}'
// ESPN_MCP can point at the server's dist/index.js; default is the sibling folder.
import { spawn } from 'node:child_process';
import path from 'node:path';
const SERVER = path.resolve(process.env.ESPN_MCP || '../espn-fantasy-mcp/dist/index.js');
const NODE = process.execPath;
const [tool, argJson] = process.argv.slice(2);
if (!tool) { console.error('usage: node tools/mcp-call.mjs <tool> [json args]'); process.exit(1); }
const args = argJson ? JSON.parse(argJson) : {};
// The server reads its own .env from its working directory, so launch it from its folder.
const serverRoot = path.resolve(path.dirname(SERVER), '..');
const child = spawn(NODE, [SERVER], { cwd: serverRoot, stdio: ['pipe', 'pipe', 'ignore'] });
let buf = '', done = false;
const finish = (code) => { if (done) return; done = true; try { child.kill(); } catch (e) { } process.exit(code); };
child.stdout.on('data', (d) => {
  buf += d;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch (e) { continue; }
    if (j.id !== 2) continue;
    if (j.error) { console.error(JSON.stringify(j.error)); finish(2); }
    const text = (j.result.content || []).map(c => c.text).join('\n');
    process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    finish(j.result.isError ? 3 : 0);
  }
});
child.on('close', () => finish(1));
const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'frontoffice-ops', version: '1' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
setTimeout(() => { console.error('timeout'); finish(4); }, 90000);
