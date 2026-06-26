/*
 * Last War: Survival — Server 1115 end-of-Season-5 Transfer Surge seat estimator.
 *
 * UNOFFICIAL community estimator. In game, the real seat tier —
 *   Follower = White, Pioneer = Blue, Contributor = Purple, Elite = Gold —
 * is set by a commander's "Individual Score": peak power across the top 15
 * heroes, top 3 squads, buildings, tech, the Drone and the Overlord, measured
 * against thresholds that are dynamic and undisclosed. We can only see THP and
 * Squad 1, so this is a PROXY, calibrated against the UP7 roster so the
 * alliance's strongest commander (MML) lands at the top of Blue, pushing the
 * Purple line.
 *
 * Works in the browser (attaches window.SeatEstimator) and in Node
 * (module.exports), so the website and the unit test share one source of truth.
 *
 * Inputs are in MILLIONS:
 *   thpM    — Total Hero Power, in millions (required)
 *   squad1M — Squad 1 power, in millions (optional)
 *
 * Score (THP-millions scale):
 *   with Squad 1:  score = THP + 0.25 * Squad1
 *   no Squad 1:    score = 1.06 * THP    (small uplift only; confidence Low)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SeatEstimator = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var DISCLAIMER = 'Unofficial estimator. Calibrated for Server 1115 end-of-Season-5 using alliance roster assumptions. ' +
    'Actual transfer seat may vary when the event opens.';

  // Seat bands keyed on the score: min <= score < max. Calibrated to the live
  // roster (see scripts/model-transfer-seats.js) so MML tops Blue at ~191.5,
  // 3.5 below the Purple line.
  var SEAT_BANDS = [
    { colour: 'White',  role: 'Follower',    min: -Infinity, max: 146.7 },
    { colour: 'Blue',   role: 'Pioneer',     min: 146.7,     max: 195 },
    { colour: 'Purple', role: 'Contributor', min: 195,       max: 210 },
    { colour: 'Gold',   role: 'Elite',       min: 210,       max: Infinity }
  ];

  var BOUNDARIES = [146.7, 195, 210];

  // Score weights (THP-millions scale).
  var SQUAD1_WEIGHT = 0.25;   // weight on each point of Squad 1 power
  var MISSING_UPLIFT = 1.06;  // THP-only uplift when Squad 1 is unknown

  function estimateSeat(thpM, squad1M) {
    if (thpM == null || !isFinite(thpM)) {
      return {
        rawScore: null, adjustedScore: null, seat: null, colour: null, role: null,
        confidence: null, squadRatio: null, adjustment: 0, flags: [], estimated: false,
        explanation: 'No THP recorded — cannot estimate a seat.'
      };
    }

    var hasSquad = squad1M != null && isFinite(squad1M) && squad1M > 0;
    var flags = [];
    var estimated = !hasSquad;

    // Score. THP carries the weight; Squad 1 nudges it. When Squad 1 is missing
    // we apply only a small THP uplift and keep confidence Low.
    var rawScore;
    if (hasSquad) {
      rawScore = thpM + SQUAD1_WEIGHT * squad1M;
    } else {
      rawScore = MISSING_UPLIFT * thpM;
      flags.push('Estimated from THP (no Squad 1)');
    }
    rawScore = Math.round(rawScore * 100) / 100;

    // Squad/THP ratio is kept for information only — at this weighting Squad 1
    // barely moves the score, so there's no build-balance penalty.
    var squadRatio = (hasSquad && thpM > 0) ? Math.round((squad1M / thpM) * 10000) / 10000 : null;
    var adjustment = 0;
    var adjustedScore = rawScore;

    // Seat band
    var band = SEAT_BANDS.find(function (b) { return adjustedScore >= b.min && adjustedScore < b.max; });
    if (!band) band = SEAT_BANDS[SEAT_BANDS.length - 1];
    var seat = band.colour + ' / ' + band.role;

    // Confidence — Low whenever the score is a THP-only estimate (no Squad 1);
    // otherwise by distance to the nearest band boundary.
    var confidence;
    if (estimated) {
      confidence = 'Low';
    } else {
      var distance = Math.min.apply(null, BOUNDARIES.map(function (b) { return Math.abs(adjustedScore - b); }));
      if (distance < 10) confidence = 'Borderline';
      else if (distance < 25) confidence = 'Medium';
      else confidence = 'High';
    }

    // Human-readable explanation
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    var base = estimated
      ? 'THP ' + r2(thpM) + 'M, no Squad 1 → THP-only estimate (' + MISSING_UPLIFT + ' × THP)'
      : 'THP ' + r2(thpM) + 'M + ' + SQUAD1_WEIGHT + ' × Squad 1 ' + r2(squad1M) + 'M';
    var explanation = base + ' → score ' + r2(adjustedScore) + ' = ' + seat + ' · ' + confidence + ' confidence';

    return {
      rawScore: rawScore,
      adjustedScore: adjustedScore,
      seat: seat,
      colour: band.colour,
      role: band.role,
      confidence: confidence,
      squadRatio: squadRatio,
      adjustment: adjustment,
      flags: flags,
      estimated: estimated,
      explanation: explanation
    };
  }

  return { estimateSeat: estimateSeat, SEAT_BANDS: SEAT_BANDS, BOUNDARIES: BOUNDARIES, DISCLAIMER: DISCLAIMER };
});
