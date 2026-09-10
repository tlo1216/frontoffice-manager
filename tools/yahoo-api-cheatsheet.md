# Yahoo Fantasy Sports API

Yahoo is the one platform with an official, documented API, and it covers reads and writes for football, basketball, baseball and hockey. The price is OAuth: a one time app registration and a token the agent refreshes. `tools/yahoo-auth.mjs` does the whole dance; you paste one code.

## Setup (once, about ten minutes)

1. Go to https://developer.yahoo.com/apps/create/ signed into the Yahoo account that owns your fantasy team.
2. Application name: anything ("frontoffice"). Application type: Installed Application. Redirect URI: `oob` (Yahoo then shows the code on screen). API permissions: check Fantasy Sports and choose Read/Write if you want the agent to make lineup moves through the API, Read if you only want reads. The plain language version is YAHOO-SETUP.md.
3. Copy the Client ID and Client Secret into `.env` as `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`.
4. Run `node tools/yahoo-auth.mjs`. It prints a URL; open it, click Allow, copy the code from the page or the address bar (`code=...`), paste it back. The script stores `YAHOO_REFRESH_TOKEN` in `.env`, prints your leagues, and writes `YAHOO_LEAGUE_KEY`, `YAHOO_TEAM_KEY`, `YAHOO_SPORT` and `YAHOO_SEASON` itself when you are in one active league. Access tokens last an hour; the scripts refresh them automatically from the refresh token, which lasts until you revoke it.

## Keys

- Base: `https://fantasysports.yahooapis.com/fantasy/v2`, append `?format=json` (XML is the default).
- Game key: `nfl`, `nba`, `mlb`, `nhl` for the current season, or a numeric game id for a specific season (`/users;use_login=1/games` lists them).
- League key `{game_id}.l.{league_id}`, team key `{league_key}.t.{team_id}`, player key `{game_id}.p.{player_id}`.
- Your league key is in the URL of your league page on Yahoo (the number after `/f1/` is the league id); `/users;use_login=1/games/leagues` returns every league you are in with keys.

## Reads the agent uses

| Need | Call |
|---|---|
| Settings, roster slots, scoring | `/league/{league_key}/settings` |
| Teams and owners | `/league/{league_key}/teams` |
| Standings | `/league/{league_key}/standings` |
| Matchups and live points | `/league/{league_key}/scoreboard;week={week}` |
| A roster | `/team/{team_key}/roster;week={week}` (football) or `;date=YYYY-MM-DD` (daily sports) |
| Free agents | `/league/{league_key}/players;status=A;sort=AR;count=60` (`status=A` available, `W` on waivers, `FA` free agents; `sort=AR` actual rank, `OR` overall rank, `PTS`) |
| Player stats | `/league/{league_key}/players;player_keys=...;out=stats` and `/player/{player_key}/stats;type=week;week={n}` |
| Transactions | `/league/{league_key}/transactions;types=add,drop,trade,commish` |
| Waiver claims pending | `/league/{league_key}/transactions;types=waiver;team_key={team_key}` |

## Writes (need the Read/Write scope)

- Lineup: `PUT /team/{team_key}/roster` with an XML body listing each player key and its position for a week (football) or date (daily sports). The scripts build this body; the agent validates locked players against the roster's `is_editable` flag before sending.
- Add, drop, add and drop, waiver claim with FAAB: `POST /league/{league_key}/transactions` with an XML transaction body (`type` add, drop or add/drop, player keys, `faab_bid` when applicable).
- Trades are never sent by the agent. The API supports proposing them; the kit does not implement it.

## What Yahoo does not give you

Projections. The public API returns actual stats and ownership, not projected points. The kit's Yahoo snapshot fills season projections from the same unofficial Sleeper projections endpoint the Sleeper path uses (`https://api.sleeper.com/projections/nfl/{season}?season_type=regular&position[]=QB&...&order_by=pts_ppr`, `nba` for basketball), matched by player name and team. When that endpoint fails, projections are zero and the snapshot says so; the agent can still diff rosters, injuries and moves. Convert the raw stat lines to your league's scoring when it is not a standard preset.

## Libraries, if your agent runs Python

`yfpy` (https://github.com/uberfastman/yfpy) and `yahoo_fantasy_api` wrap all of this with the OAuth flow built in. The kit's node scripts need no dependency.
