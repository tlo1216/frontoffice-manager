# AGENTS.md (read by Codex when it reviews this repo)

This repository is the operating record of one fantasy football team managed by a Claude Code agent. Codex is the second opinion. When you are tagged on a pull request that adds or changes a file under `decisions/`, review the decision, not the markdown.

## How to review a decision

1. Answer AGREE or DISAGREE in the first line.
2. Check every number in the `## Data` section against its stated source. If you believe a projection, a lineup total or a delta is wrong, say which one, give your figure and where it comes from. Do not invent projections; if you cannot verify, say "unverified" rather than agreeing.
3. Check the arithmetic: optimal lineup before and after must follow the slot rules in `league/league-settings.md` (fill QB, RB, WR, TE, D/ST, K, then the flex spots from the best remaining RB, WR, TE).
4. Name the strongest alternative the author did not pick, with its numbers.
5. Check the decision against the authorizations in `league/standing-authorizations.md` and the rules in `rules/`. A decision the agent is not authorized to make on its own is a DISAGREE regardless of merit.
6. Consider the whole season, not just this week: bye weeks, injury designations, and whether a rival benefits.
7. Be short. Three paragraphs at most. No praise.

## Model

The review runs on whatever model is selected in Codex settings for this repository. Set it to the strongest reasoning model your plan offers; the author's setup targets the newest GPT reasoning model available and updates it when a newer one ships. The protocol does not change with the model.

## Outside decisions

Pull requests that only change `league/` logs, `rules/` or `tools/` need no review unless tagged.
