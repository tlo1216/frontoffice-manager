# Changelog

Notable changes to the kit. Dates are when the work landed, not when it was
announced.

## Unreleased

### Fixed

- **The matchup simulator was understating variance by roughly three to one.**
  `lib/sim.mjs` recentred a resampled week on a player's own projection
  without rescaling it to his position's real spread, so a receiver projected
  14.4 came out with a week-to-week coefficient of variation around 0.19
  against a measured 0.64. Every win probability the kit computes from it —
  `tools/lineup.mjs`'s start/sit calls and its leverage figure — was more
  confident than the data supports, pulled toward whoever was already ahead.
  Fixed by standardising the resampled week and scaling it to the measured
  spread for its position instead. `tools/check-sim.mjs`, new below, is what
  caught it: it simulates a player against a known real-world spread and
  fails on drift, rather than only checking that the simulator produced
  output at all.
- **`tools/draft-board.mjs` could read a stale projection.** Its stat lookup
  pinned `statSourceId` and `scoringPeriodId` but not `statSplitTypeId`, and
  ESPN carries more than one entry under the same source and period once the
  season is under way. An unpinned read returns whichever one ESPN lists
  first, not necessarily the current one.
- **`tools/guard.mjs`'s credential scan matched the code that reads a cookie,
  not a leaked one.** It looked for the bare text `espn_s2=`, which is also
  how every tool that builds an ESPN cookie header from `.env` writes the
  line (`` `espn_s2=${s2}` ``), so it failed on several files that hold no
  credential at all. Being lowercase-only, it also would have missed a real
  leak pasted from a `.env` file (`ESPN_S2=...`, uppercase). It now requires
  an actual value after the key, rejects a template interpolation, and checks
  case-insensitively.

### Added

- **A measured-numbers registry, so a backtested figure cannot quietly go
  stale.** `lib/measured.mjs` lets a harness record what it measured, with a
  sample size and a source, and lets a consumer read that measurement with a
  literal only as the fallback for a fresh checkout. `tools/constants-audit.mjs`
  (`league/constants.json`) then checks that every such number in `lib/` is
  declared, that the declared literal matches what the code actually carries,
  and reports the age of anything measured, so a figure nobody has re-derived
  in months is visible rather than silently trusted.
- **`tools/check-sim.mjs`**, which validates the matchup simulator against a
  real, known spread rather than just checking it runs. A model that outputs
  a probability distribution can be completely broken while still printing a
  confident, well-formatted number every time; this is what actually caught
  the variance bug above, and will catch the next one like it.
- **`tools/check-mirror.mjs`**, for anyone keeping a `rules/` folder in sync
  with an agent's own memory (the way this kit's `START-HERE.md` sets up):
  it diffs the two and fails if a rule exists in one and not the other, so a
  session recovered from git alone can't silently be missing a standing
  instruction.
- **`tools/health-check.mjs`**, a cheap check to run at the top of any
  scheduled pass: is the ESPN cookie still alive, is the configured team
  still in the league, and have the scoring or roster settings changed since
  last run. A commissioner tweaking a scoring rule invalidates every
  valuation the kit has computed without changing a line of code, and
  nothing else here would notice.
- **`lib/byes.mjs`**, bye-week analysis that goes past "how many starters are
  off this week" to which SLOT cannot be filled at all: losing two receivers
  costs almost nothing, losing your only tight end is a hole nothing else on
  the bench fills. Includes a roster-cut ranking (surplus position first,
  then value against the wire, with bye-week cover only breaking a near tie)
  and a bye table derived from the current schedule and a player's current
  NFL team, rather than a name-keyed file that goes stale the day someone
  changes teams.
- **`tools/bye-map.mjs`**, which builds a `{ "Player Name": week }` bye map
  for any league you can read, for pasting into your own draft or keeper
  tooling.
- **`tools/code-review.mjs`**, a weekly self-check for the codebase rather
  than the roster: duplicated constants that a shared module already solves,
  spent one-off scripts still sitting in `tools/`, patterns that have
  produced a wrong number before (a rounding call in a data path, a stat
  lookup that pins its source but not its split type, a swallowed error),
  and whether `tools/guard.mjs` still has more ways to fail than to pass.
  Measures and proposes; it does not auto-fix, on the theory that a script
  editing forty files at 9 AM on a Sunday is how a working system breaks.
  Running it against this repo is also what found the three fixes above.
- **`tools/injury-check.mjs`**, which reads ESPN's injury status (live, but
  only one word) alongside the nflverse practice report (published
  Wednesday through Friday, and a better predictor of whether a man's
  performance is actually affected) and prices the gap in points per game,
  split by practice bucket so a questionable player who practised in full is
  priced differently from one who did not.
- **`tools/stream-check.mjs`** for kickers and defenses: who they are barely
  matters week to week (measured week-to-week persistence around 0.03-0.04
  for both), which game they're in matters a great deal (a kicker's own
  team's implied total, a defense's opponent's), and the tool compares your
  two against what your league's wire actually has rather than a
  league-wide ideal.
- **`lib/data.mjs` gained `espnHeaders()` and `espnConfig()`**, centralizing
  the ESPN cookie read and the league/team/season lookup that five different
  tools each carried their own copy of, plus `forwardProjection()` and
  `seasonProjection()`, which pin every field ESPN uses to distinguish one
  stat entry from another (source, split type, scoring period, and season)
  rather than trusting `find()` to return the right one on its own — the
  same class of bug fixed in `tools/draft-board.mjs` above — and
  `pendingAdds()`, so a tool that files waiver claims on a schedule can see
  what it already filed and not spam the same claim every morning until it
  settles.

### Changed

- **Support asks are now permitted, once.** `rules/never-ask-for-money.md` is
  replaced by `rules/asking-for-support.md`. The kit stays free with nothing
  gated, and the agent may ask for support a single time, at the end of a
  weekly report after the first completed week, suggesting 5 dollars. The
  conditions are deliberately narrow: never timed to a win or to a moment of
  gratitude, never in a message that also contains an apology, never twice, and
  never anywhere the owner's league mates can see it. The reasoning from the old
  rule is carried forward rather than dropped, since an agent holding league
  credentials asking its user for money is a real conflict of interest.
- **`.github/FUNDING.yml`** added but entirely commented out. An enabled entry
  pointing at a profile that does not exist renders a Sponsor button leading
  nowhere, which is worse than no button.

### Added

- **Draft preparation that happens before draft day, not during it.**
  `tools/draft-prep.mjs` builds a ranked snake queue from five seasons of
  measured positional scarcity, excluding injured players and detecting the real
  cliffs in each position's value curve. `tools/auction-prep.mjs` does the
  equivalent for salary cap drafts, in dollars rather than ranks, using the
  standard method of dividing money above replacement by each player's share of
  league-wide value over replacement. Half-PPR is computed exactly rather than
  estimated, since nflverse publishes both standard and full-PPR totals and
  half-PPR is their midpoint.
- Both builders **abort if the player pool is not a real draft pool**. Run
  against an already-drafted league they would otherwise price that league's
  leftovers as though they were the best players in football, and format it
  convincingly.
- **[DRAFT-RUNBOOK.md](DRAFT-RUNBOOK.md)**, the automation lessons from a live
  draft that went wrong. Element references expire in under two seconds in a
  draft room because the board re-renders on every pick in the league; pixel
  coordinates are worse because rows shift; the only reliable pattern is
  filtering to one position and then finding and clicking in the same batch.
  Turning autopick on early with one good player queued is what converts an
  impossible timing problem into a manageable list-maintenance one.

- **A free tier that needs no AI subscription and no computer.**
  [FREE-TIER.md](FREE-TIER.md) plus a GitHub Actions workflow. Twenty of the
  twenty-four tools in this kit call no model at all: they are arithmetic over
  free data. That half now runs on its own, every Tuesday, committing reports
  to your own repo. You get lineup efficiency against the best your roster
  could have started, all-play record, value over replacement by position, buy
  and sell boards ranked by usage rather than points, a streaming board on the
  sportsbook line, and a win probability simulated with correlated outcomes.
  It tells you what to do and will not do it for you; the management half still
  needs an agent and a paid plan.
- **`lib/data.mjs` and `lib/sim.mjs`**, the shared data layer and the matchup
  simulator, plus `backtest`, `backtest-value`, `edge`, `lineup`, `market` and
  `weekly` in `tools/`. Ported from a private league's setup and genericised:
  the team id comes from `ESPN_TEAM_ID` and the manager-name file is optional.

- **[NO-COMPUTER.md](NO-COMPUTER.md)**, two verified ways to run the kit without
  owning a machine that can stay on. That requirement is the first line of
  SETUP.md and it is the real barrier: the one person who got furthest with this
  repo stopped there, not at the docs. Option one is Claude Code on the web,
  which needs no machine and whose Routines run the recurring passes on a
  schedule unattended. Option two is a permanently free Oracle Ampere instance,
  2 OCPUs and 12 GB, free for the life of the account, which keeps credentials
  on a machine the owner controls. Both carry their real caveats: a Pro or Max
  subscription is required either way, mobile browser support is undocumented,
  plain environment variables are readable by anyone sharing a cloud
  environment, and Oracle ARM capacity is frequently unavailable.
- Codex cloud is covered as its own option, because it differs in two ways that
  matter: internet access is blocked by default during the agent phase and must
  be enabled with an allowlist, and scheduled runs are not documented, so the
  unattended passes are not available there. Its HTTP method restriction is
  worth knowing about in the other direction: limiting an environment to GET
  makes the kit read only in a way the platform enforces.

- **[docs/example-week.md](docs/example-week.md)**, a worked illustration of a
  week of output: lineup efficiency against the best each roster could have
  started, all-play records set beside the real standings, buy and sell boards
  ranked by usage rather than by points, a streaming board built on the
  sportsbook number, and value over replacement by position. Invented teams,
  real structure. You can see what the kit produces without installing it.
- **[TRY-IT.md](TRY-IT.md)**, a read only path that needs no cookies, no API
  keys, no private repo and no write access. It points an agent at a Sleeper
  league, prints the analysis and stops. It says plainly that this works on
  Sleeper only: ESPN returns 401 for every league endpoint without a session
  cookie, public leagues included, and Yahoo needs an OAuth app first. ESPN and
  Yahoo owners are sent to the example output instead of being allowed to walk
  into an error. It also shows where to find a Sleeper league id, which is the
  one thing the trial actually requires.

- **`tools/guard.mjs`**, a defence against your own setup quietly getting worse
  over a season. It runs smoke tests that fail when a script produces confident
  output over no data, checks reports for lost numeric precision, scans tracked
  files for committed credentials, and enforces a **threshold ratchet**: every
  guarded constant is recorded with the reason it holds its value, and lowering
  one fails the run. Raising one only warns. Changing a threshold is fine.
  Changing one silently is not. Local compute, no agent turn, no network, safe
  in CI.
- **`rules/measure-before-trusting.md`**, a method for testing a signal before
  acting on it: write the claim and its refutation before looking at the data,
  hold out a season, report per season rather than pooled, and refuse to print
  a verdict when the sample is too thin.

## 2026-09-12

### Added

- **ChatGPT Secure MCP Tunnel path** (`CHATGPT-TUNNEL.md`), so the ESPN MCP
  server can be reached from ChatGPT read only, outbound only, with no public
  port opened.
- **Experience level interview** (`rules/experience-levels.md`), from novice to
  expert, so setup asks for the right amount of detail.
- **Logon autostart helper** for the tunnel on Windows
  (`tools/install-tunnel-autostart.ps1`).

### Fixed

- Four separate Windows traps in the autostart path, now documented in the
  script itself: Task Scheduler quote mangling, PowerShell 5.1 treating a
  native command's stderr as a terminating error, a hidden task tearing down
  its own process tree, and `tunnel-client` resolving `--profile` under `$HOME`,
  which neither PowerShell nor Task Scheduler define. The fix is to pass
  `--config` with a full path.

## 2026-09-10

First public release.

### Added

- The standing manager kit itself: hourly league reads, lineups set before
  kickoff, every trade and pickup in the league graded with projections and
  market values, and a written record kept in a private repo.
- **Platforms**: ESPN, Sleeper and Yahoo, including a Yahoo OAuth helper and a
  five minute setup path.
- **Sports**: NFL, NBA and MLB, with per sport cheat sheets and a daily sports
  rule.
- **ESPN MCP server** guide and stdio helper, replacing browser scraping for
  reads and writes.
- **Draft helper**: value board, autodraft pre-rank list and a live draft
  assistant.
- **Multi model second opinion** through plain API calls to GPT, Gemini and
  Claude, with a weighted consensus written back into the decision file.
- **Autonomy levels 0 to 4** and model tiers, chosen during setup. Trades are a
  hard limit of the kit rather than a setting: the agent never sends one.
- **Weekly trade scan** scoring both sides of every proposal.
- **Security posture**: honest risk disclosure, a prompt injection rule for
  untrusted league content, a hardened gitignore, an env example, and a rule
  barring the agent from soliciting donations.
- **nflverse data** baked in for schedules, injuries and depth charts, with no
  login required.
