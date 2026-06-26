/*
 * Last War: Survival — Server 1115 end-of-Season-5 transfer seat estimator.
 *
 * UNOFFICIAL community estimator. Actual seat colour may vary when the event
 * opens because transfer scores and thresholds are dynamic.
 *
 * Works in the browser (attaches window.SeatEstimator) and in Node
 * (module.exports), so the website and the unit test share one source of truth.
 *
 * Inputs are in MILLIONS:
 *   thpM    — Total Hero Power, in millions (required)
 *   squad1M — Squad 1 power, in millions (optional)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SeatEstimator = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var DISCLAIMER = 'Unofficial community estimator for Server 1115 end-of-Season-5 transfer. ' +
    'Actual seat colour may vary when the event opens because transfer scores and thresholds are dynamic.';

  // Seat bands keyed on the adjusted score: min <= score < max.
  var SEAT_BANDS = [
    { colour: 'White',  role: 'Follower',    min: -Infinity, max: 170 },
    { colour: 'Blue',   role: 'Pioneer',     min: 170,       max: 185 },
    { colour: 'Purple', role: 'Contributor', min: 185,       max: 210 },
    { colour: 'Gold',   role: 'Elite',       min: 210,       max: Infinity }
  ];

  var BOUNDARIES = [170, 185, 210];

  function estimateSeat(thpM, squad1M) {
    if (thpM == null || !isFinite(thpM)) {
      return {
        rawScore: null, adjustedScore: null, seat: null, colour: null, role: null,
        confidence: null, squadRatio: null, adjustment: 0, flags: [],
        explanation: 'No THP recorded — cannot estimate a seat.'
      };
    }

    var hasSquad = squad1M != null && isFinite(squad1M) && squad1M > 0;
    var flags = [];
    var estimated = !hasSquad;

    // Score formula. Calibrated for Server 1115 (the previous transfer had only
    // ~8 Blue seats, so the bar is high and most of the alliance lands White).
    // THP carries most of the weight; Squad 1 matters but is not over-weighted.
    // When Squad 1 is missing, fall back to a THP-only estimate (1.25 × THP)
    // and keep confidence Low.
    var rawScore;
    var squadRatio = null;
    var adjustment = 0;
    var balanceFlag = null;
    if (hasSquad) {
      rawScore = (0.75 * thpM) + (1.6 * squad1M);

      // Balance adjustment based on the Squad 1 / THP ratio.
      if (thpM > 0) {
        var ratio = squad1M / thpM;
        squadRatio = Math.round(ratio * 10000) / 10000;
        if (ratio >= 0.40) { balanceFlag = 'Glass cannon build'; adjustment = -15; }
        else if (ratio >= 0.35) { balanceFlag = 'Squad-heavy build'; adjustment = -10; }
        else if (ratio <= 0.22) { balanceFlag = 'Broad but underpowered main squad'; adjustment = -10; }
        if (balanceFlag) flags.push(balanceFlag);
      }
    } else {
      rawScore = 1.25 * thpM;
      flags.push('Estimated from THP (no Squad 1)');
    }

    // Round away binary-float dust so scores compare/display cleanly.
    rawScore = Math.round(rawScore * 100) / 100;
    var adjustedScore = Math.round((rawScore + adjustment) * 100) / 100;

    // Seat band
    var band = SEAT_BANDS.find(function (b) { return adjustedScore >= b.min && adjustedScore < b.max; });
    if (!band) band = SEAT_BANDS[SEAT_BANDS.length - 1];
    var seat = band.colour + ' / ' + band.role;

    // Confidence — Low whenever the score is a THP-only estimate (no Squad 1).
    var confidence;
    if (estimated) {
      confidence = 'Low';
    } else {
      var distance = Math.min.apply(null, BOUNDARIES.map(function (b) { return Math.abs(adjustedScore - b); }));
      if (distance < 10) confidence = 'Borderline';
      else if (distance < 25) confidence = 'Medium';
      else confidence = 'High';
      if (balanceFlag === 'Glass cannon build' && confidence === 'High') confidence = 'Medium';
    }

    // Human-readable explanation
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    var base = estimated
      ? 'THP ' + r2(thpM) + 'M, no Squad 1 → THP-only estimate (1.25 × THP)'
      : 'THP ' + r2(thpM) + 'M + Squad 1 ' + r2(squad1M) + 'M';
    var explanation = base + ' → raw ' + r2(rawScore);
    if (adjustment !== 0) explanation += ', ' + balanceFlag + ' ' + adjustment + ' (squad/THP ' + squadRatio + ')';
    explanation += ' → adjusted ' + r2(adjustedScore) + ' = ' + seat + ' · ' + confidence + ' confidence';

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
