/*
 * scripts/model-transfer-seats.js
 *
 * Data-driven calibration harness for the Server 1115 end-of-Season-5 transfer
 * seat estimator. It scores the ACTUAL alliance roster under several candidate
 * models and prints comparison tables so we can choose a formula BEFORE
 * touching the production estimator (seat-estimator.js).
 *
 * Usage:   node scripts/model-transfer-seats.js
 *
 * Roster source: scripts/roster-data.json (a committed snapshot of the live
 * JSONBin store). thp/squad1 are raw values; this script normalises to MILLIONS.
 * To refresh the snapshot, re-run the snapshot step (see repo notes) — modelling
 * is intentionally offline/reproducible so results don't drift mid-analysis.
 *
 * All model SCORES are on the THP-in-millions scale (MML ≈ 175.8).
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ===========================================================================
// Calibration targets — what a good calibration looks like for Server 1115.
// ===========================================================================
const calibration = {
  targetBlueCount: 8,
  mmlExpected: 'top_blue_or_borderline_purple',
  majorityShouldBeWhite: true,
};

// Tuning knobs (all configurable) -------------------------------------------
const TARGET_PLAYER   = 'MML'; // anchor player
const BLUE_TOLERANCE  = 2;     // |blueCount - target| <= this  => PASS
const BORDERLINE_MARGIN = 5;   // within this many points of the Blue/Purple line = "borderline"
const NEAR_BOUNDARY   = 5;     // +/- this many points counts as "near" a boundary
const PURPLE_MAX_OK    = 4;    // Purple count considered "low / acceptable"
const GOLD_MAX_OK      = 1;    // Gold count considered "very low / acceptable"

// Missing-Squad-1 uplift must stay small (<= 1.10x THP) per calibration notes.
const MAX_MISSING_UPLIFT = 1.10;

// ===========================================================================
// Candidate models.
//   scoreWith(thpM, s1M)  -> score when Squad 1 is known
//   scoreWithout(thpM)    -> score when Squad 1 is missing (small uplift only)
//   Fixed-band models use {blueMin, purpleMin, goldMin}:
//     White < blueMin <= Blue < purpleMin <= Purple < goldMin <= Gold
// ===========================================================================
const fixedModels = [
  {
    id: 'A', name: 'Conservative',
    scoreWith:   (thp, s1) => thp + 0.25 * s1,
    scoreWithout:(thp)     => thp * 1.06,
    bands: { blueMin: 145, purpleMin: 165, goldMin: 205 },
  },
  {
    id: 'B', name: 'Moderate',
    scoreWith:   (thp, s1) => thp + 0.35 * s1,
    scoreWithout:(thp)     => thp * 1.0875,
    bands: { blueMin: 150, purpleMin: 170, goldMin: 210 },
  },
  {
    id: 'C', name: 'Strict (squad-delta)',
    // Only the EXCESS over an expected 30%-of-THP squad moves the score.
    scoreWith:   (thp, s1) => thp + 0.40 * (s1 - thp * 0.30),
    scoreWithout:(thp)     => thp * 1.00,
    bands: { blueMin: 145, purpleMin: 160, goldMin: 200 },
  },
];

// Percentile / rank-based model. Exact counts configurable here.
const percentileModel = {
  id: 'D', name: 'Percentile / rank-based',
  scoreWith:   (thp, s1) => thp + 0.30 * s1,
  scoreWithout:(thp)     => thp * 1.05,
  // ≈ top 1-2% Gold, next 3-5% Purple, next 8-12 Blue, rest White.
  goldPct: 0.02,     // top 2%
  purplePct: 0.05,   // next 5%
  blueCount: 8,      // next N players
};

// ---------------------------------------------------------------------------
// Load + normalise roster (raw -> millions).
// ---------------------------------------------------------------------------
function loadRoster() {
  const file = path.join(__dirname, 'roster-data.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.players.map(p => ({
    name: p.name,
    thpM: p.thp == null ? null : p.thp / 1e6,
    squad1M: p.squad1 == null ? null : p.squad1 / 1e6,
    hasSquad: p.squad1 != null,
  }));
}

// ---------------------------------------------------------------------------
// Scoring + seat assignment helpers.
// ---------------------------------------------------------------------------
function scoreOf(model, p) {
  if (p.thpM == null) return null; // unrated (no THP captured)
  const s = p.hasSquad ? model.scoreWith(p.thpM, p.squad1M) : model.scoreWithout(p.thpM);
  return Math.round(s * 100) / 100;
}

function seatFixed(bands, score) {
  if (score < bands.blueMin) return 'White';
  if (score < bands.purpleMin) return 'Blue';
  if (score < bands.goldMin) return 'Purple';
  return 'Gold';
}

const SEAT_ORDER = ['Gold', 'Purple', 'Blue', 'White'];

function scoreRoster(model, roster) {
  return roster
    .map(p => ({ ...p, score: scoreOf(model, p) }))
    .filter(p => p.score != null)
    .sort((a, b) => b.score - a.score);
}

// Assign seats for a fixed-band model.
function assignFixed(model, roster) {
  const scored = scoreRoster(model, roster);
  scored.forEach(p => { p.seat = seatFixed(model.bands, p.score); });
  return { scored, bands: model.bands };
}

// Assign seats for the percentile model (by rank), then derive equivalent
// score boundaries so the rest of the reporting code is uniform.
function assignPercentile(model, roster) {
  const scored = scoreRoster(model, roster);
  const N = scored.length;
  const goldN = Math.round(model.goldPct * N);
  const purpleN = Math.round(model.purplePct * N);
  const blueN = model.blueCount;
  scored.forEach((p, i) => {
    if (i < goldN) p.seat = 'Gold';
    else if (i < goldN + purpleN) p.seat = 'Purple';
    else if (i < goldN + purpleN + blueN) p.seat = 'Blue';
    else p.seat = 'White';
  });
  // Derive boundary scores (midpoints between adjacent ranks) for "near boundary".
  const mid = (i) => (i > 0 && i < N) ? (scored[i - 1].score + scored[i].score) / 2 : null;
  const bands = {
    goldMin: mid(goldN),
    purpleMin: mid(goldN + purpleN),
    blueMin: mid(goldN + purpleN + blueN),
  };
  return { scored, bands, counts: { goldN, purpleN, blueN } };
}

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------
function counts(scored) {
  const c = { Gold: 0, Purple: 0, Blue: 0, White: 0 };
  scored.forEach(p => c[p.seat]++);
  return c;
}

function fmtPlayer(p) {
  return `${p.name} — score ${p.score.toFixed(2)} — ${p.seat} — THP ${p.thpM.toFixed(1)}` +
    ` — S1 ${p.hasSquad ? p.squad1M.toFixed(1) : 'est'}`;
}

function nearBoundary(scored, boundary, label) {
  if (boundary == null) return [];
  return scored
    .filter(p => Math.abs(p.score - boundary) <= NEAR_BOUNDARY)
    .map(p => `    ${p.score.toFixed(2)}  ${p.seat.padEnd(6)} ${p.name}  (${(p.score - boundary >= 0 ? '+' : '')}${(p.score - boundary).toFixed(2)} vs ${label} ${boundary.toFixed(1)})`);
}

function assess(model, scored, bands) {
  const c = counts(scored);
  const total = scored.length;
  const mml = scored.find(p => p.name === TARGET_PLAYER);

  // Blue count near target
  const bluePass = Math.abs(c.Blue - calibration.targetBlueCount) <= BLUE_TOLERANCE;

  // MML anchor: Blue, OR Purple but within BORDERLINE_MARGIN of the Blue/Purple line.
  let mmlPass = false, mmlNote = 'n/a';
  if (mml) {
    const pm = bands.purpleMin;
    if (mml.seat === 'Blue') {
      mmlPass = true;
      mmlNote = (pm != null ? `top-end Blue (${(pm - mml.score).toFixed(1)} below Purple line)` : 'Blue');
    } else if (mml.seat === 'Purple' && pm != null && (mml.score - pm) <= BORDERLINE_MARGIN) {
      mmlPass = true;
      mmlNote = `borderline Purple (+${(mml.score - pm).toFixed(1)} into Purple)`;
    } else if (mml.seat === 'Purple') {
      mmlNote = `comfortably Purple (+${(mml.score - pm).toFixed(1)} into Purple)`;
    } else {
      mmlNote = mml.seat + ' (off-target)';
    }
  }

  // Majority White (of rated players)
  const whitePass = !calibration.majorityShouldBeWhite || c.White > total / 2;

  const purpleOk = c.Purple <= PURPLE_MAX_OK;
  const goldOk = c.Gold <= GOLD_MAX_OK;

  return { c, total, mml, bluePass, mmlPass, mmlNote, whitePass, purpleOk, goldOk };
}

function printModel(model, scored, bands, extra) {
  const a = assess(model, scored, bands);
  const c = a.c;
  console.log('\n' + '='.repeat(74));
  console.log(`MODEL ${model.id} — ${model.name}`);
  console.log('='.repeat(74));
  if (bands.blueMin != null) {
    console.log(`Bands (score): White < ${bands.blueMin.toFixed(1)} | Blue ${bands.blueMin.toFixed(1)}–${bands.purpleMin.toFixed(1)} | ` +
      `Purple ${bands.purpleMin.toFixed(1)}–${bands.goldMin.toFixed(1)} | Gold ≥ ${bands.goldMin.toFixed(1)}` +
      (extra && extra.counts ? `   [rank quotas: Gold ${extra.counts.goldN}, Purple ${extra.counts.purpleN}, Blue ${extra.counts.blueN}]` : ''));
  }
  console.log(`\nSeat counts (of ${a.total} rated):`);
  console.log(`  White:  ${c.White}`);
  console.log(`  Blue:   ${c.Blue}`);
  console.log(`  Purple: ${c.Purple}`);
  console.log(`  Gold:   ${c.Gold}`);

  const nonWhite = scored.filter(p => p.seat !== 'White');
  console.log(`\nNon-white players (${nonWhite.length}):`);
  nonWhite.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${fmtPlayer(p)}`));

  if (a.mml) {
    const distPurple = bands.purpleMin != null ? (a.mml.score - bands.purpleMin) : null;
    console.log(`\n${TARGET_PLAYER}:`);
    console.log(`  score ${a.mml.score.toFixed(2)} — predicted seat ${a.mml.seat}` +
      (distPurple != null ? ` — distance to Purple boundary ${(distPurple >= 0 ? '+' : '') + distPurple.toFixed(2)}` : '') +
      `  (${a.mmlNote})`);
  }

  console.log(`\nPlayers near each boundary (±${NEAR_BOUNDARY}):`);
  const nb = [
    ...nearBoundary(scored, bands.goldMin, 'Gold@'),
    ...nearBoundary(scored, bands.purpleMin, 'Purple@'),
    ...nearBoundary(scored, bands.blueMin, 'Blue@'),
  ];
  console.log(nb.length ? nb.join('\n') : '    (none)');

  console.log('\nAssessment:');
  const pf = b => b ? 'PASS' : 'FAIL';
  console.log(`  [${pf(a.bluePass)}] targetBlueCount  (Blue ${c.Blue}, target ${calibration.targetBlueCount} ±${BLUE_TOLERANCE})`);
  console.log(`  [${pf(a.mmlPass)}] MML anchor       (${a.mmlNote})`);
  console.log(`  [${pf(a.whitePass)}] majorityWhite    (White ${c.White}/${a.total} = ${(100 * c.White / a.total).toFixed(0)}%)`);
  console.log(`  [${pf(a.purpleOk)}] Purple low       (Purple ${c.Purple} ≤ ${PURPLE_MAX_OK})`);
  console.log(`  [${pf(a.goldOk)}] Gold very low    (Gold ${c.Gold} ≤ ${GOLD_MAX_OK})`);
  return a;
}

// ---------------------------------------------------------------------------
// Derived "Tuned" model: take the best-behaving scoring (Model A) and COMPUTE
// the band boundaries from the data so that exactly targetBlueCount players are
// Blue with MML at the very top of Blue (top-end Blue / borderline Purple).
// ---------------------------------------------------------------------------
function buildTunedModel(roster) {
  const base = fixedModels[0]; // Model A scoring
  const scored = scoreRoster(base, roster);
  const n = calibration.targetBlueCount;
  // Blue = the top n scorers. White/Blue line sits between rank n and n+1.
  const blueMin = (scored[n - 1].score + scored[n].score) / 2;
  // Purple line just above the top scorer (MML) so MML is top-end Blue.
  const top = scored[0].score;
  const purpleMin = Math.ceil(top + 3);
  const goldMin = purpleMin + 15;
  return {
    id: 'E', name: 'Tuned (Model-A scoring, data-fitted bands)',
    scoreWith: base.scoreWith, scoreWithout: base.scoreWithout,
    bands: { blueMin: Math.round(blueMin * 10) / 10, purpleMin, goldMin },
  };
}

// ===========================================================================
// Main.
// ===========================================================================
function main() {
  const roster = loadRoster();
  const rated = roster.filter(p => p.thpM != null);
  const mmlRow = roster.find(p => p.name === TARGET_PLAYER);

  console.log('TRANSFER SEAT CALIBRATION — Server 1115');
  console.log('-'.repeat(74));
  console.log(`Total players: ${roster.length}  (rated/with-THP: ${rated.length}, unrated: ${roster.length - rated.length})`);
  console.log(`With real Squad 1: ${roster.filter(p => p.hasSquad).length}`);
  console.log(`Anchor player ${TARGET_PLAYER}: THP ${mmlRow ? mmlRow.thpM.toFixed(1) : '?'}M, ` +
    `Squad 1 ${mmlRow && mmlRow.hasSquad ? mmlRow.squad1M.toFixed(1) + 'M' : 'none'}`);
  console.log(`Targets: Blue≈${calibration.targetBlueCount}, MML=${calibration.mmlExpected}, majorityWhite=${calibration.majorityShouldBeWhite}`);
  console.log(`Missing-Squad-1 uplift cap: ${MAX_MISSING_UPLIFT}x THP`);

  const summary = [];

  // Fixed-band models A, B, C
  for (const model of fixedModels) {
    const { scored, bands } = assignFixed(model, roster);
    const a = printModel(model, scored, bands);
    summary.push({ model, a });
  }

  // Percentile model D
  {
    const { scored, bands, counts: cnt } = assignPercentile(percentileModel, roster);
    const a = printModel(percentileModel, scored, bands, { counts: cnt });
    summary.push({ model: percentileModel, a });
  }

  // Derived tuned model E
  {
    const tuned = buildTunedModel(roster);
    const { scored, bands } = assignFixed(tuned, roster);
    const a = printModel(tuned, scored, bands);
    summary.push({ model: tuned, a });
  }

  // Top 20 by score (using Model A scoring as a stable reference ranking)
  console.log('\n' + '='.repeat(74));
  console.log('TOP 20 BY SCORE (Model A scoring reference)');
  console.log('='.repeat(74));
  const refScored = scoreRoster(fixedModels[0], roster);
  refScored.slice(0, 20).forEach((p, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(18)} score ${p.score.toFixed(2).padStart(7)}  THP ${p.thpM.toFixed(1).padStart(6)}  S1 ${p.hasSquad ? p.squad1M.toFixed(1) : 'est'}`));

  // Recommendation comparison
  console.log('\n' + '='.repeat(74));
  console.log('SUMMARY — does each model meet the calibration targets?');
  console.log('='.repeat(74));
  console.log('Model                         White Blue Purple Gold | Blue✓ MML✓ White✓  MML seat');
  const pf = b => b ? ' ✓ ' : ' ✗ ';
  for (const { model, a } of summary) {
    const tag = `${model.id} ${model.name}`.slice(0, 28).padEnd(29);
    console.log(`${tag}${String(a.c.White).padStart(4)}${String(a.c.Blue).padStart(5)}${String(a.c.Purple).padStart(7)}${String(a.c.Gold).padStart(5)} |` +
      `${pf(a.bluePass)}${pf(a.mmlPass)}${pf(a.whitePass)}  ${a.mml ? a.mml.seat : '?'}`);
  }
  const allPass = summary.filter(s => s.a.bluePass && s.a.mmlPass && s.a.whitePass && s.a.purpleOk && s.a.goldOk);
  console.log('\nModels passing ALL targets: ' + (allPass.length ? allPass.map(s => s.model.id).join(', ') : 'none of A–D as specified'));
}

main();
