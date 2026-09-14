# Measure before trusting a signal

Any metric the agent acts on should be tested before it is believed, and the
test should be written down before the data is looked at. This applies to
anything that drives a decision: a waiver bar, a start and sit rule, a trade
heuristic, a streaming rule for defenses and kickers.

## The method

1. **Write the claim and its refutation first.** "Target share predicts the next
   four weeks of scoring for receivers, and is refuted if the correlation falls
   below 0.20 or flips sign in more than one season." A claim with no stated
   way to fail is not a claim.
2. **Hold out a season.** Fit and explore on everything except the most recent
   complete season, then report that season separately. It is the only honest
   check, and it is free.
3. **Report per season, never pooled.** A relationship that holds in four
   seasons out of five is a finding. One that holds in two is noise wearing a
   number, and pooling hides exactly that difference.
4. **Refuse to report a verdict on thin data.** If the sample is too small,
   print INSUFFICIENT rather than a conclusion. A confident answer computed over
   nothing is the most expensive output a tool can produce.

## Where the data is

`tools/nflverse-cheatsheet.md` covers the free weekly files. `stats_player_week`
carries targets, carries, target share, air yards share, WOPR and EPA back to
1999, at roughly 8 MB a season. That is enough to test most fantasy heuristics
properly for the cost of a download.

## What this catches

Usage settles week to week long before scoring does, which is why usage based
signals tend to beat "who scored a lot last week". But not all of them survive
scrutiny, and the failures are specific rather than general:

- Air yards based metrics look strong on recent seasons and collapse on older
  ones, because air yards were not tracked before roughly 2008. That is a data
  artifact, not a signal, and only a multi era test reveals it.
- Metrics built on receiving usage rank running backs badly in older eras, when
  backs caught far fewer passes. A rule tuned on one era can be quietly wrong
  in another.

Both of those are invisible in a single season sample and obvious across
several. Neither would have been caught by checking whether the code ran.

## The discipline that matters most

Do not edit the hypothesis after seeing the result. If a claim is refuted, take
it out of the boards rather than leaving it in quietly, and record that it was
refuted. A metric that has failed its own test and is still being used is worse
than no metric, because it carries the authority of having been measured.
