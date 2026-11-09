// lib/data.mjs forwardProjection(): which ESPN season split is the rest of
// season. Offline, synthetic players only.
//
//   node tools/projection-split-test.mjs
import assert from "node:assert/strict";
import { forwardProjection, FFL_PROJ } from "../lib/data.mjs";

const S = 2026;
const stat = (src, split, total, season = S, period = 0) => ({ statSourceId: src, statSplitTypeId: split, scoringPeriodId: period, seasonId: season, appliedTotal: total });
const p = (stats) => ({ stats });
const R = FFL_PROJ.REST, F = FFL_PROJ.FULL;
let n = 0;
const eq = (a, b, msg) => { n++; assert.deepEqual(a, b, msg); };

eq(forwardProjection(p([stat(1, F, 315), stat(1, R, 209)]), S), { total: 209, basis: "rest of season" }, "split 0 is the rest of season, never the full season split 2");
eq(forwardProjection(p([stat(1, R, 200)]), S), { total: 200, basis: "preseason" }, "split 0 alone before week one is the preseason total");
eq(forwardProjection(p([stat(1, R, 120), stat(0, 0, 40)]), S).basis, "rest of season", "banked points mean the season has started");
eq(forwardProjection(p([stat(1, F, 315)]), S), { total: 0, basis: "missing" }, "a full season total alone is not a forward projection");
eq(forwardProjection(p([stat(1, R, 0), stat(1, F, 0)]), S), { total: 0, basis: "rest of season" }, "a real zero is not missing");
eq(forwardProjection(p([stat(1, R, 150, 2025)]), S).basis, "missing", "last season's projection is not this season's");
eq(forwardProjection(p([stat(1, R, 9, S, 7)]), S).basis, "missing", "a weekly split is not the season split");
eq(forwardProjection(p([stat(0, R, 150)]), S).basis, "missing", "actuals are not a projection");
eq(forwardProjection(null, S), { total: 0, basis: "missing" }, "null player");
console.log(`projection-split-test: ok (${n} checks)`);
