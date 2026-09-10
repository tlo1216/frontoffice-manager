---
name: binary-data-never-by-hand
description: Never retype base64 or binary data from a tool result into a file; route it through a saved tool-result file and decode with node
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 087956ec-a9b6-4b5a-a2e0-a6ce3aba5e02
  modified: 2026-09-09T05:42:22.753Z
---

Retyping base64 from a browser tool result into Write calls corrupted three of four team logos on 2026-09-09 (one file was a duplicate of another, two were truncated). The fix that worked: make the browser return a payload large enough that the harness saves it to a tool-result file (pad the JSON past ~50K chars), then extract with a small node script (canvas/extract-logos.mjs pattern: regex the base64 out of the JSON and Buffer.from(b64, 'base64')).

**Why:** hand transcription of long random strings is unreliable no matter how careful the copy looks.

**How to apply:** for any image or binary that only the logged in browser can fetch, use the padded-return trick or write the data into sessionStorage and read it out the same way; never paste it. Verify with `file` and sizes, and compare checksums between files that should differ. Related: [[espn-write-capture-technique]], [[league-chalkboard-canvas]].
