# The free tier: analysis without a subscription or a computer

Most of this kit is an agent that manages your team, and that needs a paid AI
plan. But the **analysis** underneath it does not. Those tools are plain
arithmetic over free data: no model is called, nothing is sent to an AI
provider, and no subscription is involved.

So there are two halves, and you can have the second one for nothing.

| | Free tier | Full kit |
|---|---|---|
| AI subscription | **none** | Claude Pro or Max, or a paid ChatGPT plan |
| A computer | **none**, runs in GitHub Actions | one that stays on, or a free cloud VM |
| Reads your league | yes | yes |
| Analysis and reports | **yes, all of it** | yes |
| Sets your lineup | no | yes |
| Waiver claims, roster moves | no | yes, at the autonomy level you pick |
| Answers questions, explains itself | no | yes |
| Sends trades | never | never, it is a hard limit of the kit |

The free tier tells you exactly what to do. It just will not do it for you.

---

## What you actually get

Committed to `reports/` in your own repo, every Tuesday:

**Lineup efficiency.** What you scored against the most your own roster could
have scored that week, for every team in the league. Everything in that gap was
already on your bench, so it is the part you decided rather than drafted.

**All-play record.** Your score against all the other teams rather than only the
one you drew. This is the difference between "I am unlucky" and "I am bad", and
your standings cannot tell you which.

**Value over replacement, by position.** What each player is worth over the best
one still on the wire at his position. This routinely inverts what raw
projections say. In one real week a 300-projection backup quarterback came out
worth *less than nothing*, because a comparable starter was freely available.

**Buy and sell boards ranked by usage, not points.** Targets, carries, snap
share and weighted opportunity, because usage settles week to week long before
scoring does. Tested across five seasons before being trusted: target share beat
last week's points as a predictor in five seasons out of five.

**A streaming board on the sportsbook line.** Defenses want to be favoured in a
low-scoring game; kickers want the opposite.

**Win probability for your matchup**, simulated ten thousand times with
bootstrapped player distributions and correlated outcomes for players in the
same NFL game, rather than just comparing projected totals.

---

## Setting it up, about five minutes

1. **Fork or use this as a template, and make your copy private.** The reports
   contain your league's rosters.
2. **Add four repository secrets** under Settings, Secrets and variables,
   Actions:

   | Secret | Where to find it |
   |---|---|
   | `ESPN_LEAGUE_ID` | the number in your ESPN team page URL |
   | `ESPN_TEAM_ID` | your team's number in that same URL |
   | `ESPN_S2` | browser cookie |
   | `ESPN_SWID` | browser cookie, including its curly braces |

   For the cookies: in a desktop browser logged in to ESPN, press F12, open
   Application, then Cookies, then `https://fantasy.espn.com`.

   **These cookies are full access to your ESPN account.** Put them in
   repository secrets, where GitHub encrypts them, and nowhere else. Never in a
   file you commit, never in an issue, never pasted into a chat.

3. **Actions tab, enable workflows**, then run **Weekly analysis** manually once
   to check it works. After that it runs itself every Tuesday morning.

That is the whole setup. No machine, no install, no subscription, and GitHub
Actions is free for this.

---

## Honest limitations

**ESPN only, for now.** The free tier reads through the ESPN MCP server. Sleeper
needs no credentials at all and would be a natural addition; Yahoo needs an
OAuth app. Neither is wired into this workflow yet.

**It reads and never writes.** `WRITES_ENABLED=false` is set in the workflow, so
this is enforced rather than promised.

**It cannot answer questions.** It produces the same reports every week. If you
want to ask "should I start X or Y this week", that is the agent, and the agent
needs a paid plan.

**Your cookies expire.** ESPN logs you out periodically. When the workflow
starts failing with a 401, refresh the two cookie secrets.

---

## If you want the full thing later

See [START-HERE.md](START-HERE.md). The minimum is **Claude Pro**, confirmed in
Anthropic's own documentation: Claude Code works with a Claude Pro or Max
subscription, and the free Claude.ai plan does not include it at all. Codex
requires a paid ChatGPT plan, though OpenAI's documentation does not state which
tier, so check before you subscribe on that basis.

If you do not have a computer either, [NO-COMPUTER.md](NO-COMPUTER.md) covers
running the full kit with no hardware.

Nothing you set up here is wasted: the free tier and the full kit are the same
repo, the same tools and the same reports. Adding an agent later adds the
management on top.
