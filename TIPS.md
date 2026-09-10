# How to actually run this

The setup that works, from a season of running it.

## Put it on a computer that never sleeps, and drive it from your phone

This is the whole trick. The agent's reminders, its hourly league checks and its lineup passes all live inside the running session. Close the app and they stop. So:

1. Pick the machine you leave on anyway. A desktop at home is ideal. A laptop on a charger with the lid open works.
2. Stop it sleeping (`SETUP.md` has the two commands for Windows and Mac). Turn off automatic restarts during the season, or set active hours to cover the whole day.
3. Start the session there, in your repo folder, and leave it running.
4. Turn on remote control in the desktop app, then talk to the same session from the Claude app on your phone.

That last step is what makes it feel like having a manager rather than a tool. You get a message before kickoff, you answer from the couch or the bar, the move happens on the computer at home. You never open the fantasy app.

## Talk to it like a person, not a command line

It works best when you tell it things. "Robert is an ally, don't gut him." "I panicked and drafted a backup quarterback in the sixteenth round, never let me do that again." "Paul overvalues landing spot." All of that goes into its notes and changes what it recommends later. The rules in `rules/` are just the ones you have already told it enough times to write down.

Screenshots work too. Paste the league chat, a trade offer, an injury tweet. It reads them and updates its picture.

## Widen its authority slowly

Start with lineup moves only, which is the default. After a week of watching it get those right, decide whether you want the timer rule, so a claim goes in at midnight while you sleep. Then maybe hand it one bench spot to use freely. Every widening is a line you write in `league/standing-authorizations.md`, and you can take any of it back in a sentence.

Trades are the exception. The agent never sends one in this kit, no matter what you write.

## Expect it to tell you no

The point of writing down rules is that it argues with you using them. It will say your idea is worse than the alternative and show the numbers. That is the feature. If you want a yes machine, this is the wrong tool.

## Cost

The two things that cost money are the session itself and the optional second opinion reviewers. Keep the big model for judgment and let a small one do layout and mechanical edits. Hourly checks that exit silently are cheap. If you need to trim, lower the reviewer models first and widen the check interval second, and leave the main session alone.

## When it breaks

Paste the error back into the session and tell it to fix it. Nine times out of ten it can. The two failures you will actually hit:

- **The platform logged you out.** ESPN's session lasts about a month. Log in again in the pane, or refresh the cookies in the MCP server's `.env`.
- **The session restarted.** Reminders are gone. Start it again in the repo folder and paste the same first message. It reads `rules/` and `league/`, rebuilds its schedule, and tells you where things stand.
