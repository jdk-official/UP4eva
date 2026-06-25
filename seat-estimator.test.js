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
console.log('\n# No Squad 1 => Squad 1 estimated at 30% of THP, confidence Low');
const e1 = estimateSeat(135, null); // spec: est 40.5, raw 222.75, Blue/Pioneer
check('estimated estimatedSquad1M', e1.estimatedSquad1M, 40.5);
check('estimated rawScore', e1.rawScore, 222.75);
check('estimated adjustment', e1.adjustment, 0);
check('estimated adjustedScore', e1.adjustedScore, 222.75);
check('estimated seat', e1.seat, 'Blue / Pioneer');
check('estimated confidence', e1.confidence, 'Low');
check('estimated flags', e1.flags, ['Squad 1 estimated from THP']);

const e2 = estimateSeat(200, null); // est 60, raw 330 -> Gold/Elite
check('estimated(200) estimatedSquad1M', e2.estimatedSquad1M, 60);
check('estimated(200) rawScore', e2.rawScore, 330);
check('estimated(200) seat', e2.seat, 'Gold / Elite');
check('estimated(200) confidence', e2.confidence, 'Low');
check('estimated(200) flags', e2.flags, ['Squad 1 estimated from THP']);

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
