# MLB data without a login

MLB's own stats API is public for personal use. Base `https://statsapi.mlb.com/api/v1`. Verified reachable 2026-09-10.

| Need | Call | Notes |
|---|---|---|
| Today's games, probable pitchers, lineups | `/schedule?sportId=1&date=YYYY-MM-DD&hydrate=probablePitcher,lineups` | the daily pass starts here; `probablePitcher` per side, `lineups` once posted (usually two to four hours before first pitch) |
| Week of games per team | `/schedule?sportId=1&startDate=...&endDate=...` | count games and probable starts per team for two start pitchers and streaming |
| Active roster | `/teams/{teamId}/roster?rosterType=active` | 26 man roster; `40Man` for the full list |
| IL moves and call ups | `/transactions?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | every transaction with type and description; the earliest signal of an IL stint or a promotion |
| Player stats | `/people/{id}/stats?stats=season&group=hitting` (or `pitching`) | season line; `stats=gameLog` for recent form |
| Injuries, all teams | `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries` | ESPN's view, no login, convenient for a single pull |
| Box score | `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event={id}` or `statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live` | for postgame writeups and number checks |

Ids: MLB player ids differ from ESPN fantasy ids. Match by name plus team, or through the `people` search endpoint `/people/search?names=Last,First`. Keep a small map in `league/` once built.

Weather and park factors matter for pitchers but are not in these feeds; the agent notes a start in Coors Field or a rain threat only when the owner asks.

Python: `MLB-StatsAPI` (https://github.com/toddrob99/MLB-StatsAPI) wraps all of this if your agent runs Python; the raw calls above need nothing.
