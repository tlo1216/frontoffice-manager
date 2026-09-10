#!/usr/bin/env bash
# Usage: tools/decision-pr.sh <slug> "<title>"
# Run from the repo root after writing decisions/<date>-<slug>.md.
set -e
slug="$1"; title="$2"; file=$(ls decisions/*-"$slug".md | head -1)
git checkout -q -b "decision/$slug"
git add "$file" && git commit -q -m "Decision: $title"
git push -q -u origin "decision/$slug"
gh pr create --title "Decision: $title" --body "@codex review this decision (see $file). Answer AGREE or DISAGREE first, then dispute any number with your own figure and source, then name the strongest alternative. Rules the agent works under are in rules/. League state is in league/. Review guidance is in AGENTS.md."
git checkout -q main
