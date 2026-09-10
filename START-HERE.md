# Start here: hand this repo to Claude Code or Codex and go

You need: this repo cloned as a **private** copy, an ESPN or Sleeper league, and either the Claude Code desktop app or Codex. Nothing else to configure by hand; the agent interviews you and fills the files.

## 1. Make your private copy

On GitHub: "Use this template" (or fork, then make it private). Clone it to a PC that can stay on (see `SETUP.md` section 1 for keeping it awake). Open your agent in that folder.

## 2. Paste this first message into the agent

Works in Claude Code and in Codex. Replace nothing; the agent asks you for what it needs.

---

Read README.md, START-HERE.md, SETUP.md, KEYS.md, CLAUDE.md, AGENTS.md, every file in rules/, and the cheat sheets in tools/ for my sport and platform (espn-api-cheatsheet.md, sleeper-api-cheatsheet.md, espn-basketball-cheatsheet.md, espn-baseball-cheatsheet.md, yahoo-api-cheatsheet.md, nba-data-cheatsheet.md, mlb-data-cheatsheet.md, nflverse-cheatsheet.md). Then set me up as the standing manager of my fantasy football team by doing the following, asking me one question at a time when you need something only I know:

1. Ask which sport (football, basketball or baseball) and which platform I use (ESPN, Sleeper or Yahoo), my league id and team id (both are in my team page URL on ESPN; on Sleeper ask for my username and find the ids through the API), my time zone, and what to call me.
2. Decide how you will read the league. If you have a browser pane (Claude Code desktop), open it at my team page and ask me to log in there, then verify with tools/snapshot-fetch.js (ESPN) or tools/sleeper-snapshot-fetch.js (Sleeper, no login needed). If you have no browser pane (Codex or a terminal only agent) and the platform is ESPN, tell me how to copy my espn_s2 and SWID cookies from my browser into a local .env file (never commit it; .gitignore already excludes it) and read through tools/espn-cookie-fetch.mjs instead. Sleeper needs no cookies for reads. Yahoo needs a one time app registration and one pasted code: walk me through YAHOO-SETUP.md one step at a time, wait for me to say the two values are in .env, then have me run node tools/yahoo-auth.mjs (it writes the league, team, sport and season keys itself), and read through tools/yahoo-snapshot-fetch.mjs; Yahoo has an official write API, so with the Read/Write scope you can make lineup moves and adds through it rather than the page.
3. Decide how writes happen. With a browser pane you make lineup moves yourself in the page and verify through the API. Without one, you propose each move with the exact players and I make it in the app and tell you "done"; you then verify through the API.
4. From the API, write league/league-settings.md, league/roster.md, and the team table in league/managers.md. Compute my optimal lineup and compare it to what is set. Tell me the differences and, if you can write, fix them.
5. Fill CLAUDE.md's "League facts" section and manager-session.md's placeholders with my ids so the next session starts without this interview.
6. Read league/standing-authorizations.md with me. Confirm lineup moves are pre authorized and ask whether I want the timer rule, the named bench spot rule, the IR rule, or FAAB bid ceilings (Sleeper). Write my answers into that file.
7. Set the reminders. Football: one before each kickoff window that touches my roster this week, an hourly league watch, a Tuesday morning waiver check. Basketball or baseball: a morning lineup pass and a second pass an hour before the first game each day, the hourly watch, and a weekly pass on the day the matchup period turns over (rules/daily-sports.md). Tell me they live only in this session and that you will recreate them after any restart.
8. Ask me about the other managers in plain language (who autodrafted, who is an ally, who never reads the chat, who overvalues what) and write it into league/managers.md.
9. If my league has not drafted yet, stop here, read DRAFT.md and rules/draft.md, build my draft board, walk me through it, and set my pre ranked list; the rest of these steps run after the draft. Otherwise grade my roster honestly, name my strongest and weakest positions, the three best players on the wire versus my weakest bench spots, and one trade idea with projection deltas for both sides and FantasyCalc market values.
10. Ask whether I want other models reviewing your autonomous decisions (GPT, Gemini, Claude). If yes, walk me through KEYS.md one provider at a time, wait for me to say the .env file is saved, run node tools/list-models.mjs to confirm the keys work and choose the model ids, and write them into .env yourself. Never ask me to paste a key into the chat.
11. Commit and push everything except .env, then give me a one screen summary of how you will operate from here and what you need from me each week.

Rules you work under from now on are the files in rules/. Never send a trade. Never enter my credentials. Never fudge a number.

---

## 3. What happens next

The agent runs the interview, fills the repo, sets your lineup, and schedules itself. From then on you talk to it like a co manager: paste screenshots from the app or your group chat, ask "lineup", "waivers", or "trade with X", and it answers with numbers. Every move and grade lands in `league/trade-log.md`.

If you also want the Codex second opinion on autonomous decisions, follow `decisions/README.md` once to install the Codex GitHub app on your private repo.

## 4. Two honest notes

- With a browser pane the agent does the clicking. Without one you tap the confirm button yourself when it asks. Everything else is identical.
- Reminders die when the app closes. Restart the session in the repo folder and paste the same first message; it recognizes a filled repo and skips the interview.
