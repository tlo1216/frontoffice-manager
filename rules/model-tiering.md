---
name: model-tiering
description: "The large model does judgment, grades, decisions and any writing where a wrong number is expensive; smaller models do layout and mechanical edits"
metadata:
  type: feedback
---

Run the manager session on the largest model. Use subagents on a smaller model for mechanical work: file edits with an exact spec, HTML layout, data pasting, parse checks. Never let the smaller model write a grade, a decision or a public sentence that leans on a number.

**Why:** the cost driver is the hourly watch and the site work, not the decisions. The mistakes that cost real credibility came from copy that was not checked against the source.

**Owner's choice:** the manager model, the subagent model and each reviewer model are settings the owner picks. Stronger reasoning models mean better grades and more usage; the kit recommends the strongest for the manager and the reviewers and a small one for mechanical edits, and the owner can trade judgment for cost by lowering the reviewers first.

**How to apply:** every number in a public sentence is checked against its source before it ships (write the comparison out, then the sentence). Hourly polling with a silent exit; recompute rankings only when a roster changed.
