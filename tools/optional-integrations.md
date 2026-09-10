# Optional integrations, evaluated

Things people ask about, with an honest verdict for this kit. Baked in means it is referenced by the rules and used by the agent; optional means it works but is not required; skip means it does not help here.

| Tool | Verdict | Why |
|---|---|---|
| nflverse data (schedules, official injury reports, depth charts, weekly rosters) | **baked in** | Free CSVs, no key, the official injury report and depth charts are better than any platform's injury tag, and the schedule sets lock reminders exactly. See `nflverse-cheatsheet.md`. |
| FantasyCalc trade values | **baked in** | Free API of market values built from real trades. The second opinion on every trade grade. See `rules/grade-every-trade.md`. |
| Codex code review on decision PRs | **baked in** | The second model. See `decisions/README.md` and `AGENTS.md`. |
| espn-api (Python, cwendt94) | optional | Mature library for ESPN reads with cookies. If your agent has Python and no browser pane, it is the well trodden path; the kit's `espn-cookie-fetch.mjs` does the same in node without a dependency. |
| sleeper-api-mcp, mcp_espn_ff | optional | MCP servers that expose Sleeper or ESPN to an agent as tools. Convenient if you already run MCP servers; the kit's scripts cover the same reads without another process to keep alive. |
| agent-reach | optional | Gives the agent read access to X, Reddit and YouTube without API fees. Useful for beat reporter injury news minutes before the official report. Backends break and get re routed; treat what it reads as rumor until the official report or the platform confirms. |
| claude-mem, other memory plugins | skip | This kit already keeps memory as files in the repo (`rules/`, `league/`), which any agent on any machine can read. A second memory system means two sources of truth. |
| Graphify, knowledge graph layers | skip | The repo is a few dozen small markdown files; the cost driver is hourly polling and site work, not reading rules. A graph adds a build step and saves nothing here. |
| Obsidian | optional, as a viewer | Open the private repo as a vault to browse the trade log and rules with links. No effect on the agent or on tokens. |
| espn-api (Python) for basketball and baseball | optional | The same library covers ESPN basketball and has baseball in development; useful reference for slot and stat ids when the cheat sheets fall short. |
| yfpy, yahoo_fantasy_api (Yahoo) | optional | Yahoo leagues need OAuth; these Python libraries handle it for NFL, NBA, MLB and NHL. Reads only; writes still happen in the Yahoo app. The kit does not ship a Yahoo snapshot script yet; an agent with Python can build one from these in an hour. |
| MLB-StatsAPI (Python), statsapi.mlb.com | **baked in** (raw calls) | Public, no key: schedules, probable pitchers, posted lineups, rosters, transactions. See `mlb-data-cheatsheet.md`. |
| ESPN site feeds for NBA and MLB (scoreboard, injuries, summary) | **baked in** | No login; the daily slate and injury report for both sports. See `nba-data-cheatsheet.md` and `mlb-data-cheatsheet.md`. |
| nbainjuries (Python) | optional | Parses the official NBA injury report PDFs; only needed for the exact official wording. |
| Hashtag Basketball, Basketball Monster, FanGraphs | skip for automation | Excellent rankings and projections for the owner to read; no stable API for the agent. |
| FantasyPros, Fantasy Life, Fantasy Points, Establish the Run | skip for automation | Paid content with no stable API. Good reading for the owner; the agent cannot consume them reliably. |
