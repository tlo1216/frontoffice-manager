# ESPN without the browser: the espn-fantasy-mcp server

The kit's default ESPN path is the agent's browser pane, logged into ESPN, reading the league API from inside the page and clicking the page for writes. It works and needs nothing installed. The better path, once you have ten minutes, is a small local MCP server that reads and writes ESPN with your session cookies: no pane to keep open, no re login when the pane forgets you, and every write validated before it is sent.

## What it gives the agent

Tools it can call directly: `get_league`, `get_teams`, `get_rosters`, `get_free_agents`, `get_matchups`, `get_boxscore`, `get_transactions`, `get_pending`, `get_player`, `snapshot` (the exact line format the hourly diff uses), `optimal_lineup` (a suggestion the agent treats as one input, never as the decision), and writes `set_lineup`, `add_free_agent`, `waiver_claim`, `cancel_claim`, `move_to_ir`, `activate_from_ir`. Every write defaults to a dry run that validates slot eligibility, locks and roster limits and reports what would happen; real execution needs `dry_run: false` and `WRITES_ENABLED=true` in the server's own `.env`. No trade tools exist and none will.

## Get it

It is open source: https://github.com/tlo1216/espn-fantasy-mcp

```bash
git clone https://github.com/tlo1216/espn-fantasy-mcp.git
cd espn-fantasy-mcp
npm install
npm run build
```

Its README has the cookie steps and the tool reference. If you would rather build your own, `docs/espn-mcp-build-prompt.md` is the prompt that produced it.

## Connect it (once)

Cookies: log into fantasy.espn.com in any browser, open DevTools, Application (or Storage), Cookies, copy `espn_s2` and `SWID` (with the braces) into the server's `.env` with your league id, team id, sport and season. Never paste them into a chat.

Claude Code:

```bash
claude mcp add espn-fantasy --scope user -- node "<absolute path>/espn-fantasy-mcp/dist/index.js"
```

If `claude` is not on your PATH, the same entry goes into `~/.claude.json` under `mcpServers` with the absolute path to `node` and to `dist/index.js`. Restart the session; the tools appear as `mcp__espn-fantasy__*`.

Codex: add the same command under its MCP servers configuration.

Until a session restarts, or from scripts and scheduled jobs, `tools/mcp-call.mjs <tool> '<json>'` calls any tool over stdio by spawning the server, so nothing waits on a restart.

## What changes in how the agent works

- Reads: every league read goes through the server first. The hourly watch runs `snapshot` and diffs it exactly as before.
- Writes: dry run, read the validation, then the real call, then a re read to confirm. Same authorizations as always; the server does not change what the agent is allowed to do, only how it does it.
- Fallback: the pane stays configured. If a tool call fails or a capability is missing, the agent uses the pane for that one action and says so.
- Cookies expire. The server returns a clear "refresh cookies" error; the agent tells you once and keeps working from the last snapshot.

## Setup with the agent

Say "set up the ESPN MCP". The agent checks Node, walks you through the cookie copy, writes the `.env` from what you paste into the file (not the chat), registers the server, restarts or uses the stdio helper, runs `get_league` and `snapshot` to prove it works, and runs one dry run `set_lineup` so you can see the validation before anything real is ever sent. Flipping `WRITES_ENABLED` to true is your call, and the agent asks.

## Also: ChatGPT on your phone

With this server installed you can optionally connect it to the ChatGPT app over OpenAI's Secure MCP Tunnel, read only, and ask your league questions away from the repo. The tunnel launches the server through a wrapper that forces writes off for that process, so ChatGPT previews and never executes, and your agent keeps its own write access untouched. See `CHATGPT-TUNNEL.md`.
