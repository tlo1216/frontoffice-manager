# How much help do you want, and how good

Two dials, both yours, both changeable in a sentence at any time. The agent asks about them during setup and writes your answers into `league/standing-authorizations.md`, which is the file that actually governs what it may do.

## Dial one: how much it does for you

Pick a level. Most people start at 2 and move up after a week of watching it work.

| Level | Name | What it does | What you still do |
|---|---|---|---|
| 0 | **Ask me anything** | Answers questions when you ask. Reads your league, grades trades, tells you who to start. No scheduled jobs, no writes, nothing happens unless you start it. | Everything. It is a very well informed friend. |
| 1 | **Reminders** | Adds the hourly league watch and a message before every kickoff window. Tells you what it would do. | Every move, in the app, yourself. |
| 2 | **Lineup manager** | Sets your lineup itself, before every kickoff, and reports what it changed. Proposes adds, drops and claims and waits for your yes. Weekly trade scan. | Say yes to pickups. Send trades. |
| 3 | **Full manager** | Everything in 2, plus: time sensitive adds, drops and claims go through on a timer if you have not answered, the injured list is managed for you, and one named bench spot is its to use freely. | Say yes to anything with a real cost. Send trades. |
| 4 | **Autopilot** | Runs the roster. Waiver claims, adds, drops, injured list, lineups, streaming, all of it, on its own, and tells you after. | Read the summaries. Send trades. |

**Trades are never on any level.** The agent evaluates both sides, scores them, drafts the message, and hands it to you. It does not send, accept or reject. That is a hard limit of this kit, not a setting.

At every level it explains itself with numbers, and at every level a single sentence from you takes authority back.

## Dial two: which models

The agent runs on whatever model you pick in Claude Code or Codex. Stronger reasoning means better grades and better calls, and costs more per session.

| Tier | Setup | Good for |
|---|---|---|
| **Best** | The strongest model available for everything. | You want the sharpest possible judgment and do not care about spend. |
| **Balanced** (recommended) | Strong model for judgment, grades, decisions and any writing that leans on a number. A small model for layout, data entry and mechanical edits. | Almost everyone. This is what the rules assume. |
| **Economy** | A smaller model throughout, league checks every two or three hours instead of hourly, reviewers off. | Casual leagues, or a second team you care about less. |

Never let a small model write a grade, a decision, or a sentence that quotes a number. That is the one place cheap models cost you credibility.

**Second opinions are separate and optional.** With your own API keys the agent can send each autonomous decision to GPT, Gemini and Claude as independent reviewers and act on a weighted consensus. It costs cents per review and it catches real mistakes. `KEYS.md` sets it up. Skip it and everything else still works.

## Changing your mind

Say it. "Go up to level 3." "Stop making claims without asking." "Use the cheap model for the site work." The agent rewrites the authorization file and confirms what changed. Nothing here is locked in at setup.
