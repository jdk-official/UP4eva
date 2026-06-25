const { estimateSeat } = require('./seat-estimator.js');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' => ' + JSON.stringify(got) + (ok ? '' : '  EXPECTED ' + JSON.stringify(exp)));
  ok ? pass++ : fail++;
}

// ---- Spec test case: THP = 135, Squad1 = 56 -------------------------------
console.log('# Spec test case (THP=135, Squad1=56)');
const r = estimateSeat(135, 56);
check('rawScore', r.rawScore, 269.25);
check('squadRatio', r.squadRatio, 0.4148);
check('adjustment', r.adjustment, -25);
check('adjustedScore', r.adjustedScore, 244.25);
check('seat', r.seat, 'Blue / Pioneer');
check('confidence', r.confidence, 'Borderline');
check('flags', r.flags, ['Glass cannon build']);

// ---- Extra coverage --------------------------------------------------------
console.log('\n# THP-only (no Squad 1) => Low confidence');
const t = estimateSeat(200, null);
check('THP-only rawScore', t.rawScore, 200);
check('THP-only adjustment', t.adjustment, 0);
check('THP-only seat', t.seat, 'Blue / Pioneer');
check('THP-only confidence', t.confidence, 'Low');
check('THP-only flags', t.flags, []);

console.log('\n# Balanced build, deep in Gold => High confidence, no flag');
const g = estimateSeat(300, 80); // ratio .2667, raw 465, adj 465
check('balanced seat', g.seat, 'Gold / Elite');
check('balanced adjustment', g.adjustment, 0);
check('balanced flags', g.flags, []);
check('balanced confidence', g.confidence, 'High');

console.log('\n# Glass cannon that would be High => reduced to Medium');
const gc = estimateSeat(150, 70); // ratio .4667 glass cannon -25, raw 322.5, adj 297.5 (Purple, 32.5 from boundary)
check('glasscannon seat', gc.seat, 'Purple / Contributor');
check('glasscannon adjustment', gc.adjustment, -25);
check('glasscannon flags', gc.flags, ['Glass cannon build']);
check('glasscannon confidence (High->Medium)', gc.confidence, 'Medium');

console.log('\n# Squad-heavy (0.35–0.40) and underpowered (<=0.22) flags');
const sh = estimateSeat(200, 74); // ratio .37 -> squad-heavy -15
check('squad-heavy flag', sh.flags, ['Squad-heavy build']);
check('squad-heavy adjustment', sh.adjustment, -15);
const up = estimateSeat(200, 40); // ratio .20 -> underpowered -10
check('underpowered flag', up.flags, ['Broad but underpowered main squad']);
check('underpowered adjustment', up.adjustment, -10);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
