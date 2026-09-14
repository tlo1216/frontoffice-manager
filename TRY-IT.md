# Try it with no credentials

The full setup in `START-HERE.md` asks for league access, because a standing
manager has to read your league every hour and set your lineup. Wanting to see
what it does before agreeing to that is reasonable.

## Which path applies to you

**On Sleeper:** there is a real trial below. Sleeper's API allows reads with no
login at all, so an agent can pull a whole league and analyse it without a
single credential.

**On ESPN or Yahoo:** there is no trial, and it is worth saying so plainly
rather than letting you find out with an error. ESPN returns 401 for every
league endpoint without a session cookie, public leagues included, and Yahoo
requires an OAuth app before it will return anything. If you are on either,
look at **[docs/example-week.md](docs/example-week.md)** instead. It shows the
same output on invented teams, and costs you nothing.

---

## The Sleeper trial

### Finding your league id, about ten seconds

Open your league on `sleeper.com` in a browser. The id is the long number in
the address bar:

```
https://sleeper.com/leagues/123456789012345678/team
                            ^^^^^^^^^^^^^^^^^^
```

In the mobile app, tap the league, then the share icon, and copy the link. Any
league works, including one you are not in, as long as it is not hidden.

### Paste this into Claude Code or Codex

---

Clone https://github.com/tlo1216/frontoffice-manager into a temporary folder and
read `tools/sleeper-api-cheatsheet.md`. Do not write any file outside that
folder, do not push anything, and do not ask me for any credential. You will
not need one: Sleeper reads are public.

Using the Sleeper API only, for league id `<PASTE YOUR LEAGUE ID>`:

1. Pull every roster, this week's matchups, and the league's scoring settings.
2. For each team, work out the best lineup its own roster could have started
   this week under those scoring settings, compare it against what was actually
   started, and show me the points left on the bench. Rank every team by that.
3. Work out each team's all-play record, meaning its score against all the
   other teams rather than only the one it drew, and show me where that
   disagrees with the actual standings.
4. Price each position against the best player still on the wire, so I can see
   which positions are scarce in this league and which the wire refills for
   free.
5. Name the single worst start or sit decision anybody made this week, with the
   numbers behind it.

Show your working. If a number is not in the data, say so rather than
estimating it. Then stop. Do not set anything up and do not offer to.

---

## What this does not show you

A read only pass is a snapshot. It misses the part that matters over a season,
which is the standing behaviour: the hourly league watch, lineups fixed before
each kickoff window, every trade in the league graded as it happens, waiver
claims proposed with numbers attached, and a written record accumulating in
your own private repo.

For that, see **[START-HERE.md](START-HERE.md)**.
