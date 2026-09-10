# Setup

Budget about an hour the first time. Steps 1 to 4 are one time per machine; step 5 is every restart.

## 1. The machine

Pick a PC that can stay on. The manager session, its hourly league watch and its kickoff reminders all live inside the running Claude Code app. If the machine sleeps, they pause.

Windows, in an Administrator PowerShell:

```
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 20
powercfg /h off
```

Also: Settings, System, Power, set "When plugged in, put my device to sleep" to Never. If it is a laptop, set "When I close the lid" to Do nothing. Turn off automatic restarts after Windows updates (Settings, Windows Update, Advanced options, pause updates during the season, or set active hours to cover the whole day).

Mac: System Settings, Energy, turn on "Prevent automatic sleeping when the display is off" and turn off "Put hard disks to sleep". Or run `caffeinate -dims` in a terminal and leave it.

Your phone is how you talk to the session from anywhere. In the Claude app, the session shows up under Code and you can message it from your phone; the desktop app has a Remote Control toggle for this.

## 2. Install the tools

Windows (PowerShell, your user account, no admin needed):

```
winget install --id OpenJS.NodeJS.LTS --scope user
winget install --id GitHub.cli --scope user
```

Mac: `brew install node gh`.

Then `gh auth login` once and follow the prompts (GitHub.com, HTTPS, login with a browser). Claude Code will use `gh` and `git` for the repo.

Install the Claude Code desktop app and sign in. Open it in the folder of your private repo (step 3) so it reads `CLAUDE.md` automatically.

## 3. Your private repo

1. On GitHub, click "Use this template" on frontoffice-manager (or fork it and make the fork private). Name it something like `myteam-ops`. It must be private: it will hold candid notes about the people in your league.
2. Clone it to the always on PC.
3. Fill in `league/league-settings.md` from your ESPN league settings page (roster slots, scoring, waiver type, playoff format). The agent can do this for you from the API on the first run, but check it.
4. Put your league id and team id into `manager-session.md` where marked. Both are in your team page URL: `fantasy.espn.com/football/team?leagueId=XXXX&teamId=N`.
5. Read `league/standing-authorizations.md` and decide what the agent may do without asking. The template starts with lineup moves only. Widen it in writing when you trust it.

## 4. Log into ESPN in the browser pane

The agent never sees your password. You log in yourself, once a month.

1. Start Claude Code in the repo folder. Paste the first message from `manager-session.md`.
2. Its first action opens the browser pane at your team page. Click into the pane and log into ESPN there like a normal browser. Use the pane, not a Chrome extension; the pane keeps its own cookies.
3. Ask the agent to verify. It should run the snapshot fetch from `tools/snapshot-fetch.js` and get HTTP 200 with your roster. If it reports 401, the fix is usually that the fetch needs `credentials: 'include'`, not that you are logged out; `rules/espn-disconnect-policy.md` covers this so the agent does not nag you for nothing.

That login lasts roughly 30 days. When it expires the agent will tell you exactly once per check and keep working from its last snapshot.

## 5. Every restart

If the app or the PC restarts, the session's reminders are gone. Start the session again in the repo folder, paste the first message again, and it will:

- read `rules/` and `league/`,
- reopen the ESPN pane (you may need to log in again),
- recreate the hourly watch and the kickoff reminders for the current week from the NFL schedule,
- report the current state of your team before doing anything else.

## 6. The setup that works

Leave the session running on a machine that never sleeps and talk to it from your phone through remote control in the desktop app. You get a message before kickoff and answer from wherever you are; the move happens on the computer at home. TIPS.md covers this and the rest of the habits worth having.

## 7. Daily rhythm the agent keeps

- Hourly, 7 AM to 11 PM: diff the league (rosters, moves, pending claims, injuries, waiver order, settings). Silent when nothing changed.
- 90 minutes before each kickoff window that touches your roster: verify starters are active, compare to the bench, make pre authorized lineup moves, tell you.
- Once a week, after the scoring period turns over: a full league trade scan with both sides scored, handed to you as ranked suggestions.
- Tuesday morning: week is final; waiver targets against your weakest bench spots, proposed claims with drops, next week's reminders.
- Any time: you paste a screenshot from the ESPN app or your group chat and it updates its picture of the league.

## 8. What to tell it about your league

The agent is only as good as what it knows about the other managers. After the draft, tell it in plain language: who autodrafted, who is an ally, who never reads the chat, who overvalues what. It writes each note into `league/managers.md`. That file is why it stays private.
