// Reusable Squad 2/3 updater (safe write path with verification).
// Usage: node scripts/set-squads.js "<name>" <s2M> <s2Type> <s3M> <s3Type>
//   e.g. node scripts/set-squads.js "paghgroen" 44.0 Air 38 Tank
// Powers are in MILLIONS; types are Tank / Air / Missile (case-insensitive).
// Also flags the member into the hand-picked T2/3 group.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [name, s2, s2t, s3, s3t] = process.argv.slice(2);
if (!name || !s2 || !s2t || !s3 || !s3t) {
  console.error('Usage: node scripts/set-squads.js "<name>" <s2M> <s2Type> <s3M> <s3Type>');
  process.exit(1);
}
const cap = s => s[0].toUpperCase() + s.slice(1).toLowerCase();
const type2 = cap(s2t), type3 = cap(s3t);
const VALID = ['Tank', 'Air', 'Missile'];
if (!VALID.includes(type2) || !VALID.includes(type3)) {
  console.error('Types must be Tank / Air / Missile. Got: ' + type2 + ', ' + type3);
  process.exit(1);
}
const p2 = Math.round(parseFloat(s2) * 1e6), p3 = Math.round(parseFloat(s3) * 1e6);
if (!isFinite(p2) || !isFinite(p3)) { console.error('Powers must be numbers (in millions).'); process.exit(1); }

async function fetchFreshest() {
  let best = null, bestSquad = -1;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + '/latest?_cb=' + i + '_' + process.hrtime.bigint(), { headers: H });
    const d = await r.json();
    const rec = d.record || d;
    const roster = rec.roster || [];
    const squadCount = roster.filter(m => m.squad1 != null).length;
    if (squadCount > bestSquad) { bestSquad = squadCount; best = rec; }
    await sleep(200);
  }
  return best;
}

(async () => {
  const rec = await fetchFreshest();
  const roster = rec.roster || [];
  const beforeSquad = roster.filter(m => m.squad1 != null).length;
  const beforeHash = rec.editHash;

  const m = roster.find(x => norm(x.name) === norm(name));
  if (!m) { console.error('"' + name + '" not found in roster (normalized match).'); process.exit(1); }
  m.squad2 = p2;
  m.squad2Type = type2;
  m.squad3 = p3;
  m.squad3Type = type3;
  m.squadGroup = true;
  m.updated = Date.now();

  const putBody = JSON.stringify({ core: rec.core, votedYes: rec.votedYes, editHash: rec.editHash, roster });
  const pr = await fetch(BASE, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: putBody });
  if (!pr.ok) { console.error('PUT failed', pr.status, await pr.text()); process.exit(1); }

  await sleep(900);

  const vr = await fetch(BASE + '/latest?_cb=verify_' + process.hrtime.bigint(), { headers: H });
  const vd = await vr.json();
  const vrec = vd.record || vd;
  const vroster = vrec.roster || [];
  const afterSquad = vroster.filter(m => m.squad1 != null).length;
  const v = vroster.find(x => norm(x.name) === norm(name));

  console.log(v.name + ' verified: squad2=' + (v.squad2 / 1e6) + 'M ' + v.squad2Type +
    ', squad3=' + (v.squad3 / 1e6) + 'M ' + v.squad3Type + ', squadGroup=' + v.squadGroup);
  console.log('group size now: ' + vroster.filter(x => x.squadGroup).length);
  console.log('dropped (squad1): ' + (afterSquad < beforeSquad ? ('YES ' + beforeSquad + '→' + afterSquad) : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
