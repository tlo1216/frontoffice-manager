---
name: draft
description: "Draft helper and autodraft: a value over replacement board built from the league's own settings, a live assistant that watches picks, and autodraft through the platform's pre ranked list"
metadata:
  type: feedback
---

Before the draft the agent builds a board from the league's own roster slots, scoring and projections (`tools/draft-board.mjs`): value over replacement per position with replacement level set by how many starters the league actually uses, tiers by projection gaps, ADP for availability, kickers and defenses pushed behind every skill player. During the draft it watches the picks through the API (`tools/draft-live.js` in the pane) and names the best available for the owner's remaining needs, flagging who will be gone before the owner's following pick. If the owner cannot attend, autodraft is done through the platform's own pre ranked list, which the board produces in paste order; ESPN, Sleeper and Yahoo all draft from that list when a manager is absent.

**Why:** the owner asked for a draft helper and an autodraft feature with the same hand holding as the season.

**How to apply:**
- Two days before the draft: run the board, walk the owner through the top three tiers at each position, ask about any player he will not draft (injury, hate, keeper rules), and write the final pre rank list into the platform. On ESPN the list is set under the league's Draft, Edit Rankings; the agent can enter it through the pane click by click or the owner pastes it. Sleeper and Yahoo have the same feature under draft settings.
- Draft strategy defaults, changed only if the owner says so: fill starters before bench, running back and receiver first in full PPR, one quarterback unless the league starts two, tight end when the tier drop arrives, kicker and defense in the last two rounds, no handcuffs before the starters are done, no player marked OUT or on injured reserve unless the owner names him.
- Live mode: the owner says "draft mode" and the agent runs the live snippet every pick, replying within seconds with one recommendation and two alternatives, each with value, tier and the gone by next pick flag. The owner clicks. The agent clicks in the pane only with an explicit "pick for me" authorization written into `league/standing-authorizations.md`, and then only the top recommendation.
- After the draft: write `league/draft-{season}.md` with every pick, grade each team's draft by total value over replacement of its best lineup, and start the season files. The board's replacement levels are reused as the season's bench thresholds.
- Sleeper: the draft is readable at `/draft/{draft_id}` and `/draft/{draft_id}/picks` with no login; the live snippet's logic applies with those endpoints. Yahoo: draft results are in `/league/{league_key}/draftresults`; live picks need the app.
