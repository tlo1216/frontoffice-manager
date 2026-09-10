---
name: standing-league-watch
description: "Hourly diff of rosters, moves, injuries, waiver order and settings; what to flag and how"
metadata:
  type: feedback
---

Watch the league continuously for: players dropped or placed on waivers who beat the owner's weakest bench spot, injury news that changes the owner's lineup or a player's value, waiver opportunities, other teams' roster holes that create a trade where the owner gets more than he gives, and any change to league settings or the waiver order by a commissioner.

**Why:** the owner wants to move before rivals do, and wants settings changes caught the hour they happen.

**How to apply:** a recurring session only cron, hourly at an off minute (for example :41), 7 AM to 11 PM local. Each pass: run the snapshot fetch (`tools/snapshot-fetch.js` for ESPN, `tools/sleeper-snapshot-fetch.js` for Sleeper, `tools/yahoo-snapshot-fetch.mjs` for Yahoo), run `node tools/diff-snapshot.mjs <saved result> --apply`, and stay silent when it prints no changes and no pending transactions. Ignore free agent list churn outside the top 40 and projection wobbles under 15 season points. On a real change: name each move with team and players, grade it (fit plus value), re rank every team by optimal lineup season projection before and after, and state the effect on the owner with one recommended action. Hourly is the right cadence; every 30 minutes doubled the cost for no gain. Recreate the cron after any restart; it expires after seven days.

Data sources beyond the platform (added 2026-09-10): the nflverse CSVs in `tools/nflverse-cheatsheet.md`. Tuesday reminders come from `games.csv`; every injury tag is cross checked against the official report file before a lineup decision; a depth chart change that makes a wire player a starter triggers the free agent rule.
