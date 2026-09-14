# No computer? Two ways to run this anyway

`SETUP.md` opens by telling you to pick a PC that can stay on. That is the real
barrier to this kit, and it is worth saying plainly: it is not a documentation
problem, it is a hardware problem. If you do not own a machine you can leave
running, the rest of the instructions do not help you.

There are two ways around it. Both were verified against current documentation
rather than remembered, and both have honest caveats listed.

**Both require a Claude Pro or Max subscription.** The free Claude.ai plan does
not include Claude Code, on any surface. That is the one cost you cannot avoid.

---

## Option 1: Claude Code on the web. No machine at all.

Claude Code runs in a browser at [claude.ai/code](https://claude.ai/code), with
no local install. Sessions get a real environment: a shell, Node, Python, git,
and the GitHub CLI. It can clone your repo, run the tools in this kit, commit,
and push.

Crucially it also has **Routines**, which are saved configurations that run
**on a schedule, unattended**, without a browser tab open. That is what makes a
standing manager possible with no computer: the hourly league watch and the
pre-kickoff lineup pass become routines.

### Setting it up

1. **Make your private copy** of this repo on GitHub, as `START-HERE.md`
   describes. You need a GitHub account but not a local clone.
2. **Connect GitHub to Claude.** At claude.ai/code, install the Claude GitHub
   App on your copy of the repo. This is a one time authorisation.
3. **Start a session** against that repo and paste the setup message from
   `START-HERE.md`. The interview runs exactly as it would locally.
4. **Store your league credentials.** On Pro and Max, use the environment's
   **API credentials** feature rather than plain environment variables. API
   credentials stay outside the session and are injected into requests, so the
   session never sees the raw value.
5. **Create routines** for the recurring work: an hourly league watch, a pass
   before each kickoff window, and a Tuesday post-week pass. The agent will
   offer to set these up; tell it you are on the web and want routines rather
   than in-session reminders.

### Caveats, stated honestly

- **Desktop browser is what is documented.** Whether claude.ai/code works well
  in a phone browser is not stated in the docs, so do not count on running the
  setup from a phone. The Claude mobile app can monitor and message sessions
  once they exist, which is a different and well supported thing.
- **Plain environment variables are readable by anyone sharing that cloud
  environment.** If you are the only person using yours, that is nobody. But
  ESPN cookies are full account access, so prefer the API credentials mechanism,
  and never put them in a shared environment.
- **Routines have a daily run cap** per account, and sessions draw on the same
  rate limits as the rest of your Claude usage. A standing manager is light, but
  it is not free of limits.
- Team and Enterprise plans do not yet have the API credentials feature.

---

## Option 2: A free cloud machine you own

If you want the full local experience, including the browser pane and writes,
rent nothing and use a permanently free virtual machine. Your credentials stay
on a machine you control, which is the main advantage over anyone hosting this
for you.

### What Oracle's Always Free tier actually includes

Verified from Oracle's own documentation:

- **2 OCPUs and 12 GB of memory** on Ampere A1 (ARM), allocatable flexibly
- **200 GB** of block volume storage
- **10 TB per month** of outbound data transfer
- Free **"for the life of the account"**, not a trial

Claude Code's stated requirements are 4 GB or more of RAM and an x64 or ARM64
processor, on Ubuntu 20.04 or newer. A 12 GB ARM instance clears that
comfortably.

### Setting it up

1. **Create an Oracle Cloud account.** A credit card is required for identity
   verification even on the free tier.
2. **Create an Ampere A1 (VM.Standard.A1.Flex) instance** running Ubuntu 22.04,
   with 2 OCPUs and 12 GB of memory. Save the SSH key it generates.
3. **SSH in** from any device, including a phone with an SSH client.
4. **Install Claude Code:**

   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   claude --version
   ```

5. **Log in** by running `claude` and following the browser prompt.
6. **Clone your private copy** of this repo and paste the setup message from
   `START-HERE.md`.
7. **Keep it alive** with `tmux` or `screen` so the session survives you closing
   the SSH connection:

   ```bash
   sudo apt install tmux
   tmux new -s manager
   claude
   ```

   Detach with `Ctrl-b` then `d`. Reattach later with `tmux attach -t manager`.

### Caveats, stated honestly

- **ARM capacity is frequently unavailable** in busy Oracle regions, and people
  commonly report having to retry over several days to get an A1 instance. This
  is the single most likely reason this option stalls. Free tier micro instances
  (1 GB) are usually available but are **below Claude Code's stated 4 GB
  requirement**, so they are not a substitute.
- A credit card is required at signup. Oracle states Always Free resources are
  not charged, but read their current terms yourself before entering it.
- You are administering a Linux server. Not difficult, but it is a real thing
  you now own, including its updates.

---

## What neither option changes

- **Trades are still never sent by the agent.** That is a hard limit of the kit,
  not a setting.
- You still hold your own credentials. Nobody here hosts anything for you, and
  no version of this kit asks you to hand your league login to a stranger.

## Which to pick

If you want it working today with the least fuss, **option 1**. Routines cover
the unattended work and there is nothing to administer.

If you want the full local behaviour, including the browser pane for ESPN writes,
and you are comfortable with a terminal, **option 2**, accepting that getting an
ARM instance may take a few attempts.
