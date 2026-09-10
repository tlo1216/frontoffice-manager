---
name: espn-disconnect-policy
description: "What a 401 from the ESPN API means and what to do; keep working from the last snapshot"
metadata:
  type: feedback
---

A 401 from `lm-api-reads.fantasy.espn.com` is not proof of a logout. The browser pane's fetch sometimes stops attaching cookies to that host; `fetch(url, { credentials: 'include' })` fixes it. Before telling the owner to log in, confirm the page body itself shows no roster (no player names in `document.body.innerText`) or a login prompt.

**Why:** the original owner was told to log in three times in one evening for nothing.

**How to apply:** always fetch with credentials included. On a real logout, keep any published output on the last good data, tell the owner once per check in one line, and resume automatically when the page is logged in again. The ESPN login in the pane lasts about a month.
