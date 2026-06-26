const { estimateSeat, SEAT_BANDS } = require('./seat-estimator.js');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' => ' + JSON.stringify(got) + (ok ? '' : '  EXPECTED ' + JSON.stringify(exp)));
  ok ? pass++ : fail++;
}

// Production calibration ("Model E"): score on the THP-millions scale,
//   with Squad 1:  score = THP + 0.25 * Squad1
//   no Squad 1:    score = 1.06 * THP   (confidence Low)
// Bands: White <146.7, Blue 146.7-194.99, Purple 195-209.99, Gold >=210.
// No build-balance penalty (adjustment always 0).

// ---- One clean case per band (with Squad 1) -------------------------------
console.log('# One case per band');
const white = estimateSeat(120, 40);   // 120 + 10 = 130
check('White score', white.rawScore, 130);
check('White seat', white.seat, 'White / Follower');
check('White adjustment', white.adjustment, 0);
check('White flags', white.flags, []);

const blue = estimateSeat(160, 60);    // 160 + 15 = 175
check('Blue score', blue.rawScore, 175);
check('Blue seat', blue.seat, 'Blue / Pioneer');
check('Blue confidence', blue.confidence, 'Medium');   // 20 from 195

const purple = estimateSeat(196, 36);  // 196 + 9 = 205
check('Purple score', purple.rawScore, 205);
check('Purple seat', purple.seat, 'Purple / Contributor');

const gold = estimateSeat(220, 60);    // 220 + 15 = 235
check('Gold score', gold.rawScore, 235);
check('Gold seat', gold.seat, 'Gold / Elite');
check('Gold confidence', gold.confidence, 'High');     // 25 from 210

// ---- MML anchor: top-end Blue pushing the Purple line ----------------------
console.log('\n# MML anchor (top-end Blue, pushing Purple)');
const mml = estimateSeat(175.778224, 63.1); // 175.78 + 15.775 = 191.55
check('MML score', mml.rawScore, 191.55);
check('MML seat', mml.seat, 'Blue / Pioneer');
check('MML confidence', mml.confidence, 'Borderline'); // 3.45 below Purple@195
check('MML squadRatio (informational)', mml.squadRatio, 0.359);
check('MML adjustment (no penalty)', mml.adjustment, 0);

// ---- No Squad 1 => small uplift, confidence Low, NOT inflated --------------
console.log('\n# Missing Squad 1 => 1.06 * THP, Low, not inflated');
const e1 = estimateSeat(150, null);
check('estimated score', e1.rawScore, 159);            // 1.06*150
check('estimated seat', e1.seat, 'Blue / Pioneer');
check('estimated confidence', e1.confidence, 'Low');
check('estimated squadRatio', e1.squadRatio, null);
check('estimated flags', e1.flags, ['Estimated from THP (no Squad 1)']);
// Highest THP in the roster (175.8) on a THP-only estimate must NOT reach Purple.
const topThpOnly = estimateSeat(175.78, null);          // 1.06*175.78 = 186.33
check('top THP-only score', topThpOnly.rawScore, 186.33);
check('top THP-only seat (still Blue, not inflated)', topThpOnly.seat, 'Blue / Pioneer');

// ---- No build-balance penalty (glass-cannon no longer demoted) ------------
console.log('\n# Build balance is informational only (no penalty)');
const gc = estimateSeat(150, 70);      // ratio 0.4667 — would have been penalised before
check('glasscannon score', gc.rawScore, 167.5);        // 150 + 17.5, no deduction
check('glasscannon adjustment', gc.adjustment, 0);
check('glasscannon flags', gc.flags, []);
check('glasscannon seat', gc.seat, 'Blue / Pioneer');

// ---- Distribution on the live roster snapshot (calibration check) ----------
console.log('\n# Live roster snapshot distribution');
const snapshot = require('./scripts/roster-data.json');
const seatOf = p => p.thp == null ? null : estimateSeat(p.thp / 1e6, p.squad1 == null ? null : p.squad1 / 1e6);
const counts = { Gold: 0, Purple: 0, Blue: 0, White: 0 };
let rated = 0;
snapshot.players.forEach(p => {
  const e = seatOf(p);
  if (!e || !e.colour) return;
  rated++; counts[e.colour]++;
});
check('rated players', rated, 76);
check('snapshot distribution', counts, { Gold: 0, Purple: 0, Blue: 8, White: 68 });
check('majority White', counts.White > rated / 2, true);
check('Blue count (target ~8)', counts.Blue, 8);
const mmlRow = snapshot.players.find(p => p.name === 'MML');
check('MML in snapshot is Blue/Pioneer', seatOf(mmlRow).seat, 'Blue / Pioneer');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
