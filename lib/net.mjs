// One way to make an HTTP request, for anything that has to keep running.
//
// WHY THIS EXISTS. A watcher died at 2 AM on a ten second connect timeout to
// ESPN. Not a 500, not a 401, not anything the code checked for: fetch THREW,
// the rejection was unhandled, node exited 1, and the Miller Time league went
// unwatched with nothing on screen to say so. The status codes were all handled
// carefully. The network simply not answering was not.
//
// That is the same failure the rest of this repo keeps finding, in its loudest
// form. Everywhere else it was a lost input producing confident output; here it
// was a lost input producing NO output, which is worse in one specific way: a
// wrong number gets argued with, an absent watcher gets assumed to be working.
//
// THE THREE RULES.
//
// 1. A REQUEST ALWAYS RETURNS. getJSON never throws. It answers with one of
//    { ok, json }, { fatal } for something a human must fix, or { soft } for
//    anything that might work in a minute. A caller in a loop then has no way
//    to accidentally die on a blip.
//
// 2. EVERY REQUEST HAS A DEADLINE. Without an AbortSignal a hung socket can
//    park a poll loop for minutes, which looks exactly like a quiet league.
//
// 3. TRANSIENT MEANS RETRY, REFUSED MEANS STOP. A connect timeout, a reset, a
//    502 and a 429 are worth another try. A 401 is a cookie problem and retrying
//    it just burns the same failure repeatedly, so it comes back fatal.

const TRANSIENT_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_ERRORS = /timeout|timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|fetch failed/i;

export function isTransient(err) {
  const s = String((err && (err.cause?.code || err.cause?.message || err.message)) || err);
  return TRANSIENT_ERRORS.test(s);
}

/**
 * Fetch JSON without ever throwing.
 *   { ok: true, json, status }         the happy path
 *   { fatal: "..." }                   stop; a human has to do something
 *   { soft: "...", attempts }          try again later
 */
export async function getJSON(url, { headers = {}, timeoutMs = 12000, retries = 2, backoffMs = 800 } = {}) {
  let last = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);          // rule 2
    try {
      const r = await fetch(url, { headers, signal: ac.signal });
      if (r.status === 401 || r.status === 403)
        return { fatal: `ESPN answered ${r.status}, the cookies need refreshing` };  // rule 3
      if (!r.ok) {
        last = `ESPN answered ${r.status}`;
        if (!TRANSIENT_CODES.has(r.status)) return { soft: last, attempts: attempt + 1 };
      } else {
        const json = await r.json();
        return { ok: true, json, status: r.status };
      }
    } catch (e) {
      last = ac.signal.aborted ? `no answer within ${timeoutMs}ms` : String(e && e.message || e);
      if (!ac.signal.aborted && !isTransient(e)) return { soft: last, attempts: attempt + 1 };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
  }
  return { soft: last, attempts: retries + 1 };                      // rule 1
}

/** Same contract, for feeds that answer with text rather than JSON. */
export async function getText(url, opts = {}) {
  const { timeoutMs = 20000, retries = 2, backoffMs = 800, headers = {} } = opts;
  let last = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers, signal: ac.signal });
      if (r.ok) return { ok: true, text: await r.text(), status: r.status };
      last = `answered ${r.status}`;
      if (!TRANSIENT_CODES.has(r.status)) return { soft: last, attempts: attempt + 1 };
    } catch (e) {
      last = ac.signal.aborted ? `no answer within ${timeoutMs}ms` : String(e && e.message || e);
      if (!ac.signal.aborted && !isTransient(e)) return { soft: last, attempts: attempt + 1 };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
  }
  return { soft: last, attempts: retries + 1 };
}
