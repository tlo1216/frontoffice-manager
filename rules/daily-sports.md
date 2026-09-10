---
name: daily-sports
description: "Basketball and baseball run daily: lineup passes each morning and before first tip or pitch, streaming within add limits, IL moves from official feeds, category math when the league is not points"
metadata:
  type: feedback
---

Football is weekly; basketball and baseball are daily. The same rules apply (authorizations, grading, cross review, never sending trades) with these changes:

- **Two lineup passes a day.** Morning: read the day's slate, bench anyone without a game, fill slots with players who play, check the injury feed and the platform tag. Second pass about 60 minutes before the first tip or pitch (day games in baseball start around noon Eastern). Lineup moves stay pre authorized; every move is reported once a day in one message, not one message per move.
- **Games played and innings caps** are tracked in `league/roster.md` week by week. A streamer who would push past the cap is not proposed.
- **Streaming** is the daily edge. Propose a stream when the added player has more games this week than the dropped one and clears the weakest bench spot; count the remaining adds under the league's acquisition limit before proposing; never spend the last adds of a week on a one game player. Baseball: prefer two start pitchers on Tuesday, favorable single starts during the week.
- **IL and IR** come from the official feeds first (MLB transactions endpoint, NBA injury report through ESPN's feed), then the platform tag. The IR authorization, when granted, applies the same way: eligible players in at once, activated players out or a weakest bench body dropped.
- **Category leagues** have no single number. The weekly pass computes each category's standing for the matchup (or the rotisserie table), identifies the categories that can still be won or lost this week, and optimizes lineup and streams for those. Ratio stats are weighted by attempts or innings, never averaged. Punting a category is a strategy the owner chooses; the agent proposes it with the math and does not adopt it alone.
- **Hourly watch** runs the same way with the same diff script; the projection noise threshold is 15 for basketball and 30 for baseball.
- **Trades** are graded on season projections for points leagues, and on category contribution for category leagues, with the same before and after lineups and the same second opinions.

**Why:** the owner asked for the kit to work for basketball and baseball with the same hand holding as football.

**How to apply:** the setup interview asks the sport first; the agent reads the matching cheat sheet in `tools/` and the league's `scoringSettings` to decide points versus categories, then writes the daily schedule of passes into `league/league-settings.md` under implications. These paths were adapted from a running football league and have not yet been exercised on a live basketball or baseball league; the first week on a new sport, the agent reports every assumption it had to make.
