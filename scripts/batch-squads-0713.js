// Batch update 2026-07-13: flatliner111, Pawel124, Joker Pjoter, PHOENIX WICK.
// Mixed-composition T3s (Pawel124, Joker Pjoter) store power with type unset.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIXES = {
  flatliner111: { squad2: 39000000, squad2Type: 'Missile', squad3: 32000000, squad3Type: 'Air', squadGroup: true },
  pawel124:     { squad1: 47830000, squadType: 'Tank', squad2: 37370000, squad2Type: 'Air', squad3: 32900000, squadGroup: true }, // T3 mix
  jokerpjoter:  { squad2: 36690000, squad2Type: 'Air', squad3: 34890000, squadGroup: true }, // T3 mixed composition
  phoenixwick:  { squad1: 51970000, squadType: 'Missile' } // refresh 51.5 -> 51.97
};

async function fetchFreshest() {
  let best = null, bestScore = -1;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + '/latest?_cb=' + i + '_' + process.hrtime.bigint(), { headers: H });
    const d = await r.json();
    const rec = d.record || d;
    const roster = rec.roster || [];
    const score = roster.filter(m => m.squad2 != null).length * 1e15 +
      Math.max(0, ...roster.map(m => m.updated || 0));
    if (score > bestScore) { bestScore = score; best = rec; }
    await sleep(250);
  }
  return best;
}

(async () => {
  const rec = await fetchFreshest();
  const roster = rec.roster || [];
  const beforeSquad = roster.filter(m => m.squad1 != null).length;
  const beforeGroup = roster.filter(m => m.squadGroup).length;
  const beforeHash = rec.editHash;

  const applied = [];
  roster.forEach(m => {
    const fix = FIXES[norm(m.name)];
    if (!fix) return;
    Object.assign(m, fix);
    m.updated = Date.now();
    applied.push(m.name);
  });
  if (applied.length !== Object.keys(FIXES).length) {
    console.error('Expected 4 matches, got: ' + applied.join(', ')); process.exit(1);
  }

  const putBody = JSON.stringify({ core: rec.core, votedYes: rec.votedYes, editHash: rec.editHash, roster });
  const pr = await fetch(BASE, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: putBody });
  if (!pr.ok) { console.error('PUT failed', pr.status, await pr.text()); process.exit(1); }

  await sleep(900);

  const vr = await fetch(BASE + '/latest?_cb=verify_' + process.hrtime.bigint(), { headers: H });
  const vd = await vr.json();
  const vrec = vd.record || vd;
  const vroster = vrec.roster || [];
  Object.keys(FIXES).forEach(k => {
    const v = vroster.find(x => norm(x.name) === k);
    console.log(v.name + ': s1=' + (v.squad1 != null ? v.squad1 / 1e6 + 'M ' + (v.squadType || '?') : '—') +
      ' s2=' + (v.squad2 != null ? v.squad2 / 1e6 + 'M ' + (v.squad2Type || '?') : '—') +
      ' s3=' + (v.squad3 != null ? v.squad3 / 1e6 + 'M ' + (v.squad3Type || '(mix)') : '—') + ' flag=' + !!v.squadGroup);
  });
  const afterSquad = vroster.filter(m => m.squad1 != null).length;
  const afterGroup = vroster.filter(m => m.squadGroup).length;
  console.log('squad1 count: ' + beforeSquad + ' -> ' + afterSquad + ', group: ' + beforeGroup + ' -> ' + afterGroup);
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
