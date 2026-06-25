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
    { colour: 'Blue',   role: 'Pioneer',     min: 170,       max: 245 },
    { colour: 'Purple', role: 'Contributor', min: 245,       max: 330 },
    { colour: 'Gold',   role: 'Elite',       min: 330,       max: Infinity }
  ];

  var BOUNDARIES = [170, 245, 330];

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

    // When Squad 1 is missing, estimate it as 30% of THP so the member is no
    // longer scored on the (much lower) THP-only scale. Confidence stays Low.
    var estimated = !hasSquad;
    var estimatedSquad1M = null;
    var effectiveSquad1M;
    if (hasSquad) {
      effectiveSquad1M = squad1M;
    } else {
      effectiveSquad1M = 0.30 * thpM;
      estimatedSquad1M = effectiveSquad1M;
      flags.push('Squad 1 estimated from THP');
    }

    // Core formula (always uses a Squad 1 value, real or estimated)
    var rawScore = (0.75 * thpM) + (3 * effectiveSquad1M);

    // Balance adjustment (estimated ratio is exactly 0.30, so it never trips)
    var squadRatio = null;
    var adjustment = 0;
    var balanceFlag = null;
    if (thpM > 0) {
      var ratio = effectiveSquad1M / thpM;
      squadRatio = Math.round(ratio * 10000) / 10000;
      if (ratio >= 0.40) { balanceFlag = 'Glass cannon build'; adjustment = -25; }
      else if (ratio >= 0.35) { balanceFlag = 'Squad-heavy build'; adjustment = -15; }
      else if (ratio <= 0.22) { balanceFlag = 'Broad but underpowered main squad'; adjustment = -10; }
      if (balanceFlag) flags.push(balanceFlag);
    }

    var adjustedScore = rawScore + adjustment;

    // Seat band
    var band = SEAT_BANDS.find(function (b) { return adjustedScore >= b.min && adjustedScore < b.max; });
    if (!band) band = SEAT_BANDS[SEAT_BANDS.length - 1];
    var seat = band.colour + ' / ' + band.role;

    // Confidence — Low whenever Squad 1 was estimated
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
      ? 'THP ' + r2(thpM) + 'M, Squad 1 estimated ' + r2(effectiveSquad1M) + 'M (30% of THP)'
      : 'THP ' + r2(thpM) + 'M + Squad 1 ' + r2(effectiveSquad1M) + 'M';
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
      estimatedSquad1M: estimatedSquad1M,
      explanation: explanation
    };
  }

  return { estimateSeat: estimateSeat, SEAT_BANDS: SEAT_BANDS, BOUNDARIES: BOUNDARIES, DISCLAIMER: DISCLAIMER };
});
