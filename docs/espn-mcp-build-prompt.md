
Build a local MCP server that replaces the browser pane for ESPN fantasy sports: reads and writes against ESPN's fantasy API using my own session cookies, exposed as tools that Claude Code and Codex can call. Name it `espn-fantasy-mcp`. TypeScript, Node 20 or newer, stdio transport, published only to my private GitHub (create the repo private under my account with gh). No web UI, no cloud.

## 1. What is known about the API (start from this, do not rediscover it)

Reads: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/{sport}/seasons/{season}/segments/0/leagues/{leagueId}` where sport is `ffl` (football), `fba` (basketball) or `flb` (baseball). Views are passed as repeated `view=` query params: `mTeam`, `mRoster`, `mSettings`, `mMatchup`, `mMatchupScore`, `mBoxscore` (with `scoringPeriodId`), `mPendingTransactions`, `mTransactions2`, `kona_player_info` (needs an `X-Fantasy-Filter` JSON header, for example `{"players":{"filterStatus":{"value":["FREEAGENT","WAIVERS"]},"limit":60,"sortPercOwned":{"sortPriority":1,"sortAsc":false}}}`; `filterSlotIds`, `filterIds`, `filterStatsForCurrentSeasonScoringPeriodId` are also accepted). Authentication is two cookies on the request: `espn_s2` and `SWID` (SWID is braced, like `{XXXXXXXX-...}`). Without them private leagues return 401. Player stats live in `player.stats[]` with `statSourceId` (1 projection, 0 actual), `scoringPeriodId` (0 season, N period), `seasonId`, `appliedTotal`. Football slot ids: 0 QB, 2 RB, 4 WR, 6 TE, 23 FLEX, 16 D/ST, 17 K, 20 Bench, 21 IR. Basketball and baseball slot ids and daily scoring periods are documented in the cheat sheets in `https://github.com/tlo1216/frontoffice-manager/tree/main/tools` (read `espn-api-cheatsheet.md`, `espn-basketball-cheatsheet.md`, `espn-baseball-cheatsheet.md`). The Python library `cwendt94/espn-api` on GitHub has complete constants for slots, positions, pro teams and stat ids for all three sports; port its constant tables, cite it in the README.

Writes: `POST https://lm-api-writes.fantasy.espn.com/apis/v3/games/{sport}/seasons/{season}/segments/0/leagues/{leagueId}/transactions/` with the same cookies, `Content-Type: application/json`, and the headers the site sends (`X-Fantasy-Source: kona`, `X-Fantasy-Platform` as observed, `Origin: https://fantasy.espn.com`, `Referer: https://fantasy.espn.com/`). Two payloads were captured from the real site on 2026-09-08 and are the ground truth:

Waiver claim with a conditional drop (priority league, so bidAmount null; FAAB leagues send a number):
```
{"isLeagueManager":false,"teamId":5,"type":"WAIVER","memberId":"{SWID}","scoringPeriodId":1,"executionType":"EXECUTE",
 "items":[{"playerId":4428557,"type":"ADD","toTeamId":5},{"playerId":4686658,"type":"DROP","fromTeamId":5}],"bidAmount":null}
```
Cancel a pending claim:
```
{"isLeagueManager":false,"teamId":5,"type":"WAIVER","memberId":"{SWID}","scoringPeriodId":1,"executionType":"CANCEL","relatedTransactionId":"<uuid>"}
```
Free agent add or drop uses `"type":"FREEAGENT"` with the same item shapes (observed in `mTransactions2` as executed FREEAGENT transactions with ADD and DROP items). Lineup changes appear in `mTransactions2` as `"type":"ROSTER"` with items `{"type":"LINEUP","playerId":N,"fromLineupSlotId":A,"toLineupSlotId":B}`; the exact POST body for a lineup move has NOT been captured yet. Before implementing `set_lineup`, capture one real lineup move from the browser: install this interceptor on a fantasy.espn.com team page in a logged in browser, make one move in the UI, then read `sessionStorage.ffcap`:
```
(function(){const of=window.fetch;window.fetch=async function(u,o){try{if(String(u).includes('lm-api-writes')){const a=JSON.parse(sessionStorage.ffcap||'[]');a.push({u:String(u),m:o&&o.method,b:o&&o.body,h:o&&o.headers});sessionStorage.ffcap=JSON.stringify(a);}}catch(e){}return of.apply(this,arguments);};})();
```
The page redirects after Confirm and clears the network log, which is why the interceptor stores into sessionStorage. Redact `espn_s2` and `SWID` in anything you commit. I will do the click when you tell me the interceptor is ready; the manager session can also do it from its pane.

Cookie facts: `espn_s2` and `SWID` are set by ESPN's login and are readable in the browser's cookie store (DevTools, Application, Cookies, fantasy.espn.com). They expire; on a 401 from a request that previously worked, the server must return a clear error asking for fresh cookies rather than retrying. Never accept or store a password; cookies only.

## 2. Tools to expose (all take `sport`, `season`, `league_id` unless configured as defaults in the env file)

Reads:
- `get_league` (settings, scoring, roster slots, schedule, acquisition and trade settings, current scoring period)
- `get_teams` (ids, names, owners, records, waiver rank)
- `get_rosters` (every team, or one `team_id`; each player with id, name, position, pro team, eligible slots, lineup slot, injury status, season projection, period projection, actual for a period)
- `get_free_agents` (position filter, limit, sort by owned or by projection; returns the same player shape plus ownership percent and waiver status)
- `get_matchups` (a period; live totals and live projections)
- `get_boxscore` (a period; per player actuals)
- `get_transactions` (executed, with types and items resolved to player names)
- `get_pending` (pending claims and trade proposals)
- `get_player` (by id or name search)
- `snapshot` (the exact text format the manager session diffs: `teamId|playerId|name|injury|seasonProj` lines, FA rows with ownership, SETTINGS and WAIVERORDER lines, and a PEND line; see `tools/snapshot-fetch.js` in frontoffice-manager for the reference implementation)

Writes (every write tool has `dry_run: true` by default; a call with `dry_run: false` performs it, then re reads and returns the verified state):
- `set_lineup` (list of `{player_id, to_slot}` moves; validates slot eligibility and locked players against the roster before sending; refuses moves on locked players)
- `add_free_agent` (`add_player_id`, optional `drop_player_id`)
- `waiver_claim` (`add_player_id`, optional `drop_player_id`, optional `bid`)
- `cancel_claim` (`transaction_id`)
- `move_to_ir` and `activate_from_ir` (as lineup moves to and from slot 21, with eligibility check)

Not in scope, ever: proposing, accepting or rejecting trades. Do not implement those tools.

## 3. Configuration and safety

- Cookies and defaults come from a local `.env` (`ESPN_S2`, `ESPN_SWID`, `ESPN_SPORT`, `ESPN_SEASON`, `ESPN_LEAGUE_ID`, `ESPN_TEAM_ID`), path overridable with `ESPN_MCP_ENV`. `.env` is gitignored. The server never prints cookie values, not even in errors.
- Every write is logged to `logs/writes.jsonl` with timestamp, tool, arguments, the request body with `memberId` redacted, the response status and body, and the verification result. Reads are not logged.
- Rate limit reads to 2 per second and writes to 1 per 5 seconds. Retry reads once on network errors, never retry writes.
- A `WRITES_ENABLED=false` setting makes every write tool return a dry run regardless of arguments; default `false` until acceptance checks pass.
- Validate lineup moves locally before sending: the player must be on the team, the target slot must be in the player's `eligibleSlots`, the player must not be locked (the roster entry and `mMatchup` expose lock state and game start), and the resulting lineup must respect the slot counts from `get_league`.

## 4. Project shape

`src/index.ts` (McpServer + StdioServerTransport from `@modelcontextprotocol/sdk`, zod schemas for every tool), `src/espn/client.ts` (fetch wrapper with cookies, headers, rate limits, 401 handling), `src/espn/constants.ts` (ported tables), `src/espn/reads.ts`, `src/espn/writes.ts`, `src/snapshot.ts`, `test/` with recorded fixtures (redacted JSON responses) and unit tests for the lineup validator and the snapshot format, `README.md` with setup, tool list, the cookie instructions, and the honest limits (undocumented API, cookies expire, ESPN can change payloads). Build with `tsc`; provide `npm run build`, `npm test`, `npm start`.

## 5. Connecting it

Document both: for Claude Code, `claude mcp add espn-fantasy -- node <absolute path>/dist/index.js` (or a project `.mcp.json` with the same command), scope user so every session sees it; for Codex, the equivalent entry in its MCP config. Include the exact commands with my path filled in.

## 6. Acceptance checks (run them yourself where you can, list the rest for me)

1. `get_league` and `get_rosters` return my league (football, 2026, your league id and team id) with cookies from `.env`.
2. `snapshot` output diffs cleanly against `frontoffice-ops/tools/league-snapshot.txt` using `frontoffice-manager/tools/diff-snapshot.mjs` (same line format, same counts).
3. `set_lineup` in dry run rejects a move of a locked player and a move to an ineligible slot, and accepts a valid swap.
4. With `WRITES_ENABLED=true`, `set_lineup` swaps two bench players' order or moves a bench player into an open slot and back, and the re read confirms it. Do this only on my say so, on a day with no locked players involved, and log it.
5. `waiver_claim` dry run produces exactly the captured payload shape.
6. A 401 with bad cookies produces the "refresh cookies" error without leaking the cookie values.

## 7. Leverage, do not reinvent

Read these first and cite them in the README: `cwendt94/espn-api` (constants and view usage, Python), `mkreiser/ESPN-Fantasy-Football-API` (JavaScript client, reads), `KBThree13/mcp_espn_ff` (an existing Python MCP for ESPN football reads, useful for tool naming), `dylancharris` ESPN fantasy basketball MCP on LobeHub, `stmorse.github.io/journal/espn-fantasy-v3.html` and the ffscrapr endpoint vignette for view documentation, the MCP TypeScript SDK docs at `ts.sdk.modelcontextprotocol.io`. Port ideas and constants; write the server fresh in TypeScript so it is one process with no Python.

## 8. When done

Commit, push to the private repo, and print: the `claude mcp add` command, the tool list, the acceptance results, and the one thing you could not verify without me.
