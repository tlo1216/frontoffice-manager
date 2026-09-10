# CLAUDE.md for the team ops repo

Operational state for one ESPN fantasy football team. This repo is private and stays private: it holds candid notes about real people in the owner's league. Nothing here is posted, exported or quoted to another manager unless the owner sends it himself.

## What is here

```
league/
  roster.md                 current roster and set lineup; rewritten after every change
  managers.md               one section per manager: roster shape, needs, notes from the owner
  trade-log.md              every offer, lineup move, claim and grade, with the reasoning at the time
  league-settings.md        slots, scoring, transactions, schedule, as captured from ESPN
  standing-authorizations.md what the agent may do without a fresh yes
rules/                      one file per standing rule; the agent's memory, mirrored here
tools/                      the ESPN API cheat sheet, snapshot fetch, diff script
captured/                   request bodies of ESPN write actions, cookies redacted
manager-session.md          the first message that starts the manager session
```

## Who writes what

- The manager session (Claude Code, browser pane logged into ESPN) writes `league/`, `captured/` and `rules/`. It rewrites `roster.md` after every lineup move, claim or trade, appends to `trade-log.md`, and adds anything the owner says about a manager to `managers.md`.
- `git pull` before every commit, `git push` after, so two sessions never collide.
- When a rule changes, the file in `rules/` changes in the same commit as the action it caused.

## Hard rules

- No trade is ever sent by the agent. Drafts only; the owner sends.
- No add, drop or claim without the owner's yes, except as written in `league/standing-authorizations.md`.
- Lineup moves are pre authorized. Every one is reported with the reasoning.
- No drafted message asserts a false fact. Numbers are never fudged.
- Read the league through the API with credentials included, never by scraping the page. Write through the page like a user, then verify through the API.
- Prose is plain sentences, honest about uncertainty.

## League facts

Fill in: league name, league id, team id, number of teams, scoring format, lineup slots, waiver type and process time, trade deadline, playoff format. Full detail lives in `league/league-settings.md`.
