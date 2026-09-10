---
name: weekly-trade-scan
description: "Once a week the agent searches the whole league for trades, scores both sides, and hands the owner ranked suggestions; it never sends them"
metadata:
  type: feedback
---

At least once a week, on the day after the scoring period turns over, run a full trade scan and give the owner ranked suggestions with scores. Do not wait to be asked.

**How to run it:** build a rosters JSON from the platform (every team, each player with name, position and rest of season projection; mark the owner's starters and anyone he refuses to move as untouchable), then `node tools/trade-finder.mjs rosters.json`. It scores every package of the owner's spare players against every player on every other roster by the change to each side's optimal starting lineup, and sorts the results into three buckets: both sides win, fair, and lopsided.

**How to present it:** lead with the bucket that matters. A trade where both sides gain is rare and goes first because it sells itself. Fair trades come next, with a sentence on why the other manager would say yes, usually that the target does not start for him or that he is thin where the owner is deep. Lopsided ones are shown with the warning attached, and never proposed to an ally. For the top two or three, add the market value check (FantasyCalc, `rules/grade-every-trade.md`) so the owner knows how his partner's own research will read it, and draft the short message he would send.

**What the scores mean, and say this plainly:** the number is the change to each side's best legal starting lineup for the rest of the season, not a player value chart. A player who never cracks the lineup is worth zero to that team no matter his reputation. That is why a first round back can be worth less to a manager with four of them than a receiver he would start every week, and it is the whole argument behind most good trades.

**When there is nothing:** say so in one line. "Every upgrade available costs the other manager about what it gains you, so the market is closed at honest prices this week" is a complete and useful answer. Do not manufacture a suggestion to fill the slot.

**Why:** the owner should not have to think of the idea first. Most managers never trade because they never see the shape of a deal that works, and the search is cheap for an agent and tedious for a person.

**How to apply:** suggestions only. The agent never sends, accepts or rejects a trade in this kit, and no authorization changes that (`CLAUDE.md`). Reputation is part of the score: a deal that guts a friend costs something real even when the points say take it. Related: [[grade-every-trade]], [[numbers-are-never-fudged]].
