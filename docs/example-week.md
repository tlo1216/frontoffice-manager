# What a week actually looks like

> **This is an illustration, not a real league.** The managers, team names and
> figures below are invented to show the shape and depth of the output. Real
> runs use your league's live numbers from the platform API. Nothing here is
> anybody's actual team.

This is roughly what lands in `reports/` after a week, without you asking for
any of it.

---

## Monday morning, after the last game

### Lineup efficiency

What each team scored against the most its own roster could have scored. Every
point in the last column was already owned and already rostered, so it is the
part that was decided rather than drafted.

| Rk | Team | Scored | Best possible | Left on bench | Efficiency |
|---|---|---|---|---|---|
| 1 | Backfield in Motion **(you)** | 138.44 | 144.10 | 5.66 | 96.1% |
| 2 | Gridiron Optional | 151.20 | 163.85 | 12.65 | 92.3% |
| 3 | Fourth and Long | 127.02 | 141.60 | 14.58 | 89.7% |
| 4 | Hail Mary Inc | 133.75 | 159.31 | 25.56 | 83.9% |

**Worst single call, per team.** Yours is listed whether it flatters you or not.

| Team | Benched | Started instead | Slot | Cost |
|---|---|---|---|---|
| Backfield in Motion | R. Calder | T. Nwosu | FLEX | 5.66 |
| Hail Mary Inc | J. Petrucci | D. Amara | TE | 18.40 |

### All-play record

An eight team schedule is small enough to lie about how good a team is. Your
record says who you happened to draw. Your all-play record says how you would
have done against everybody, every week.

| Team | Points | All-play | Record says |
|---|---|---|---|
| Gridiron Optional | 151.20 | 7-0 | 1-0 |
| Backfield in Motion **(you)** | 138.44 | 4-3 | 0-1 |
| Fourth and Long | 127.02 | 2-5 | 1-0 |

You lost, and you were still the second best team on the field. That gap is
schedule luck, and it is the difference between "sell everything" and "do
nothing."

---

## The wire, ranked by opportunity rather than by points

Fantasy points are a lagging indicator. A player whose usage is high and whose
scoring is low is usually underpriced, and the points column is the only column
most managers read.

### Buy: usage is there, the points are not yet

| Player | Pos | Team | Pts | Targets | Snap % | Usage vs points |
|---|---|---|---|---|---|---|
| M. Okafor | WR | free agent | 6.30 | 8 | 71% | +1.64 |
| C. Villanueva | TE | waivers | 5.50 | 6 | 64% | +1.08 |

### Sell high: the points ran ahead of the usage

| Player | Pos | Pts | TDs | Targets | Points vs usage |
|---|---|---|---|---|---|
| D. Amara | TE | 24.80 | 2 | 4 | 1.32 |

Two touchdowns on four targets is not repeatable. Best trade bait you have.

### Streaming, next week, on the sportsbook number

A defense wants to be favoured in a low scoring game. A kicker wants the
opposite.

| Defense of | Opponent | Favoured by | Game total | D/ST | Kicker |
|---|---|---|---|---|---|
| Riverton | Ashgrove | +8.5 | 40.5 | **strong** | no |
| Calder Bay | Northport | +2.0 | 49.5 | no | **strong** |

---

## Value over replacement, not raw projection

The wire sets the floor, and it sits at a different height for every position.
Comparing a 154 projection at running back to a 154 at receiver mixes up two
different currencies.

| Position | Best freely addable | Projection |
|---|---|---|
| QB | available starter | 305.80 |
| RB | available starter | 74.46 |
| WR | available starter | 52.97 |

In this example the quarterback wire is so deep that a backup quarterback
projected at 300 is worth **less than nothing** over what you could add for
free, while a receiver at 150 is worth almost a hundred points. That one table
changes which player you drop.

---

## What it will not do

- It never sends a trade. That is a hard limit of the kit, not a setting.
- It never enters your credentials anywhere.
- It never fudges a number to make a recommendation look better, including its
  own past recommendations.
- It logs its own mistakes in a file that never resets, and reports them to you
  even when they are unflattering.
