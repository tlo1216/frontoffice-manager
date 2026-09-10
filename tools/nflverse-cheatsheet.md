# nflverse data: schedules, injuries, depth charts, no login

The nflverse project publishes NFL data as plain CSV files on GitHub releases, refreshed automatically during the season. No key, no scraping, and the same data the R and Python nflverse packages read. The agent fetches them with curl or fetch and reads what it needs.

| File | URL | Use |
|---|---|---|
| Schedule and results, all seasons | `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv` | kickoff windows for lock reminders (`gameday`, `gametime` in Eastern, `weekday`, `away_team`, `home_team`, `week`), plus spreads and totals (`spread_line`, `total_line`) for pregame writeups |
| Official injury reports | `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv` | practice participation and game status by player, team and week, from the league's official reports |
| Depth charts | `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{season}.csv` | who is listed first at each position; the fastest way to see a backup become a starter |
| Weekly rosters | `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.csv` | status (ACT, RES, PUP), team changes, jersey numbers, ids across ESPN, Sleeper, PFR |

## How the agent uses them

- **Tuesday**: read `games.csv` for the coming week, list every distinct kickoff that touches a rostered player, and set one reminder per window 90 minutes ahead. Times are Eastern; convert to the owner's zone.
- **Before each reminder**: cross check the platform's injury tag against `injuries_{season}.csv` (the official report) and `depth_charts_{season}.csv` (did the starter lose the job). The platform's tag lags the official report by hours sometimes.
- **Hourly watch**: a depth chart change at RB, WR or TE where the new starter is on the wire is exactly the "player who inherits a starting job" case the free agent authorization covers.
- **Ids**: `roster_weekly` carries `espn_id` and `sleeper_id` columns, so names never have to be matched by string.

## Reading a CSV without libraries

In node: `const rows = (await (await fetch(url)).text()).split('\n').map(l => l.split(','));` is enough for these files (no quoted commas in the columns the agent uses). Filter by `week` and by the teams on the roster. Cache the file for the day in `tools/` (gitignored).

Sources: nflverse-data releases (https://github.com/nflverse/nflverse-data/releases), nfl_data_py (https://github.com/nflverse/nfl_data_py), nflreadpy (https://github.com/nflverse/nflreadpy).
