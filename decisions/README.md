# Decisions: a second model reviews before the agent acts

Every team decision the agent would make on its own (a timer authorized add, drop or claim; a lineup change driven by news rather than projections; any trade draft; any blocking pickup) goes through this folder as a pull request before it happens.

1. The agent writes `decisions/YYYY-MM-DD-slug.md` from the template, on branch `decision/<slug>`, and opens a PR whose body tags the reviewer: `@codex review this decision. Answer AGREE or DISAGREE first, then dispute any number with your own figure and source, then name the strongest alternative.` The script `tools/decision-pr.sh` does this.
2. Codex (OpenAI's GitHub app, installed on the repo by the owner, review model chosen in Codex settings; see `AGENTS.md`) reviews the PR and comments.
3. The agent reads the review with `gh pr view --comments`, re verifies any disputed number against ESPN, and writes a `## Review` section into the decision file: what the reviewer said, what changed, the final call.
4. The PR is merged either way; the file is the record. The final call stays with the agent under the owner's deference rule, but a DISAGREE always goes to the owner with both arguments before a timer runs.
5. A decision on a timer waits for the review up to 30 minutes, then proceeds and notes that no review arrived.

Pure projection lineup optimizations skip review and are logged in `league/trade-log.md`.

## Installing the reviewer (owner does this once)

1. Open Codex (chatgpt.com/codex) on a computer, signed into a ChatGPT plan that includes Codex.
2. Connect GitHub. Install the Codex connector on your account, "Only select repositories", pick this private repo.
3. Create an environment in Codex for the repo. Defaults are fine; it only reads markdown.
4. In Codex settings, turn on code review for the repo and pick the review model. `AGENTS.md` in this repo tells it how to review.
5. Tell the agent it is connected; it opens a test PR and times the review.

## Template

```
# Decision: <one line>

Date and time (local):
Deadline (if any) and what happens if missed:
Type: add | drop | claim | lineup | trade draft | block

## Situation
What happened, with sources (ESPN API fields, box score, news).

## Data
Season and week projections for every player involved, both sides.
Roster effect: optimal lineup before and after, in points.
League effect: who else is affected, waiver order, rival benefit.

## Options
1. Recommended: ... (why, in numbers)
2. ...
3. Do nothing: ...

## Risks
What has to be true for this to be wrong.

## Review
(filled after the review)
```
