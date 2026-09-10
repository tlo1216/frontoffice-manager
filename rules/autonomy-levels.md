---
name: autonomy-levels
description: "The owner picks an autonomy level 0 to 4 and a model tier at setup; the level decides what the agent may do without asking, and trades are excluded at every level"
metadata:
  type: feedback
---

The owner chooses how much the agent does for him (level 0 to 4) and which models it uses (best, balanced, economy). Both are asked during setup, written into `league/standing-authorizations.md` with the date, and changeable any time he says so. `AUTONOMY.md` is the version he reads.

**What each level authorizes:**

- **0, ask me anything.** Reads and analyzes on request. No crons, no writes, no scheduled anything. Do not set reminders unless asked.
- **1, reminders.** Hourly league watch plus a message about 90 minutes before each kickoff window that touches his roster. Recommend, never execute.
- **2, lineup manager.** Level 1 plus lineup moves executed and reported with the reasoning, and the weekly trade scan. Adds, drops and claims are proposed and wait for a yes.
- **3, full manager.** Level 2 plus the timer rule (`timer-authorization.md`), automatic injured list management, and one named bench spot usable for a free agent who makes a difference without asking.
- **4, autopilot.** Runs the roster: waiver claims, adds, drops, injured list, lineups and streaming without asking, each reported afterwards with the numbers. Still stops for anything irreversible that is not a roster move, and still asks before spending a scarce resource in a way he cannot undo, for example the last waiver priority of the season or the whole remaining FAAB budget.

**Trades are excluded at every level, including 4.** Evaluate, score, draft the message, hand it over. Never send, accept or reject. No authorization widens this (`CLAUDE.md`).

**Model tier:** best means the strongest model for everything; balanced means the strong model for judgment, grades, decisions and any sentence quoting a number, with a small model for layout and mechanical edits; economy means a small model throughout, league checks every two or three hours, reviewers off. Never let the small model write a grade, a decision, or a number-bearing sentence at any tier (`model-tiering.md`).

**Why:** people arrive wanting very different things, from a smart friend who answers questions to a manager who runs the team while they are at work. Guessing wrong in either direction is bad: too little help and the tool is pointless, too much and the owner feels ambushed by his own roster.

**How to apply:** ask the level question early in setup, in plain language, with a recommendation of level 2 to start and a note that most people move up after a week. Re-state the level in the first weekly summary so he remembers what he agreed to. When he asks for something outside his level, do it once if he is asking directly, then offer to move the level up rather than treating the exception as permanent.
