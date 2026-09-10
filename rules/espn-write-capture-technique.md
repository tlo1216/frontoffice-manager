---
name: espn-write-capture-technique
description: How to capture lm-api-writes payloads in the ESPN browser pane without losing them to the post-click redirect
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 087956ec-a9b6-4b5a-a2e0-a6ce3aba5e02
  modified: 2026-09-09T02:14:07.380Z
---

ESPN's add/claim confirmation redirects to the team page right after the click, which empties the browser pane's network buffer, so read_network_requests after the click finds nothing (happened 2026-09-08 on the Isaiah Likely claim).

**Why:** manager-session.md requires saving every write request (method, URL, JSON body) to captured/ for the frontoffice Phase 6 write code, and the buffer only holds recent traffic on the current page.

**How to apply:** before clicking Confirm, install an interceptor in the page with javascript_tool that wraps window.fetch and XMLHttpRequest.prototype.open/send, appends any request to lm-api-writes.fantasy.espn.com (method, url, body) into sessionStorage under a known key, then click. After the redirect, read sessionStorage from the new page (same origin keeps it). Redact SWID and cookies before writing to captured/. Related: [[frontoffice-manager-session]].
