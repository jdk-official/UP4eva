const { estimateSeat } = require('./seat-estimator.js');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' => ' + JSON.stringify(got) + (ok ? '' : '  EXPECTED ' + JSON.stringify(exp)));
  ok ? pass++ : fail++;
}

// Server 1115 calibration (downward, fitted to the live roster):
//   score = 0.75*THP + 1.6*Squad1  (with squad);  1.25*THP  (none)
//   adjustments: ratio>=0.40 -> -15, >=0.35 -> -10, <=0.22 -> -10
//   bands: <170 White, 170-184 Blue, 185-209 Purple, 210+ Gold
//   confidence boundaries: [170, 185, 210]

// ---- One clean case per band (no adjustment) ------------------------------
console.log('# One case per band');
const white = estimateSeat(120, 30);   // raw 138, ratio .25
check('White rawScore', white.rawScore, 138);
check('White seat', white.seat, 'White / Follower');
check('White flags', white.flags, []);
check('White confidence', white.confidence, 'High');     // 32 from 170

const blue = estimateSeat(150, 40);    // raw 176.5, ratio .2667
check('Blue rawScore', blue.rawScore, 176.5);
check('Blue seat', blue.seat, 'Blue / Pioneer');
check('Blue confidence', blue.confidence, 'Borderline'); // 6.5 from 170

const purple = estimateSeat(170, 45);  // raw 199.5, ratio .2647
check('Purple rawScore', purple.rawScore, 199.5);
check('Purple seat', purple.seat, 'Purple / Contributor');
check('Purple confidence', purple.confidence, 'Medium'); // 10.5 from 210

const gold = estimateSeat(200, 60);    // raw 246, ratio .30
check('Gold rawScore', gold.rawScore, 246);
check('Gold seat', gold.seat, 'Gold / Elite');
check('Gold flags', gold.flags, []);
check('Gold confidence', gold.confidence, 'High');       // 36 from 210

// ---- No Squad 1 => THP-only estimate (1.25 * THP), confidence Low ----------
console.log('\n# No Squad 1 => 1.25 * THP, confidence Low');
const e1 = estimateSeat(130, null);
check('estimated rawScore', e1.rawScore, 162.5);         // 1.25*130
check('estimated squadRatio', e1.squadRatio, null);
check('estimated seat', e1.seat, 'White / Follower');
check('estimated confidence', e1.confidence, 'Low');
check('estimated flags', e1.flags, ['Estimated from THP (no Squad 1)']);
check('estimated(140) seat', estimateSeat(140, null).seat, 'Blue / Pioneer');   // 175
check('estimated(180) seat', estimateSeat(180, null).seat, 'Gold / Elite');     // 225

// ---- Glass cannon (>=0.40) -15 --------------------------------------------
console.log('\n# Glass cannon (ratio >= 0.40) -> -15');
const gc1 = estimateSeat(135, 56);     // raw 190.85, ratio .4148 -15 -> 175.85
check('glasscannon rawScore', gc1.rawScore, 190.85);
check('glasscannon squadRatio', gc1.squadRatio, 0.4148);
check('glasscannon adjustment', gc1.adjustment, -15);
check('glasscannon adjustedScore', gc1.adjustedScore, 175.85);
check('glasscannon seat', gc1.seat, 'Blue / Pioneer');
check('glasscannon flags', gc1.flags, ['Glass cannon build']);
check('glasscannon confidence', gc1.confidence, 'Borderline'); // 5.85 from 170

const gc2 = estimateSeat(160, 90);     // raw 264, ratio .5625 -15 -> 249
check('glasscannon(High->Med) adjustedScore', gc2.adjustedScore, 249);
check('glasscannon(High->Med) seat', gc2.seat, 'Gold / Elite');
check('glasscannon(High->Med) confidence', gc2.confidence, 'Medium'); // 39 from 210 (High) -> Medium

// ---- Squad-heavy (0.35–0.40) -10 and underpowered (<=0.22) -10 -------------
console.log('\n# Squad-heavy and underpowered');
const sh = estimateSeat(200, 74);      // ratio .37 -> squad-heavy -10
check('squad-heavy rawScore', sh.rawScore, 268.4);
check('squad-heavy adjustment', sh.adjustment, -10);
check('squad-heavy adjustedScore', sh.adjustedScore, 258.4);
check('squad-heavy seat', sh.seat, 'Gold / Elite');
check('squad-heavy flags', sh.flags, ['Squad-heavy build']);

const up = estimateSeat(200, 40);      // ratio .20 -> underpowered -10
check('underpowered rawScore', up.rawScore, 214);
check('underpowered adjustment', up.adjustment, -10);
check('underpowered adjustedScore', up.adjustedScore, 204);
check('underpowered seat', up.seat, 'Purple / Contributor');
check('underpowered flags', up.flags, ['Broad but underpowered main squad']);
check('underpowered confidence', up.confidence, 'Borderline'); // 6 from 210

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
