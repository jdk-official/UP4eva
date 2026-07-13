// Batch update 2026-07-13 (b): Choops29, Gun JRP.
// Gun JRP: both T2 (tank+air) and T3 (tank+missile) are mixed -> types unset.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIXES = {
  choops29: { squad2: 34630000, squad2Type: 'Air', squad3: 30260000, squad3Type: 'Missile', squadGroup: true },
  gunjrp:   { squad2: 39100000, squad3: 35200000, squadGroup: true } // both mixed comps
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
    console.error('Expected ' + Object.keys(FIXES).length + ' matches, got: ' + (applied.join(', ') || 'none')); process.exit(1);
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
    console.log(v.name + ': s2=' + (v.squad2 != null ? v.squad2 / 1e6 + 'M ' + (v.squad2Type || '(mix)') : '—') +
      ' s3=' + (v.squad3 != null ? v.squad3 / 1e6 + 'M ' + (v.squad3Type || '(mix)') : '—') + ' flag=' + !!v.squadGroup);
  });
  const afterSquad = vroster.filter(m => m.squad1 != null).length;
  const afterGroup = vroster.filter(m => m.squadGroup).length;
  console.log('squad1 count: ' + beforeSquad + ' -> ' + afterSquad + ', group: ' + beforeGroup + ' -> ' + afterGroup);
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
