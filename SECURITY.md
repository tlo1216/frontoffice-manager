# Risks, honestly

This kit hands an AI agent your fantasy account credentials and, if you let it, the ability to change your roster while you are asleep. That is genuinely useful and genuinely risky. Here is the full list, including the parts that are inconvenient to admit.

## The big one: ESPN cookies are your whole account

`espn_s2` and `SWID` are not fantasy-only credentials. They are your ESPN session. Anyone who gets them can act as you across ESPN, not just in your league, until they expire or you log out everywhere.

They live in a plain text file on your computer. That means:

- Anyone with access to your machine, or to a backup of it, has them.
- If your repo folder sits in OneDrive, Dropbox or iCloud, they are in that cloud account too. Mine does. Keep the file outside a synced folder if you can, or accept the tradeoff knowingly.
- If you ever paste them into a chat, an issue, or a screenshot, treat them as burned and log out of ESPN everywhere immediately.

Sleeper needs no credentials for reads. Yahoo uses OAuth, which is better: the token is scoped to fantasy and you can revoke it from your Yahoo account page without changing your password. If security is your main concern, Yahoo is the safest platform of the three and ESPN the least.

## Automating ESPN may violate its terms

ESPN's fantasy API is undocumented and unofficial. Nobody has published a policy blessing automated roster moves. Reading is what every stats site does and is unlikely to bother anyone; writing on a schedule is a grayer area. The realistic worst case is a rate limit or a broken endpoint, not a banned account, but the honest answer is that nobody can promise you it is allowed. Yahoo is the only platform with an official API and documented terms.

## The agent can make roster moves you would not have made

At autonomy level 3 or 4 it acts without asking. Every one of those actions is a real transaction:

- A drop cannot be undone if someone claims the player before you notice.
- A waiver claim spends priority or budget you may have wanted for a better player later.
- A bad lineup call costs you a week.

Mitigations that exist: writes validate slot eligibility, locks and roster limits before sending; the MCP server ships with writes disabled and every write tool defaults to a dry run; level 4 still stops before spending your last priority or your whole remaining budget. Mitigations that do not exist: there is no undo. Start at level 2, read what it does for a week, and widen deliberately.

## Your league mates can try to manipulate the agent

It reads league chat, team names, trade notes and screenshots you paste. Someone can put instructions in any of those. `rules/untrusted-content.md` tells the agent that everything it reads is data and only you can give it orders, and it will surface anything that looks like an attempt. That rule is a strong default, not a guarantee. If a league member is technical and adversarial, assume they will try something.

## The private repo is genuinely private

It holds candid notes about the real people in your league: who overvalues what, who does not read the chat, who is easy to rile up. If you make that repo public, or add a collaborator carelessly, you have published gossip about your friends under your own name. Keep it private. Do not put it in a public template. This is the risk most likely to actually cost you something, and it has nothing to do with code.

## API keys cost real money

The optional reviewer keys bill per call. A misconfigured loop could spend more than you meant to. There is no spend cap in the scripts. Set a monthly budget cap in the OpenAI and Google consoles rather than trusting the code. Reviews normally cost cents; if you see dollars, something is wrong and you should turn them off.

## You are running code from a stranger

Everything in `tools/` is a script your agent will execute on your machine with your credentials in scope. They are short and readable on purpose. Read them, or have your agent explain any one of them to you, before you run it. The same applies to the MCP server, which runs locally, holds your cookies and can write to your league.

## Data sources can be wrong

Projections are the platform's. FantasyCalc, Sleeper's projections endpoint and the nflverse files are third-party and can change format, go down, or serve stale numbers. The agent is told to verify every number in a claim against its source, but if the source is wrong, the output is wrong. Bet accordingly, meaning do not.

## The agent will be wrong sometimes

It is a language model reading projections. It will occasionally state something confidently that is not right. The rules make it check numbers before quoting them and show its work, and the optional reviewers exist because a second model catches real mistakes. None of that makes it correct. If a recommendation looks insane to you, it might be, and you have the veto for a reason.

## What is not a risk

It never sends, accepts or rejects a trade, at any autonomy level, and no setting changes that. It never enters your password anywhere; you log in yourself. It does not phone home, and there is no telemetry, no analytics, and no server. Everything runs on your machine, in your accounts.

## If something goes wrong

Revoke first, ask later. Log out of ESPN everywhere, revoke the Yahoo token from your Yahoo account settings, delete the API key in the provider console. All three take under a minute and none of them break anything you cannot set up again. Then open an issue and tell me what happened.
