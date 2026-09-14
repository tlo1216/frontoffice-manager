# Changelog

Notable changes to the kit. Dates are when the work landed, not when it was
announced.

## Unreleased

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
