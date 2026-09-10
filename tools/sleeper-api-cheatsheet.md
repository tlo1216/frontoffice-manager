# Sleeper API cheat sheet

Sleeper's read API is public and needs no login. Base: `https://api.sleeper.app/v1`. Rate limit is generous (about 1000 calls a minute); the hourly watch uses six.

## Finding your ids

1. `GET /user/{username}` gives your `user_id`.
2. `GET /user/{user_id}/leagues/nfl/{season}` lists your leagues with `league_id`.
3. `GET /league/{league_id}/rosters` lists rosters; the one whose `owner_id` equals your `user_id` is yours, and its `roster_id` is what matchups and transactions use.

## Endpoints the agent uses

| Call | What it returns |
|---|---|
| `/league/{league_id}` | settings, scoring_settings, roster_positions, status, current week fields |
| `/league/{league_id}/rosters` | every roster: `players`, `starters`, `reserve` (IR), `taxi`, `settings` (wins, fpts, waiver_position, waiver_budget_used) |
| `/league/{league_id}/users` | owners: user_id, display_name, team name in `metadata.team_name` |
| `/league/{league_id}/matchups/{week}` | one row per roster: points, starters, starters_points, matchup_id |
| `/league/{league_id}/transactions/{week}` | adds, drops, trades, waiver claims with status, roster ids, `waiver_budget` |
| `/league/{league_id}/winners_bracket` | playoffs |
| `/state/nfl` | current season, week, season_type |
| `/players/nfl` | the full player dictionary (about 5 MB). Fetch once a day, cache to `tools/sleeper-players.json`, index by player_id for names, positions, teams, injury_status |
| `/players/nfl/trending/add` and `/trending/drop` | what the whole platform is adding and dropping in the last 24 hours (`lookback_hours`, `limit`) |

Injury fields live on each player in the dictionary: `injury_status` (Questionable, Doubtful, Out, IR, PUP, Sus), `injury_body_part`, `practice_participation`.

## Projections

Sleeper does not publish projections in the documented API. The endpoint its own app uses is `https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=pts_ppr` (note `.com`, not `.app`). It returns `stats` with `pts_ppr`, `pts_half_ppr`, `pts_std` per player for that week, and `/projections/nfl/{season}?season_type=regular&...` for the season. It is unofficial and can change; when it fails, fall back to ESPN's public projections or another source and say so in the log. Convert to your league's scoring from the raw stat lines in the same payload if your scoring is not a standard preset.

## Writes

There is no public write API. Lineup changes, adds, drops and waiver claims are done in the Sleeper web app (sleeper.com) inside the Claude Code browser pane, logged in as you, the same way ESPN writes are done through its page. Verify every write by re fetching `/league/{league_id}/rosters` and `/transactions/{week}`.

## Differences from ESPN worth knowing

- Waivers are usually FAAB (bids) on Sleeper. `settings.waiver_budget_used` on each roster and `waiver_budget` on transactions show the market. The agent's proposals name a bid amount and the reasoning, and you set the ceiling in `league/standing-authorizations.md`.
- Sleeper rosters have `taxi` and `reserve` lists; IR eligibility is enforced by the app, not the API.
- Team names are in the users list, not the rosters list; join on `owner_id`.
- Matchup points update live during games without login.
