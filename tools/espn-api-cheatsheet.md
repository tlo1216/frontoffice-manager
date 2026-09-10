# ESPN fantasy API cheat sheet (v3, as used from the logged in browser pane)

Base: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{LEAGUE_ID}`

Always fetch with `credentials: 'include'` from a page on `fantasy.espn.com`. Without it the API host does not receive the cookies and returns 401 even though you are logged in.

## Views (add `?view=` params, several allowed)

| View | What it returns |
|---|---|
| `mTeam` | teams: id, name, record, waiverRank, owners |
| `mRoster` | every team's roster entries: player, lineupSlotId, injury status, stats |
| `mSettings` | scoring, roster slots, acquisition (waiver) settings, schedule, trade settings, draft settings |
| `mMatchup` | schedule: matchupPeriodId, home and away team ids and totals |
| `mMatchupScore` | live and final points per matchup |
| `mBoxscore` (with `scoringPeriodId=N`) | per player actual stats for that week |
| `mPendingTransactions` | pending waiver claims and trade proposals |
| `mTransactions2` | executed and recent transactions with items (ADD, DROP, TRADE, LINEUP) |
| `kona_player_info` | player pool; needs an `X-Fantasy-Filter` header |

Free agents, top 60 by ownership:

```
headers: { 'X-Fantasy-Filter': JSON.stringify({ players: {
  filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
  limit: 60, sortPercOwned: { sortPriority: 1, sortAsc: false } } }) }
```

Add `filterSlotIds: { value: [2] }` for a position (see slot ids). `filterIds: { value: [playerId, ...] }` fetches specific players.

## Stats

Each player carries `stats[]`. Pick by:
- `statSourceId`: 1 = projection, 0 = actual
- `scoringPeriodId`: 0 = season total, N = week N
- `seasonId`: filter to the current season; the array contains last season too and the first match is often the wrong year
- `appliedTotal` is the fantasy points under the league's scoring

## Ids

Lineup slots: 0 QB, 2 RB, 4 WR, 6 TE, 23 FLEX, 16 D/ST, 17 K, 20 Bench, 21 IR.
Positions (`defaultPositionId`): 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST.
Pro teams: 1 ATL, 2 BUF, 3 CHI, 4 CIN, 5 CLE, 6 DAL, 7 DEN, 8 DET, 9 GB, 10 TEN, 11 IND, 12 KC, 13 LV, 14 LAR, 15 MIA, 16 MIN, 17 NE, 18 NO, 19 NYG, 20 NYJ, 21 PHI, 22 ARI, 23 PIT, 24 LAC, 25 SF, 26 SEA, 27 TB, 28 WSH, 29 CAR, 30 JAX, 33 BAL, 34 HOU.
Injury status strings: ACTIVE, QUESTIONABLE, DOUBTFUL, OUT, INJURY_RESERVE, DAY_TO_DAY.

## Optimal lineup

Fill QB 1, RB 2, WR 3, TE 1, D/ST 1, K 1 with the highest projections at each position, then the two flex spots from the best remaining RB, WR, TE. Adjust counts to your league's settings.

## Writes

Reads are the API. Writes go through the page like a user (Players, Add, Claim, Drop, Continue, Confirm; the roster page's Move and Here controls for lineups). Right after clicking Confirm, read the network requests for `lm-api-writes.fantasy.espn.com` and save the request; the page redirects and the buffer is gone within seconds. A fetch interceptor placed before the click that stores the request in `sessionStorage` is the reliable way (see `rules/espn-write-capture-technique.md`).

## NFL scores and box scores (no login)

`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` for the slate, odds and status; `.../summary?event={id}` for player stat lines. Use these for postgame writeups and for verifying any number in a joke or a grade.
