# Rules

One file per standing rule, in the format the agent keeps in its own memory: what the rule is, why it exists, how to apply it. The agent reads all of them at session start and mirrors any change back here in the same commit as the action it caused. Edit them to change behavior; delete one to remove it.

- `standing-league-watch.md`: the hourly diff and what it flags
- `timer-authorization.md`: what may go through without a fresh yes, and the deadlines
- `grade-every-trade.md`: projection deltas, grades and rankings before and after, with FantasyCalc market values as the second opinion
- `blocking-pickups.md`: using roster spots to deny rivals
- `decision-cross-review.md`: the Codex review before autonomous decisions
- `espn-disconnect-policy.md`: what a 401 means and what to do
- `espn-write-capture-technique.md`: capturing ESPN write requests
- `binary-data-never-by-hand.md`: images and long data go through files, never retyped
- `model-tiering.md`: which model does what, to control cost
- `numbers-are-never-fudged.md`: honesty rules for grades, drafts and any public output
- `espn-mcp.md`: the espn-fantasy-mcp server is the primary ESPN interface when present; dry run every write; pane is the fallback
- `draft.md`: the value board, autodraft through the pre ranked list, the live draft assistant
- `daily-sports.md`: basketball and baseball: daily lineup passes, streaming, IL feeds, category math
