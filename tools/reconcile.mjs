// Is the operation actually in the state you think it is?
//
//   node tools/reconcile.mjs              human readable report
//   node tools/reconcile.mjs --quiet      same checks, terser output for a watcher
//   node tools/reconcile.mjs --write      also save reports/reconcile.md
//   node tools/reconcile.mjs --mark TASK  log that a scheduled task ran, and exit
//
// Local compute plus one read only ESPN call. Meant to run on a schedule with
// nobody watching it, so it has to be fast and it has to fail LOUD rather than
// print a clean report over a question it never actually answered: every check
// below either finds real evidence for its answer or says plainly that it
// could not.
//
// WHY THIS EXISTS. A set of scheduled passes once vanished from the scheduler
// that ran them and nothing noticed for most of two days: their scripts stayed
// on disk, every other check read the code rather than the clock, and a weekly
// rhythm is far too slow to catch an outage measured in hours. This is the
// fast, frequent check that exists because of that.
//
// It does not ask the scheduler what it holds. A task can sit in a scheduler
// and still never fire (paused, a broken cron, a runner that never picks it
// up), and a task that keeps firing on time is present for every purpose that
// matters, whatever the scheduler says. So SCHEDULE infers from the evidence of
// runs: league/pass-log.csv, written by tools/kickoff-guard.mjs --task and by
// --mark here.
//
// FIVE QUESTIONS, EACH ANSWERED FROM ITS OWN SOURCE OF TRUTH:
//   1. SCHEDULE       has every recurring task in league/expected-schedule.json
//                      logged a run since it was last due?
//   2. LOCK COVERAGE  does every upcoming kickoff with your starters have a pass?
//   3. CONSTANTS      does every measured number still match its measurement?
//   4. RULES MIRROR   does memory still match rules/?
//   5. PENDING MOVES  is anything sent to ESPN stuck past when it should have
//                      cleared?
//
// A check with nothing to check (no expected schedule yet) prints [skip] with
// the reason, never [ok].

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO, espnConfig, espnHeaders, nflSeason } from "../lib/data.mjs";
import { getJSON } from "../lib/net.mjs";
import { loadSchedule, lastFiringAtOrBefore, readPassLog, appendPassLog } from "../lib/kickoffs.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const QUIET = argv.includes("--quiet");
const doWrite = argv.includes("--write");
const NOW = Date.now();

// --mark: the proof of life for a task that is not a lineup pass. One row, the
// task's id, and nothing else, so SCHEDULE below has evidence it ran.
const MARK = arg("mark", "");
if (argv.includes("--mark")) {
  if (!MARK || MARK.startsWith("--")) { console.error("--mark needs a taskId"); process.exit(2); }
  appendPassLog([new Date(NOW).toISOString(), "", "", "", "RAN", "", MARK]);
  console.log(`logged a run of ${MARK}`);
  process.exit(0);
}

const fails = [];              // { code, msg }, one entry per concrete problem
const summaries = [];          // one "[ok]" / "[skip]" / "[FAIL]" line per check
const fail = (code, msg) => fails.push({ code, msg });

// --- judgement call numbers, chosen and explained here -------------------------

// How overdue a task's most recent expected firing has to be, past its own cron
// time, before it counts as MISSING rather than just running a little late.
// CHOSEN. Dispatch jitter from a desktop scheduler is minutes; a CI scheduler
// under load can hold a run back far longer. Ninety minutes clears both, so a
// task still silent at that point is not jitter, it is the failure this exists
// to catch.
const GRACE_MIN = 90;

// How far back to look for a cron's most recent due firing. CHOSEN. Every
// recurring pass fires at least weekly; forty five days covers six firings of
// the slowest even if several were missed in a row. A date-pinned holiday pass
// sits outside this window most of the year, which is correct: outside its week
// it is not due, so there is nothing to be missing.
const LOOKBACK_DAYS = 45;

// Subprocess and network budgets. Each is its own FAIL rather than an unbounded
// wait, because a check that hangs looks like nothing is running, while one that
// reports "could not finish in time" names the problem.
const LOCK_COVERAGE_TIMEOUT_MS = 30000;
const CONSTANTS_TIMEOUT_MS = 10000;
const MIRROR_TIMEOUT_MS = 10000;
const PENDING_TIMEOUT_MS = 8000;

/** Run a node tool with a hard deadline; a timeout comes back as timedOut. */
function runNode(args, timeoutMs) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const child = spawn(process.execPath, args, { cwd: REPO });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* best effort */ }
      resolve({ status: null, out, err, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ status: code, out, err, timedOut: false }); });
    child.on("error", (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ status: null, out, err: String(e), timedOut: false }); });
  });
}

// ============================= 1. SCHEDULE ===================================

let sched = null;
function checkSchedule() {
  try { sched = loadSchedule(); }
  catch (e) { fail("SCHEDULE:config", e.message); summaries.push("[FAIL] SCHEDULE: the expected schedule cannot be read"); return; }
  if (!sched) {
    summaries.push("[skip] SCHEDULE: no league/expected-schedule.json, so there is no schedule to check (see league/expected-schedule.example.json)");
    return;
  }

  // Latest logged run per task, from the pass log. A run is a run whatever its
  // verdict: a LATE pass still fired, and lateness is kickoff-guard's report.
  const lastRun = new Map();
  for (const r of readPassLog()) {
    if (!r.task) continue;
    const at = Date.parse(r.ran_utc);
    if (!Number.isFinite(at)) continue;
    if (!lastRun.has(r.task) || at > lastRun.get(r.task)) lastRun.set(r.task, at);
  }

  let missing = 0, notDue = 0;
  for (const t of sched.tasks) {
    const due = lastFiringAtOrBefore(t.fields, new Date(NOW - GRACE_MIN * 60000), LOOKBACK_DAYS, sched.timezone);
    if (!due) { notDue++; continue; }
    const ran = lastRun.get(t.taskId);
    // A run counts for this firing if it landed after the firing was due, less
    // a little early-start slack for a scheduler that fires ahead of the minute.
    if (!ran || ran < due.getTime() - 5 * 60000) {
      missing++;
      const overdueH = ((NOW - due.getTime()) / 3600000).toFixed(1);
      fail(`SCHEDULE:${t.taskId}`,
        `${t.taskId} has not run since it was due: cron "${t.cron}" (${sched.timezone}) was due at ${due.toISOString()}, ` +
        `${overdueH}h ago, past the ${GRACE_MIN} minute grace. Last logged run: ` +
        `${ran ? new Date(ran).toISOString() : "never"}. Either the scheduler no longer holds it, or it runs without logging itself.`);
    }
  }
  summaries.push(missing
    ? `[FAIL] SCHEDULE: ${missing} of ${sched.tasks.length - notDue} due task(s) have no run logged since they were due`
    : `[ok] SCHEDULE: ${sched.tasks.length - notDue}/${sched.tasks.length} task(s) due and logged on time (${notDue} not due yet)`);
}

// ============================= 2. LOCK COVERAGE ===============================
// The upcoming week only. The whole-season view walks every slot of the year
// and belongs on a slower cadence than a check meant to run every few minutes.

async function checkLockCoverage() {
  if (!sched) { summaries.push("[skip] LOCK_COVERAGE: no expected schedule to check kickoffs against"); return; }
  const r = await runNode([path.join(REPO, "tools/lock-coverage.mjs")], LOCK_COVERAGE_TIMEOUT_MS);
  if (r.timedOut) {
    fail("LOCK_COVERAGE:timeout", `tools/lock-coverage.mjs did not finish within ${LOCK_COVERAGE_TIMEOUT_MS / 1000}s. Re-run by hand: node tools/lock-coverage.mjs`);
    summaries.push("[FAIL] LOCK_COVERAGE: timed out"); return;
  }
  if (r.status === 0) {
    const rows = (r.out.match(/^\| \d+ \|/gm) || []).length;
    summaries.push(`[ok] LOCK_COVERAGE: every upcoming kickoff with your starters has a pass inside the window (${rows} slot(s))`);
    return;
  }
  const line = r.out.split(/\r?\n/).find((l) => l.startsWith("FAIL:")) || (r.err || "").trim().split(/\r?\n/)[0] || `exited ${r.status}`;
  fail("LOCK_COVERAGE", line.slice(0, 300));
  summaries.push("[FAIL] LOCK_COVERAGE: see the FAIL block");
}

// ============================= 3. CONSTANTS ===================================

async function checkConstants() {
  const r = await runNode([path.join(REPO, "tools/constants-audit.mjs")], CONSTANTS_TIMEOUT_MS);
  if (r.timedOut) { fail("CONSTANTS:timeout", `tools/constants-audit.mjs did not finish within ${CONSTANTS_TIMEOUT_MS / 1000}s`); summaries.push("[FAIL] CONSTANTS: timed out"); return; }
  if (r.status === 0) { summaries.push("[ok] CONSTANTS: every measured number matches its measurement, nothing undeclared"); return; }
  const bad = ((r.out || "").split("## Problems")[1] || "").split(/\r?\n/).filter((l) => l.startsWith("- "));
  fail("CONSTANTS", `${bad.length} problem(s). First: ${(bad[0] || (r.err || "").trim() || "run node tools/constants-audit.mjs").replace(/^- /, "").slice(0, 220)}`);
  summaries.push(`[FAIL] CONSTANTS: ${bad.length} problem(s)`);
}

// ============================= 4. RULES MIRROR ================================

async function checkRulesMirror() {
  const r = await runNode([path.join(REPO, "tools/check-mirror.mjs")], MIRROR_TIMEOUT_MS);
  if (r.timedOut) { fail("RULES_MIRROR:timeout", "tools/check-mirror.mjs did not finish in time"); summaries.push("[FAIL] RULES_MIRROR: timed out"); return; }
  if (r.status === 0) { summaries.push(`[ok] RULES_MIRROR: ${(r.out || "").trim().replace(/^ok:\s*/, "")}`); return; }
  const first = (r.err || r.out || "").trim().split(/\r?\n/).slice(0, 2).join(" ");
  fail("RULES_MIRROR", first.slice(0, 300));
  summaries.push("[FAIL] RULES_MIRROR: memory and rules/ have drifted");
}

// ============================= 5. PENDING MOVES ===============================
//
// A claim or trade is stale when ESPN's own clock says it should already have
// resolved and it has not: a WAIVER past its processDate, or a TRADE_PROPOSAL
// past its expirationDate, still PENDING. Both fields come straight off the raw
// mPendingTransactions view, which the MCP's get_pending tool does not carry,
// so this reads ESPN directly.

async function checkPendingMoves() {
  const { leagueId, sport, season } = espnConfig();
  if (!leagueId) { fail("PENDING:config", "ESPN_LEAGUE_ID is not set"); summaries.push("[FAIL] PENDING_MOVES: no league configured"); return; }
  let headers;
  try { headers = espnHeaders(); }
  catch (e) { fail("PENDING:auth", e.message); summaries.push("[FAIL] PENDING_MOVES: no ESPN credentials"); return; }
  // Football's season is the year it starts, which the calendar gets wrong in
  // January; other sports take ESPN_SEASON as configured.
  const yr = sport === "ffl" ? nflSeason(new Date(NOW)) : season;
  const res = await getJSON(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${yr}/segments/0/leagues/${leagueId}` +
    `?view=mPendingTransactions&nocache=${Date.now()}`, { headers, timeoutMs: PENDING_TIMEOUT_MS, retries: 1 });
  if (!res.ok) { fail("PENDING:read", `could not read pending transactions (${res.fatal || res.soft})`); summaries.push("[FAIL] PENDING_MOVES: could not read the league"); return; }
  const pend = res.json.pendingTransactions || [];
  let stale = 0;
  for (const t of pend) {
    if (t.type === "TRADE_PROPOSAL" && t.status === "PENDING" && t.expirationDate && t.expirationDate < NOW) {
      stale++;
      fail(`PENDING:${String(t.id).slice(0, 8)}`, `trade proposal ${t.id} expired ${((NOW - t.expirationDate) / 3600000).toFixed(1)}h ago and is still PENDING`);
    }
    if (t.type === "WAIVER" && t.status === "PENDING" && t.processDate && t.processDate < NOW) {
      stale++;
      fail(`PENDING:${String(t.id).slice(0, 8)}`, `waiver claim ${t.id} was due to process ${((NOW - t.processDate) / 3600000).toFixed(1)}h ago and is still PENDING, ` +
        "so the waiver run that should have cleared it did not");
    }
  }
  summaries.push(stale ? `[FAIL] PENDING_MOVES: ${stale} stale of ${pend.length} pending`
    : `[ok] PENDING_MOVES: ${pend.length} pending claim/trade(s), none stale`);
}

// =============================== run everything ===============================

async function main() {
  checkSchedule();
  await Promise.all([checkLockCoverage(), checkConstants(), checkRulesMirror(), checkPendingMoves()]);

  const order = ["SCHEDULE", "LOCK_COVERAGE", "CONSTANTS", "RULES_MIRROR", "PENDING_MOVES"];
  summaries.sort((a, b) => order.findIndex((o) => a.includes(o)) - order.findIndex((o) => b.includes(o)));

  const L = [];
  const say = (s = "") => L.push(s);
  if (!QUIET) { say(`# Reconcile, ${new Date(NOW).toISOString()}`); say(`${((Date.now() - NOW) / 1000).toFixed(1)}s.`); say(""); }
  for (const s of summaries) say(s);
  if (fails.length) {
    say("");
    say(`## FAIL: ${fails.length} problem(s)`);
    for (const f of fails) say(`FAIL[${f.code}]: ${f.msg}`);
  } else if (!QUIET) {
    say("");
    say("Every check that could run passed.");
  }
  const text = L.join("\n") + "\n";
  console.log(text);
  if (doWrite) {
    fs.mkdirSync(path.join(REPO, "reports"), { recursive: true });
    fs.writeFileSync(path.join(REPO, "reports", "reconcile.md"), text);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  // Never a silent failure, including from this file's own bugs: a crash must
  // still read as a FAIL with a non zero exit, not a stack trace behind exit 0.
  console.error(`FAIL[reconcile:crash]: reconcile.mjs threw before finishing: ${(e && e.stack) || e}`);
  process.exit(1);
});
