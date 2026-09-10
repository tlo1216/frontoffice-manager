---
name: decision-cross-review
description: "Autonomous decisions go through a PR in decisions/ that tags @codex for review before the agent acts; a DISAGREE goes to the owner first"
metadata:
  type: feedback
---

Any decision the agent would make without a fresh yes (timer adds, drops and claims; news driven lineup changes; trade drafts; blocking pickups) is written to `decisions/<date>-<slug>.md` from the template, opened as a PR with `tools/decision-pr.sh` (the body tags @codex and asks for AGREE or DISAGREE, disputed numbers with sources, and the strongest alternative), reviewed, and merged as the record. Wait up to 30 minutes for the review on a timer decision, then proceed and note it.

**Why:** a second model catches wrong numbers and blind spots. The owner wants the dissent visible before anything irreversible.

**How to apply:** the final call stays with the agent, but any DISAGREE goes to the owner with both arguments before a timer runs. The reviewer's instructions are in `AGENTS.md`; the review model is set in Codex settings by the owner. If the owner has API keys instead of a Codex plan, run node tools/second-opinion.mjs <decision file> before acting; it queries GPT, Gemini and Claude reviewers with the same instructions, records each verdict, and appends a weighted consensus. Until some reviewer is configured, open the PR anyway and note that no review arrived.
