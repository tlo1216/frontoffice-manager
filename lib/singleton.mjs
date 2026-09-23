// Refuse to start a watcher when one is already watching the same thing.
//
//   import { claimOrExit } from "../lib/singleton.mjs";
//   claimOrExit(`draft-watch-${LEAGUE}`);
//
// WHY THIS IS CODE AND NOT A RULE. Two watchers on the Minnesota draft ran for
// an hour side by side, because the second was armed after the draft time slid
// and the first was never stopped. Polling costs nothing, so neither instance
// looked wrong; the waste is that one event would have woken the session twice,
// and the waking is the only expensive part of a watcher.
//
// A note in a runbook would not have caught that, because the mistake is made by
// whoever is tired at eleven at night, which is exactly when a runbook is not
// being read. So the watcher refuses instead.
//
// HOW IT WORKS. Each live watcher touches a heartbeat file every poll. A new
// instance checks for a heartbeat younger than STALE_MS and exits if it finds
// one. If the old process died, its heartbeat goes stale within a couple of
// minutes and the next start succeeds, so a crash never locks us out
// permanently. No PID checks, which are unreliable across shells on Windows.

import fs from "node:fs";
import path from "node:path";
import { REPO } from "./data.mjs";

const DIR = path.join(REPO, "league", ".watchers");
const STALE_MS = 3 * 60 * 1000;

/**
 * Claim exclusive ownership of a watcher name, or exit quietly.
 * Returns a beat() the caller must invoke each poll to keep the claim alive.
 */
export function claimOrExit(name, { quiet = false } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${name}.beat`);
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age < STALE_MS) {
      if (!quiet) console.log(`${new Date().toLocaleTimeString()} already watching ${name}, started ${(age / 1000).toFixed(0)}s ago. Not starting a second one.`);
      process.exit(0);
    }
  } catch { /* no heartbeat, the name is free */ }

  const beat = () => { try { fs.writeFileSync(file, String(Date.now())); } catch { /* not worth failing a watch over */ } };
  beat();
  const clear = () => { try { fs.unlinkSync(file); } catch { /* already gone */ } };
  process.on("exit", clear);
  process.on("SIGINT", () => { clear(); process.exit(0); });
  process.on("SIGTERM", () => { clear(); process.exit(0); });
  return beat;
}
