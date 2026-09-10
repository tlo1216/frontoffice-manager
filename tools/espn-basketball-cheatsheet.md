# ESPN fantasy basketball (fba): what changes from football

Same API family, different rhythm. Base: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{SEASON}/segments/0/leagues/{LEAGUE_ID}`, same views (`mTeam`, `mRoster`, `mSettings`, `mMatchup`, `mMatchupScore`, `mBoxscore`, `mPendingTransactions`, `mTransactions2`, `kona_player_info` with `X-Fantasy-Filter`), same `credentials: 'include'` rule. Season is the year the season ends (the 2026-27 season is `2027`).

## The rhythm is daily

- `scoringPeriodId` is a day of the season, not a week. `mMatchup` groups days into `matchupPeriodId` weeks. Today's period comes from `mSettings` (`status.currentMatchupPeriod`, `scoringPeriodId`).
- Lineups lock per player at that player's tip off, every day. The agent's lineup pass runs once each morning for the day's games and again about an hour before the first tip, not once a week.
- Players on teams that do not play today score nothing; the daily job's first question is who has a game. Get today's slate from `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` (no login) and compare each player's `proTeamId` against it.
- Most leagues cap games per position slot or per week (`mSettings.scheduleSettings` and `rosterSettings.lineupSlotStatLimits`); track how many the roster has used so a late week streamer does not go to waste.

## Slots and positions

Lineup slot ids: 0 PG, 1 SG, 2 SF, 3 PF, 4 C, 5 G, 6 F, 7 SG/SF, 8 G/F, 9 PF/C, 10 F/C, 11 UTIL, 12 BE, 13 IR, 14 IR+. Position eligibility per player lives in `eligibleSlots` on the player object; use it instead of `defaultPositionId` because most players qualify at two or three slots. The optimal lineup is a matching problem, not a sort: fill the most restrictive slots first (C, PG, SG, SF, PF), then G, F, then UTIL.

## Scoring

Two families. Points leagues work exactly like football (maximize `appliedTotal`). Category leagues (rotisserie or head to head categories) do not have one number: the agent reads `scoringSettings.scoringItems` for the categories (points, rebounds, assists, steals, blocks, threes, FG percent, FT percent, turnovers), computes each team's weekly category totals from `mBoxscore`, and optimizes for categories the team can win this week. Percentages are ratio stats: weight by attempts, never average the percentages. Turnovers count against you.

## Injuries and IR

Injury status strings are the same (`ACTIVE`, `DAY_TO_DAY`, `OUT`, `INJURY_RESERVE`). IR slots are usually one or two; ESPN allows any player marked `OUT` into IR in most settings. The daily job moves eligible players in and pulls activated players out, under the IR authorization. The official NBA injury report is published by 5 PM local time the day before a game and updated through game day; ESPN's `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries` mirrors it without login.

## Streaming

Daily leagues reward streaming: adding a player for a two or three game stretch and dropping him after. `mSettings.acquisitionSettings.acquisitionLimit` is the season or weekly cap on adds; the agent counts what is left before proposing a stream and never spends the last adds of a week on a one game player.

## Projections

Season projections use `statSourceId 1, scoringPeriodId 0` like football. Per game projections are `statSplitTypeId 1` averages on the season stat line (`stats[].averageStats`) rather than a per day projection; ESPN does publish a daily projection line for players with a game today. The kit's snapshot uses season totals for the roster diff and per game averages for lineup calls.
