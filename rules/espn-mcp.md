---
name: espn-mcp-primary
description: "The espn-fantasy-mcp server (built 2026-09-10) is the primary ESPN interface for reads and writes; the browser pane is the fallback"
metadata:
  type: project
---

The owner runs `espn-fantasy-mcp` (the espn-fantasy-mcp folder next to the private repo, cookies and league in its .env, WRITES_ENABLED=false as of 2026-09-10). Registered at user scope in the user level Claude config (~/.claude.json) as "espn-fantasy" (node full path, dist/index.js); the tools appear in a session only after a restart. Until then, and from any cron, call it with `node tools/mcp-call.mjs <tool> '<json>'` in frontoffice-ops (spawns the server over stdio).

Tools: get_league, get_teams, get_rosters, get_free_agents, get_matchups, get_boxscore, get_transactions, get_pending, get_player, snapshot (same line format as diff-snapshot.mjs; verified clean diff 2026-09-10), optimal_lineup (heuristic, one input, not authoritative), set_lineup, add_free_agent, waiver_claim, cancel_claim, move_to_ir, activate_from_ir. Writes default to dry_run: true and also need WRITES_ENABLED=true in the server's .env; ask the owner before flipping it. No trade tools, ever.

**How to apply:** use the MCP for every ESPN read and write first; fall back to the pane only when a tool call fails or a capability is missing (trades, anything not listed). Every write: dry run first, read the validation, then the real call, then re read. Log writes as before in league/trade-log.md. The public kit references the same server (ESPN-MCP.md). Related: standing-league-watch, espn-write-capture-technique.
