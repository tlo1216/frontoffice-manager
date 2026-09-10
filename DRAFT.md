# Draft day

The agent can run your draft three ways. Pick one, or all three in order.

## 1. The board (two days before)

Say "build my draft board". The agent reads your league's roster slots, scoring and projections and produces a ranked board: every player's value over the last starter at his position, tiers where the talent drops, and ADP so you know who lasts. It walks you through the top tiers, asks who you refuse to draft, and gives you a strategy line for your draft slot.

## 2. Autodraft, in case you cannot be there

The board doubles as a pre ranked list. Every platform drafts from your pre ranked list when it is your pick and you are not there. Say "set my rankings" and the agent either enters the list into your league's draft rankings through its browser pane (ESPN: League, Draft, Edit Rankings) or hands you the list to paste. The order already follows the strategy: starters before depth, backs and receivers first in PPR, one quarterback, kicker and defense last, nobody who is hurt.

## 3. Live assistant, if you are there

Open the draft room and say "draft mode". Each time it is near your pick the agent reads the picks made so far through the league API, removes them from the board, and answers within seconds: one recommendation, two alternatives, each with value and tier, and a flag on anyone likely gone before your following pick. You click.

If you want it to click for you, write that into `league/standing-authorizations.md` first; the agent will then take only its top recommendation and tell you each time.

## After

The agent writes every pick into `league/draft-{season}.md`, grades each team's draft, and starts the season from there. Those grades are the "after the draft" numbers you see all season.

## Platforms

ESPN: everything above works today through the API and the pane. Sleeper: the board and the live reads work with no login (draft endpoints are public); the pre ranked list is entered in the Sleeper app. Yahoo: board and pre ranked list, live picks are followed in the Yahoo app. The draft tools were written against ESPN's league API and have not yet been run inside a live draft; the agent tells you what it had to assume.
