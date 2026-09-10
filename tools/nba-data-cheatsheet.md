# NBA data without a login

Verified reachable 2026-09-10 unless noted.

| Need | Source | Notes |
|---|---|---|
| Today's slate and scores | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` | status, tip times, odds; the daily lineup pass starts here |
| Injury report | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries` | every team, status and detail; mirrors the official report, which teams file by 5 PM local the day before a game |
| Box score per game | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={id}` | player stat lines for postgame writeups and for verifying any number in a grade |
| Season schedule | ESPN scoreboard by date is the reliable path; the NBA CDN schedule file returned 403 to plain requests | fetch a week at a time on Tuesday for games per team |
| Official injury report archive | `nbainjuries` Python package (https://github.com/mxufc29/nbainjuries) parses the league's timestamped PDFs | optional; useful only if you want the exact official wording |
| Sleeper NBA | `https://api.sleeper.app/v1/state/nba`, `/players/nba`, `/players/nba/trending/add`, and the same league, roster and transaction endpoints as football with the league id | Sleeper runs NBA leagues; reads need no login, writes go through sleeper.com in the pane |
| Advanced stats | `nba_api` Python package against stats.nba.com | rate limited and fussy; not needed for lineups |

Games per week per team is the number that decides streaming and category play. Compute it on Tuesday from the scoreboard for each of the next seven dates and store it in `league/` for the week.

Rankings sites (Hashtag Basketball, Basketball Monster) publish useful category value rankings but have no stable API; treat them as reading for the owner, not inputs for the agent.
