# Yahoo in five minutes

Yahoo makes every person register a tiny "app" before its API will talk to them. That is the only manual part. After it, one script does everything.

## 1. Make the app (three minutes, once)

Open https://developer.yahoo.com/apps/create/ signed into the Yahoo account that owns your team, and fill it in exactly like this:

| Field | Put |
|---|---|
| Application Name | frontoffice |
| Application Type | Installed Application |
| Description | leave blank |
| Home Page URL | leave blank |
| Redirect URI(s) | `oob` |
| API Permissions | tick Fantasy Sports, choose Read/Write |

Click Create App. The next page shows a Client ID (long, starts with `dj0`) and a Client Secret. Keep that page open.

## 2. Put the two values in your .env file

In your private repo folder, open (or create) the file named exactly `.env` and add two lines:

```
YAHOO_CLIENT_ID=paste the Client ID
YAHOO_CLIENT_SECRET=paste the Client Secret
```

In Notepad choose "All files" as the type when saving so it does not become `.env.txt`. Your agent can do this step for you if you paste the two values into the file yourself first; never paste them into the chat.

## 3. Run the sign in

In a terminal in the repo folder:

```bash
node tools/yahoo-auth.mjs
```

It prints a link. Open it, click Allow, and Yahoo shows a short code. Paste the code back into the terminal. The script saves your login, finds your leagues, and when you are in one active league it writes the league key, your team key, the sport and the season into `.env` by itself. If you are in several, it lists them and your agent asks which.

## 4. Tell the agent

Say "Yahoo is connected". It runs the snapshot, writes your roster and settings files, sets your lineup, and schedules itself, exactly like ESPN or Sleeper.

## What you get that ESPN users do not

Yahoo's API is official and supports writes, so with Read/Write permission the agent sets lineups and makes adds through the API directly, no browser page needed, and nothing expires monthly. Projections are the one thing Yahoo does not provide; the kit fills them from a public source and tells you when it cannot match a player.

## If something fails

- "invalid_client": the ID or secret was pasted with a space or a missing character. Copy them again.
- "invalid_grant": the code was pasted twice or expired (they last a few minutes). Run the script again.
- No leagues listed: you signed into a different Yahoo account than the one with the team.
