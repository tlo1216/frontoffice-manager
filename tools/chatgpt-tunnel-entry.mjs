// Read-only launcher for the ESPN MCP server behind an OpenAI Secure MCP Tunnel.
//
// The tunnel exposes your league to ChatGPT. This wrapper starts the same MCP
// server your agent uses, but forces WRITES_ENABLED=false for this process
// only, so ChatGPT can read the league and preview moves and can never execute
// one. Your agent's own .env and its write access are untouched.
//
// Usage (the tunnel profile runs this for you):
//   node tools/chatgpt-tunnel-entry.mjs
//
// Point it at your server with either:
//   ESPN_MCP_DIR=C:/dev/espn-fantasy-mcp     (the repo root)
//   ESPN_MCP=C:/dev/espn-fantasy-mcp/dist/index.js   (the built entry point)
// If neither is set it looks for ../espn-fantasy-mcp next to this repo.
//
// The ESPN cookies still come from the server's own .env; override the path
// with ESPN_MCP_ENV if it lives somewhere else.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function resolveEntry() {
  if (process.env.ESPN_MCP) return path.resolve(process.env.ESPN_MCP);
  const dir = process.env.ESPN_MCP_DIR
    ? path.resolve(process.env.ESPN_MCP_DIR)
    : path.resolve(repoRoot, "..", "espn-fantasy-mcp");
  return path.join(dir, "dist", "index.js");
}

const entry = resolveEntry();
if (!existsSync(entry)) {
  console.error(
    `[chatgpt-tunnel-entry] Cannot find the built ESPN MCP server at:\n  ${entry}\n\n` +
      `Set ESPN_MCP_DIR to the espn-fantasy-mcp repo root (or ESPN_MCP to its dist/index.js), ` +
      `and make sure you have run "npm install && npm run build" in it. See CHATGPT-TUNNEL.md.`
  );
  process.exit(1);
}

const serverRoot = path.resolve(path.dirname(entry), "..");
process.env.ESPN_MCP_ENV = process.env.ESPN_MCP_ENV || path.join(serverRoot, ".env");

// The one line that matters: this process can never write, whatever the .env says.
process.env.WRITES_ENABLED = "false";

// The server reads its .env relative to the working directory by default.
process.chdir(serverRoot);

await import(pathToFileURL(entry).href);
