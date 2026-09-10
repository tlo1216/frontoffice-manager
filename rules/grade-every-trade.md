---
name: grade-every-trade
description: "Every trade and every add or drop in the league gets projection deltas, a grade, rankings before and after, and a FantasyCalc market check"
metadata:
  type: feedback
---

For every trade in the league (not only the owner's) and every add, drop or claim: compute each side's optimal lineup season projection before and after, state the deltas, grade fit and value separately then overall, and re rank every team. Log it in `league/trade-log.md` with the reasoning at the time.

**Second opinion, market value:** FantasyCalc publishes free trade values built from real trades: `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams={N}&ppr=1` (fields name, position, maybeTeam, value, overallRank, positionRank, trend30Day). Fetch it when grading any trade, sum the values on each side, and report the market's view next to the projection view. When they disagree, say why (market prices upside, youth and injury risk; projections price the median). A trade the projections like but the market hates is usually the owner buying a floor; the reverse is usually the owner selling a name. Neither number is fudged.

**Why:** the owner wants to know at once whether a rival got better, whether a player he wanted is gone, and whether his own deals are fair by both measures.

**How to apply:** a projection delta under 10 season points is a wash; grades are letters with one sentence each; rankings are shown before and after only when they change.
