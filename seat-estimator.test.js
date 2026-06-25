const { estimateSeat } = require('./seat-estimator.js');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' => ' + JSON.stringify(got) + (ok ? '' : '  EXPECTED ' + JSON.stringify(exp)));
  ok ? pass++ : fail++;
}

// Rebalanced formula: score = 0.85*THP + 2.3*Squad1 (with squad), 1.75*THP (none).
// Adjustments: ratio>=0.40 -> -15, >=0.35 -> -10, <=0.22 -> -10.
// Bands: <170 White, 170-244 Blue, 245-329 Purple, 330+ Gold.

// ---- With Squad 1: THP=135, Squad1=56 (glass cannon) -----------------------
console.log('# With Squad 1 (THP=135, Squad1=56) — glass cannon');
const r = estimateSeat(135, 56);
check('rawScore', r.rawScore, 243.55);                 // 0.85*135 + 2.3*56
check('squadRatio', r.squadRatio, 0.4148);             // 56/135
check('adjustment', r.adjustment, -15);                // ratio >= 0.40
check('adjustedScore', r.adjustedScore, 228.55);
check('seat', r.seat, 'Blue / Pioneer');
check('confidence', r.confidence, 'Medium');           // 16.45 from 245
check('flags', r.flags, ['Glass cannon build']);

// ---- No Squad 1 => THP-only estimate (1.75 * THP), confidence Low ----------
console.log('\n# No Squad 1 => 1.75 * THP, confidence Low');
const e1 = estimateSeat(135, null);
check('estimated rawScore', e1.rawScore, 236.25);      // 1.75*135
check('estimated adjustment', e1.adjustment, 0);
check('estimated squadRatio', e1.squadRatio, null);
check('estimated adjustedScore', e1.adjustedScore, 236.25);
check('estimated seat', e1.seat, 'Blue / Pioneer');
check('estimated confidence', e1.confidence, 'Low');
check('estimated flags', e1.flags, ['Estimated from THP (no Squad 1)']);

const e2 = estimateSeat(200, null);                    // 1.75*200 = 350 -> Gold
check('estimated(200) rawScore', e2.rawScore, 350);
check('estimated(200) seat', e2.seat, 'Gold / Elite');
check('estimated(200) confidence', e2.confidence, 'Low');

// ---- Balanced build deep in Gold => High confidence, no flag ---------------
console.log('\n# Balanced build, deep in Gold => High confidence, no flag');
const g = estimateSeat(300, 80);                       // raw 439, ratio .2667
check('balanced rawScore', g.rawScore, 439);
check('balanced seat', g.seat, 'Gold / Elite');
check('balanced adjustment', g.adjustment, 0);
check('balanced flags', g.flags, []);
check('balanced confidence', g.confidence, 'High');

// ---- Glass cannon that would be High => reduced to Medium ------------------
console.log('\n# Glass cannon that would be High => reduced to Medium');
const gc = estimateSeat(150, 70);                      // raw 288.5, ratio .4667 -15, adj 273.5
check('glasscannon rawScore', gc.rawScore, 288.5);
check('glasscannon seat', gc.seat, 'Purple / Contributor');
check('glasscannon adjustment', gc.adjustment, -15);
check('glasscannon flags', gc.flags, ['Glass cannon build']);
check('glasscannon confidence (High->Medium)', gc.confidence, 'Medium'); // 28.5 from 245

// ---- Squad-heavy (0.35–0.40) and underpowered (<=0.22) flags --------------
console.log('\n# Squad-heavy (0.35–0.40) and underpowered (<=0.22) flags');
const sh = estimateSeat(200, 74);                      // ratio .37 -> squad-heavy -10
check('squad-heavy rawScore', sh.rawScore, 340.2);
check('squad-heavy adjustment', sh.adjustment, -10);
check('squad-heavy adjustedScore', sh.adjustedScore, 330.2);
check('squad-heavy seat', sh.seat, 'Gold / Elite');
check('squad-heavy flags', sh.flags, ['Squad-heavy build']);
check('squad-heavy confidence', sh.confidence, 'Borderline'); // 0.2 from 330

const up = estimateSeat(200, 40);                      // ratio .20 -> underpowered -10
check('underpowered rawScore', up.rawScore, 262);
check('underpowered adjustment', up.adjustment, -10);
check('underpowered adjustedScore', up.adjustedScore, 252);
check('underpowered seat', up.seat, 'Purple / Contributor');
check('underpowered flags', up.flags, ['Broad but underpowered main squad']);
check('underpowered confidence', up.confidence, 'Borderline'); // 7 from 245

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
