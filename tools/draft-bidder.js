// The auction bidder, as a reviewed artifact rather than something typed into a
// console at one in the morning.
//
// HOW TO USE. Build a target map with auction-prep and market-values, then in
// the live draft room's console (or via the browser tool) evaluate this file's
// contents, then:
//
//   FrontOfficeBidder.start({ targets: {...}, roster: 16, reserve: 1 })
//   FrontOfficeBidder.status()          what it has done and whether it is alive
//   FrontOfficeBidder.stop()
//
// EVERY RULE BELOW EXISTS BECAUSE IT WAS LEARNED EXPENSIVELY. Read the reasons
// before changing any of them.
//
// 1. THE CLOCK LIVES IN A WEB WORKER.
//    Chrome throttles setInterval in a BACKGROUND TAB to roughly once a minute.
//    An in-page bidder therefore looks perfectly alive, reports a valid interval
//    id, throws no errors, and sleeps straight through nominations. This is what
//    actually killed the Buffalo auction, where the room was blamed for
//    "freezing". Workers are not throttled the same way. Measured: 1 tick a
//    minute on setInterval against 9 ticks in 6 seconds on a worker, tab hidden
//    both times.
//
// 2. THE NOMINATED PLAYER COMES FROM .player-selected AND NOWHERE ELSE.
//    Reading "the first player-shaped text on the page" finds row one of the
//    AVAILABLE PLAYERS TABLE, not the nomination. In Buffalo that meant the
//    safety check compared against a name that had nothing to do with the
//    player being bid on, and $59 went on a backup quarterback.
//
// 3. THE NAME IS RE-READ IN THE SAME TICK AS THE CLICK.
//    The board re-renders on every pick in the league. A name read even one
//    second before the click can belong to a different player by the time the
//    click lands.
//
// 4. ESPN'S OWN MAX FIELD IS AN UPPER BOUND, ALWAYS.
//    "MANUAL OFFER (MAX $n)" already enforces one dollar per empty roster slot.
//    Honouring it makes it impossible to bid into a lineup we cannot fill.
//
// 5. POSITION NEED, NOT JUST PRICE.
//    A target price does not know we already have a quarterback. A second one is
//    real value at a position that starts one man, bought with money the empty
//    slots need. Buffalo's Caleb Williams and Minnesota's near miss on Josh
//    Allen are the same mistake.
//
// 6. A LIVE PORTFOLIO CAP, RECOMPUTED EVERY TICK.
//    A per-player ceiling cannot prevent over-concentration: three good buys can
//    still leave a roster that cannot field a legal lineup. The cap is a share
//    of what remains, so it tightens automatically as money is spent.
//
// 7. NO SELF-KILL, AND PROOF OF LIFE.
//    A bidder that expires on a timer stops silently. This one runs until told
//    to stop, and status() reports tick count so "alive" is measured rather
//    than assumed.

(function (global) {
  "use strict";

  const POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"];
  const TEAMS = "ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LV|LAC|LAR|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SF|SEA|TB|TEN|WSH|WAS|FA";

  const state = {
    worker: null, targets: {}, posOf: {}, want: null, roster: 16, reserve: 1, defaultTarget: undefined,
    ticks: 0, log: [], errors: [], stopped: true, capShare: 0.35,
  };

  /** The nominated player, read from the nomination card only. Rule 2. */
  function nominated() {
    const card = document.querySelector(".player-selected");
    if (!card) return null;
    const first = (card.innerText || "").split("\n")[0];
    const m = first.match(new RegExp("^(.*?)(" + TEAMS + ")(QB|RB|WR|TE|K|D\\/ST)$"));
    if (m) return { name: m[1], team: m[2], pos: m[3], card };
    // RULE 8. A TEAM DEFENCE PRINTS AS "Seahawks D/ST", with no team column and
    // no position column, so the strict form above never matched and every
    // defence nomination was silently skipped. Found live in Minnesota with a
    // defence slot still empty and the bidder reporting itself healthy, which
    // is the same shape of failure as every other one in this file: no error,
    // no bid, no sign anything was wrong.
    const d = first.match(/^(.+?)\s+D\/ST$/);
    if (d) return { name: first.trim(), team: d[1].trim(), pos: "D/ST", card };
    return null;
  }

  /** What we already own, by position, read from the roster panel. */
  function owned() {
    const counts = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
    let filled = 0;
    const table = [...document.querySelectorAll("table")]
      .find((t) => /POS/.test(t.innerText) && /BYE/.test(t.innerText));
    if (!table) return { counts, filled };
    for (const tr of table.querySelectorAll("tr")) {
      const cells = tr.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const slot = cells[0], who = cells[1];
      if (!who || who === "Empty" || who === "-" || slot === "POS") continue;
      filled++;
      // The panel prints the SLOT, which is not the position for a flex. Match
      // the player against our own board to learn his real position.
      const surname = who.replace(/^[A-Z]\.\s*/, "").trim().split(" ").slice(-1)[0];
      let matched = false;
      for (const name of Object.keys(state.posOf)) {
        if (name.split(" ").slice(-1)[0] === surname) {
          const pos = state.posOf[name];
          if (pos && counts[pos] !== undefined) { counts[pos]++; matched = true; }
          break;
        }
      }
      // RULE 9. THE SLOT FALLBACK RUNS PER ROW, NOT ONCE. It used to be guarded
      // by "no position counted yet", so the first filled row counted and every
      // row after it counted for nothing. A roster of five receivers then read
      // as one, and rule 5 waved through a sixth.
      if (!matched && POSITIONS.includes(slot) && counts[slot] !== undefined) counts[slot]++;
    }
    return { counts, filled };
  }

  function tick() {
    state.ticks++;
    if (state.stopped) return;
    try {
      const nom = nominated();
      if (!nom) return;
      const text = nom.card.innerText;
      if (/WINNING/.test(text)) return;                       // already ours

      let target = state.targets[nom.name];
      if (target === undefined) target = state.defaultTarget;
      if (target === undefined) return;                       // not on the board

      const { counts, filled } = owned();
      const want = state.want[nom.pos];
      if (want !== undefined && counts[nom.pos] >= want) return;   // rule 5

      const espnMax = Number((text.match(/MANUAL OFFER \(MAX \$(\d+)\)/) || [0, 0])[1]);
      if (!espnMax) return;                                   // rule 4, no number, no bid

      const slotsLeft = Math.max(1, state.roster - filled);
      const portfolioCap = Math.max(1, Math.floor(espnMax * state.capShare) + state.reserve);
      const ceiling = Math.min(target, espnMax, slotsLeft > 6 ? portfolioCap : espnMax);   // rule 6

      const button = [...nom.card.querySelectorAll("button")]
        .find((b) => /^Offer \$\d+/i.test(b.innerText.trim()) && !b.disabled);
      if (!button) return;
      const next = Number((button.innerText.match(/\d+/) || [0])[0]);
      if (!next || next > ceiling) return;

      const stillSame = nominated();                          // rule 3
      if (!stillSame || stillSame.name !== nom.name) return;

      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      state.log.push({ at: new Date().toLocaleTimeString(), bid: next, player: nom.name, pos: nom.pos, target, ceiling });
      if (state.log.length > 400) state.log.shift();
    } catch (e) {
      state.errors.push(String(e && e.message).slice(0, 160));
      if (state.errors.length > 50) state.errors.shift();
    }
  }

  const api = {
    /**
     * targets: { "Player Name": maxDollars }
     * posOf:   { "Player Name": "RB" }   so position need can be enforced
     * want:    { QB:1, RB:5, WR:5, TE:2, K:1, "D/ST":1 }
     */
    start(opts) {
      const o = opts || {};
      state.targets = o.targets || {};
      state.posOf = o.posOf || {};
      state.want = o.want || { QB: 1, RB: 5, WR: 5, TE: 2, K: 1, "D/ST": 1 };
      // RULE 10. THE ENDGAME HAS ONE PRICE. Once the budget divided by the
      // empty slots reaches a dollar, ESPN's MAX is a dollar for everybody and
      // a per player valuation has nothing left to say. defaultTarget lets the
      // board mean "anyone at a position we still need", so a whitelist that
      // went stale forty picks ago cannot leave a slot empty. It is only ever
      // safe because rule 4 still caps the bid and rule 5 still checks need.
      state.defaultTarget = o.defaultTarget == null ? undefined : o.defaultTarget;
      state.roster = o.roster || 16;
      state.reserve = o.reserve == null ? 1 : o.reserve;
      state.capShare = o.capShare == null ? 0.35 : o.capShare;
      state.ticks = 0; state.log = []; state.errors = []; state.stopped = false;

      if (state.worker) state.worker.terminate();
      // rule 1: the clock must not be a page timer
      const src = "setInterval(function(){postMessage(1)}," + (o.everyMs || 700) + ");";
      state.worker = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
      state.worker.onmessage = tick;
      return this.status();
    },
    stop() {
      state.stopped = true;
      if (state.worker) { state.worker.terminate(); state.worker = null; }
      return "stopped after " + state.ticks + " ticks";
    },
    status() {
      const { counts, filled } = owned();
      const nom = nominated();
      return {
        alive: !!state.worker && !state.stopped,
        ticks: state.ticks,
        targets: Object.keys(state.targets).length,
        rosterFilled: filled,
        byPosition: counts,
        nominated: nom ? nom.name + " (" + nom.pos + ")" : null,
        recent: state.log.slice(-6),
        errors: state.errors.slice(-3),
      };
    },
    /** Raise or lower every ceiling at once, for example when money runs short. */
    setCapShare(v) { state.capShare = v; return state.capShare; },
    log() { return state.log; },
  };

  global.FrontOfficeBidder = api;
  return api;
})(typeof window !== "undefined" ? window : globalThis);
