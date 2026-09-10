# ESPN fantasy baseball (flb): what changes from football

Same API family. Base: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/{SEASON}/segments/0/leagues/{LEAGUE_ID}`, same views and the same `credentials: 'include'` rule. Season is the calendar year.

## Daily, and two kinds of players

- `scoringPeriodId` is a day. Lineups lock per player at that player's first pitch. The agent's lineup pass runs each morning and again before the first game of the day (day games start around noon Eastern; check the slate).
- Hitters and pitchers are different problems. Hitters play most days; pitchers start every fifth day and relievers are unpredictable. The daily job reads probable pitchers from MLB's public API (`tools/mlb-data-cheatsheet.md`) and only starts pitchers who are scheduled.
- Innings pitched and games played caps are common (`rosterSettings.lineupSlotStatLimits`, `scoringSettings`). Track usage so a two start week does not push the roster over the cap.

## Slots and positions

Lineup slot ids: 0 C, 1 1B, 2 2B, 3 3B, 4 SS, 5 OF, 6 2B/SS, 7 1B/3B, 8 LF, 9 CF, 10 RF, 11 DH, 12 UTIL, 13 P, 14 SP, 15 RP, 16 BE, 17 IL, 18 INJ (varies by league), 19 IF. Use `eligibleSlots` per player; multi position eligibility is the norm. Fill the most restrictive slots first (C, SS, 2B, 3B, 1B), then OF, then UTIL; pitchers fill SP then RP then P.

## Scoring

Points leagues maximize `appliedTotal`. Category leagues (rotisserie is common in baseball) track hitting categories (R, HR, RBI, SB, AVG or OBP) and pitching categories (W, SV, K, ERA, WHIP). ERA and WHIP are ratio stats weighted by innings; AVG by at bats. In rotisserie the season standings are the sum of category ranks, so the agent optimizes the categories where a rank can still be gained, not the raw total.

## Injuries and the IL

Baseball has formal injured list stints (10 day, 15 day, 60 day). ESPN marks IL players `INJURY_RESERVE`; only those can go into the IL slot. MLB's transactions feed (`tools/mlb-data-cheatsheet.md`) publishes every IL move the moment it happens, hours before the platform tag changes. The daily job checks it and moves players under the IR authorization.

## Streaming and two start weeks

Streaming starting pitchers is the main daily edge: add a pitcher for a favorable start, drop after. The Tuesday pass identifies two start pitchers for the coming week from the probable pitcher schedule and weighs them above one start pitchers of similar quality. Acquisition limits (`acquisitionSettings.acquisitionLimit`) bound this; count what is left before proposing.

## Projections

Season projections `statSourceId 1, scoringPeriodId 0` as in football. Rest of season projections shift a lot after injuries and role changes, so the roster diff threshold in `tools/diff-snapshot.mjs` should be raised for baseball (30 points instead of 15) to avoid noise.
