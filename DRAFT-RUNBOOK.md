# Draft day runbook

Every line here was learned in a real draft that went wrong. The board was built
during the draft rather than before it, an expired element reference queued four
wrong players, and a kicker nearly consumed a ninth round pick. None of it threw
an error; all of it looked fine at the time.

## Before the draft, not during it

1. **Build the values the day before.**
   - Snake: `node tools/draft-prep.mjs --league <id> --teams <n> --write`
   - Auction: `node tools/auction-prep.mjs --league <id> --teams <n> --budget <cap> --roster <n> --write`
2. **Read the league's own settings, never assume them.** Scoring (full PPR,
   half PPR, standard) and starting slots change every value on the board. Two leagues run by
   one manager differed by 140 points of running back replacement purely because
   one started three receivers and two flex spots and the other started two and
   one.
3. **Confirm the pool is a real draft pool.** Both tools now abort if the best
   available player projects like a bench back, because without a league id the
   MCP answers from the league in `.env`, which is already drafted. That bug
   produced a beautifully formatted board with Braelon Allen as the best player
   in football.
4. **Put the list into the platform's pre-rank screen**, so the floor is a good
   autodraft rather than the platform's generic ranking.

## The clock

**Snake:** ESPN gives about 30 seconds a pick with no reset. That is not enough
time to read a board, decide, and click reliably through automation. Assume
every pick will be made by the queue, not by a live decision.

**Auction:** each nomination runs a short clock that RESETS on every new bid, so
the pressure is different: there is time to think, but bidding wars move fast
and the failure mode is emotional rather than temporal. The max bid column
exists to be obeyed.

## Automating a live draft room, what actually works

The board re-renders every time anyone in the league picks. This has three
consequences, all learned the hard way:

- **Element references expire in under two seconds.** A `find` result used in
  the next tool call frequently points at a different player. Four wrong players
  were queued this way.
- **Pixel coordinates are worse**, because rows shift up as players are taken.
- **The reliable pattern is: filter to one position, then `find` and click in the
  SAME batch.** A position-filtered list is short and changes rarely, so refs
  survive long enough. Every position-filtered batch succeeded; every unfiltered one failed.

## Turn autopick on early

This is the single most useful thing learned. With autopick on and even one good
player queued, the problem changes from "click accurately inside 30 seconds" to
"keep a list populated", which automation can actually do. A pick was made
correctly this way while the board was being fought.

Consequences to respect:

- **Queue order is the pick order.** A kicker reaching the top of the queue in
  round 9 is a wasted round, and this nearly happened.
- **New additions go to the END of the queue.** To promote a player, remove the
  ones above him rather than hoping.
- **Verify the queue after every change.** Zoom the queue panel and read it. Do
  not trust that the clicks landed.

## Order the queue by hole, not by value

Value over replacement decides who is worth drafting. Which of them to take
next is decided by what the roster is missing. In one draft the queue was still full of receivers in round eight while tight
end and quarterback sat empty, because the ordering ignored the roster. Check the roster panel every few rounds and
re-order.

## Positions to leave until the end

Kicker and defense, always. In a ten team league the tenth best kicker is worth
within a couple of points a week of the first, so every round spent on one is a
round not spent on a position with a real drop-off. Queue them last, and if one
drifts to the top of the queue, remove it.

Quarterback usually too, but check: in one ten team league the eleventh best
quarterback projected 288 against the best at 364, so a quarterback was worth
roughly one good receiver and no more.

## After the draft

`node tools/draft-report.mjs` style pass: rank every team by starting lineup
value over replacement, list positional strength and holes for all of them, and
name the best players left unrostered. The holes table is the trade map for the
rest of the season.
