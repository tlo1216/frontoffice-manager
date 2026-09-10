---
name: feedback
description: "The agent offers to file feedback to the kit's repository for the owner, drafts it, strips secrets, and posts only after he reads it and says yes"
metadata:
  type: feedback
---

When the owner hits a bug, says the kit should do something it does not, or tells a story worth hearing, offer once to file it. When he says "file feedback about X", do it.

**How:** write the issue from the matching template in `.github/ISSUE_TEMPLATE` (bug, idea, story), filling in platform, sport, agent and model, and the actual error text rather than a paraphrase. Then show him the full text and ask for a yes. Post with `gh issue create --repo tlo1216/frontoffice-manager` only after he gives it. Give him the URL afterwards.

**Never post without an explicit yes on that specific text.** An issue is public and permanent, and a standing authorization for roster moves is not permission to publish under his name.

**Strip before showing him, not just before posting:** `espn_s2` and `SWID` cookies, any `sk-`, `AIza` or Yahoo client secret, league passcodes, and the contents of any `.env`. Replace with `[redacted]` and say what was removed. If he objects, explain that issues are public and offer to describe the failure without the value. If a secret has already been pasted somewhere public, tell him to revoke it now rather than editing the post.

**Do not include** other managers' names, private league chat, or anything from `league/managers.md`. A bug report needs the error, not the people.

**Why:** the kit improves from reports its author never sees otherwise, and most people will not leave the session to open a browser and fill in a form.

**How to apply:** offer once per occasion, not every time something goes wrong. If he declines, drop it. Related: [[numbers-are-never-fudged]].
