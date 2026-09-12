# Ask ChatGPT about your league: the Secure MCP Tunnel

Optional. This connects the same ESPN MCP server your agent uses to ChatGPT, so you can ask your own league questions in the ChatGPT app on your phone: "who should I start at flex", "what did Paul's roster do this week", "preview dropping my worst bench guy". It is **read-only** by design. ChatGPT can look at everything and execute nothing.

Your agent keeps its write access. Nothing here changes how it operates.

## Is this for you

Worth it if you want your league in your pocket in the ChatGPT app without opening this repo. Skip it if you only ever talk to the agent, or if your PC does not stay on.

You need: the espn-fantasy-mcp server already installed and built (`ESPN-MCP.md`), an OpenAI Platform account you can create a tunnel in, ChatGPT with Developer mode available, and a PC that stays awake.

## How it works, in three sentences

OpenAI's `tunnel-client` runs on your PC and makes an **outbound** connection to OpenAI. ChatGPT sends tool calls back down that connection to the MCP server on your machine. Nothing on your PC is exposed to the internet: no port opened, no public URL, no OAuth server to build.

## 1. Install tunnel-client

Download the release for your machine from the [openai/tunnel-client releases page](https://github.com/openai/tunnel-client/releases/latest). On 64-bit Windows that is the `tunnel-client-v<version>-windows-amd64.zip` asset; on Apple Silicon, `darwin-arm64`.

Verify the download against `SHA256SUMS.txt` from the same release before extracting, then put the folder somewhere stable and add it to your PATH. On Windows:

```
%LOCALAPPDATA%\Programs\tunnel-client
```

Check it: `tunnel-client --version`.

Your agent can do this whole step for you, including the checksum.

## 2. Create the tunnel

Go to [Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels) and create one.

- **Name** and **Description** are both required.
- **Organizations**: your Platform org.
- **ChatGPT workspaces**: pick the workspace whose ChatGPT you will actually ask from. Getting this wrong is the most common reason the connector cannot see the tunnel later.

Copy the **tunnel ID**. It looks like `tunnel_` plus 32 hex characters. It is an identifier, not a secret.

Permissions: creating a tunnel needs Tunnels **Read + Manage**. Running one, and the key below, needs Tunnels **Read + Use**. If the Create button is missing or greyed, that is the permission you lack, not a bug.

## 3. Create a runtime API key, without showing anyone

At [Platform → API keys](https://platform.openai.com/settings/organization/api-keys) create a **runtime** key (not an admin key — the long-lived daemon should never hold an admin key).

Store it with the helper so it never lands in a chat, a log, or the repo:

```
powershell -ExecutionPolicy Bypass -File tools\set-runtime-key.ps1
```

or on macOS and Linux:

```
bash tools/set-runtime-key.sh
```

It prompts hidden, writes the key to a file only your user can read, and prints the `file:` reference for the next step. **Never paste an API key into a chat with your agent, and never let it read the key file.** A correct agent will refuse and point you here.

## 4. Create the profile

The read-only wrapper lives in this repo at `tools/chatgpt-tunnel-entry.mjs`. It starts your MCP server with writes forced off for that process only.

```
tunnel-client init --sample sample_mcp_stdio_local --profile espn-chatgpt ^
  --tunnel-id tunnel_your_id_here ^
  --mcp-command "node C:/path/to/frontoffice-manager/tools/chatgpt-tunnel-entry.mjs" ^
  --control-plane-api-key-ref "file:C:\Users\YOU\AppData\Local\tunnel-client\secrets\espn-chatgpt.key" ^
  --health-listen-addr "127.0.0.1:8787"
```

If your espn-fantasy-mcp checkout is not the sibling folder `../espn-fantasy-mcp`, set `ESPN_MCP_DIR` to its root before running, or edit the profile's command.

Validate it:

```
tunnel-client doctor --profile espn-chatgpt --explain
```

Fix anything it fails on before continuing. `--explain` tells you why each check matters.

## 5. Start it

Foreground, attached to the terminal you can watch:

```
tunnel-client run --profile espn-chatgpt
```

Health surfaces are local: `http://127.0.0.1:8787/healthz` (alive), `/readyz` (actually ready), `/ui` (status, logs, channel routing). Check `/readyz`, not just `/healthz`.

Run exactly one tunnel-client instance per tunnel ID. Two fight over the same channel.

## 6. Connect it in ChatGPT

1. **Settings → Security and login → Developer mode**, turn it on. If it is not there, your account or workspace policy does not allow it; there is no workaround, and you should not expose the server publicly instead.
2. Open [chatgpt.com/plugins](https://chatgpt.com/plugins) and press **+**.
3. Name it `ESPN` and give it a description.
4. Under **Connection**, choose **Tunnel**, then pick your tunnel or paste the tunnel ID.
5. Create it and look at the tools it discovered. You should see the read tools (`get_league`, `get_rosters`, `get_matchups`, `get_boxscore`, `get_free_agents`, `get_transactions`, `snapshot`, `optimal_lineup`) and the write-named ones (`set_lineup`, `add_free_agent`, `waiver_claim`, `move_to_ir`). The write-named tools are visible but inert: the process behind them has writes disabled, so they can only ever preview.
6. Start a chat with the connector enabled and test with something harmless:

> Read my league settings and my team's roster. Make no changes.

The tunnel must be running for discovery and for every call after it.

## What stays running

`tunnel-client run` on a PC that stays awake. If the PC sleeps or the process stops, ChatGPT loses the connector until you start it again; nothing breaks, and your agent's own scheduled work is unaffected either way.

To stop it: Ctrl+C in that terminal. To start it again: the same `run` command. For a longer-lived managed process, `tunnel-client runtimes connect` supervises it instead of a bare terminal — check `tunnel-client runtimes status <alias>` before trusting it.

## Why read-only, and how it is enforced

Three independent layers, because one is not enough for a connector you talk to casually from your phone:

1. `tools/chatgpt-tunnel-entry.mjs` sets `WRITES_ENABLED=false` in the process it launches, after loading the `.env` and before the server starts. The `.env` on disk is never modified.
2. The MCP server refuses to execute a write when that flag is off, whatever arguments it gets — `dry_run: false` included.
3. The startup banner says `writes disabled (dry run only)`. If you ever see `writes ENABLED` in the tunnel's logs, stop the tunnel; the wrapper was bypassed.

Your agent runs the same server from its own directory with its own flag, so it keeps whatever write access you gave it in `AUTONOMY.md`.

## Honest limits

- ChatGPT sees your whole league through this: rosters, transactions, scores, and whatever your cookies can read. Only connect a workspace you control.
- It is your PC and your key. If the machine is off, the connector is dead.
- Developer mode and tunnels depend on account and workspace policy, and OpenAI can change both. If Tunnel is not offered as a connection type, the honest answer is that the capability is not enabled for your account — do not publish the MCP server to the internet as a substitute.
- The write-named tools appearing in ChatGPT's tool list confuses people. They are inert here, but if that bothers you, say so and your agent can hide them behind a read-only build.
