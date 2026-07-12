// Unit test for the merge-on-save logic (mirrors mergeOntoRemote in index.html).
// Pure function of local state + remote record; no network.
let core, syncedCore, votedYes, syncedVoted, roster;

function mergeOntoRemote(remote) {
  const rRoster = Array.isArray(remote.roster) ? remote.roster : [];
  const remoteByName = new Map(rRoster.map(m => [m.name, m]));
  const localByName = new Map(roster.map(m => [m.name, m]));
  const mergedRoster = [];
  new Set([...remoteByName.keys(), ...localByName.keys()]).forEach(n => {
    const lm = localByName.get(n), rm = remoteByName.get(n);
    if (lm && rm) mergedRoster.push((lm.updated || 0) > (rm.updated || 0) ? lm : rm);
    else mergedRoster.push(lm || rm);
  });
  const mergeSet = (localSet, baseline, remoteArr) => {
    const merged = new Set(Array.isArray(remoteArr) ? remoteArr : []);
    localSet.forEach(n => { if (!baseline.has(n)) merged.add(n); });
    baseline.forEach(n => { if (!localSet.has(n)) merged.delete(n); });
    return merged;
  };
  return {
    core: mergeSet(core, syncedCore, remote.core),
    votedYes: mergeSet(votedYes, syncedVoted, remote.votedYes),
    editHash: editHashLocal != null ? editHashLocal : (remote.editHash != null ? remote.editHash : null),
    roster: mergedRoster
  };
}
let editHashLocal = 'HASH';

let passed = 0, failed = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + '\n      got:  ' + g + '\n      want: ' + w); }
}
const byName = arr => arr.reduce((o, m) => (o[m.name] = m, o), {});

// ---- SCENARIO 1: the actual clobber bug ------------------------------------
// Stale tab: local roster has NO squad2 for Bob (never saw it) and just edited
// Ann's thp. Remote has Bob.squad2 written by a script (newer `updated`).
console.log('Scenario 1 — stale tab must not clobber a concurrent squad edit:');
roster = [
  { name: 'Ann', thp: 200, updated: 5000 },              // we just edited Ann
  { name: 'Bob', thp: 150, updated: 1000 }               // stale: no squad2, old ts
];
core = new Set(); syncedCore = new Set(); votedYes = new Set(); syncedVoted = new Set();
const remote1 = {
  core: [], votedYes: [], editHash: 'HASH',
  roster: [
    { name: 'Ann', thp: 190, updated: 1000 },            // remote Ann older than ours
    { name: 'Bob', thp: 150, squad2: 45000000, squad2Type: 'Air', updated: 9000 } // script wrote this
  ]
};
const m1 = byName(mergeOntoRemote(remote1).roster);
eq('Ann keeps OUR fresh edit (thp 200)', m1.Ann.thp, 200);
eq('Bob keeps REMOTE squad2 (not clobbered)', m1.Bob.squad2, 45000000);
eq('Bob keeps REMOTE squad2Type', m1.Bob.squad2Type, 'Air');

// ---- SCENARIO 2: new member added by someone else --------------------------
console.log('Scenario 2 — member added remotely is preserved:');
roster = [{ name: 'Ann', thp: 200, updated: 5000 }];
const m2 = byName(mergeOntoRemote({ roster: [
  { name: 'Ann', thp: 200, updated: 5000 },
  { name: 'Zoe', thp: 99, updated: 8000 }
] }).roster);
eq('Zoe (remote-only) present', !!m2.Zoe, true);
eq('Ann still present', !!m2.Ann, true);

// ---- SCENARIO 3: core add/remove deltas ------------------------------------
console.log('Scenario 3 — core set: push only our own add/removes:');
core = new Set(['Ann', 'Bob']);        // we added Bob
syncedCore = new Set(['Ann']);         // baseline had only Ann
votedYes = new Set(); syncedVoted = new Set();
roster = [];
const res3 = mergeOntoRemote({ core: ['Ann', 'Carl'], votedYes: [], roster: [] }); // remote added Carl
eq('our add (Bob) applied', res3.core.has('Bob'), true);
eq('remote add (Carl) preserved', res3.core.has('Carl'), true);
eq('untouched (Ann) kept', res3.core.has('Ann'), true);

console.log('Scenario 4 — core removal propagates without wiping remote adds:');
core = new Set(['Ann']);               // we removed Bob
syncedCore = new Set(['Ann', 'Bob']);  // baseline had Ann + Bob
const res4 = mergeOntoRemote({ core: ['Ann', 'Bob', 'Dan'], votedYes: [], roster: [] }); // remote added Dan
eq('our removal (Bob) applied', res4.core.has('Bob'), false);
eq('remote add (Dan) preserved', res4.core.has('Dan'), true);
eq('untouched (Ann) kept', res4.core.has('Ann'), true);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
