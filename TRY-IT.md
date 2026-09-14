# Try it in two minutes, with no credentials

The full setup in `START-HERE.md` asks for league access, because a standing
manager has to read your league every hour and set your lineup. That is a fair
thing to want to see before you agree to.

So here is a path that asks for nothing. **No cookies, no API keys, no private
repo, no write access.** It reads a public league, prints an analysis, and
stops. If the output is not worth your time, you have lost two minutes and
handed over nothing.

## What you need

A coding agent (Claude Code or Codex) open in a folder, and either a Sleeper
league id or somebody else's public one. Sleeper reads need no login at all.

## Paste this

---

Clone https://github.com/tlo1216/frontoffice-manager into a temporary folder and
read `tools/sleeper-api-cheatsheet.md`. Do not write any file outside that
folder and do not ask me for any credential.

Using the Sleeper public API only, for league id `<PASTE A SLEEPER LEAGUE ID>`:

1. Pull every roster in the league and this week's matchups.
2. For each team, work out the best lineup its own roster could have started
   this week, compare it to what was actually started, and show me the points
   left on the bench. Rank all the teams by that.
3. Work out each team's all-play record, meaning its score against every other
   team rather than just the one it drew, and show me where that disagrees with
   the actual standings.
4. Price every position against the best player freely available on the wire,
   so I can see which positions are scarce in this league and which are not.
5. Tell me the single worst start or sit decision anybody made this week, with
   the numbers.

Show your working. If a number is not in the data, say so rather than
estimating it. Then stop; do not set anything up and do not offer to.

---

## If you do not have a Sleeper league

Use a public one. Sleeper league ids are visible in the URL of any public
league page. Any reasonably active league works for seeing the output.

## What this does not show you

The read-only pass above is a snapshot. It does not show the part that actually
matters over a season, which is the standing behaviour: the hourly league
watch, lineups fixed before each kickoff window, every trade in the league
graded as it happens, waiver claims proposed with the numbers, and a written
record accumulating in your own private repo.

For that, see `START-HERE.md`. For what the weekly output looks like without
running anything, see [docs/example-week.md](docs/example-week.md).
