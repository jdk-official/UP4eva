// Reusable Squad 1 (T1) updater: power + type (safe write path with verification).
// Usage: node scripts/set-squad1.js "<name>" <powerM> <type>
//   e.g. node scripts/set-squad1.js "Karolina212" 43.3 Tank
// squad1 is stored RAW (power * 1e6); squadType is Tank / Air / Missile.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [name, powArg, typeArg] = process.argv.slice(2);
const powM = parseFloat(String(powArg).replace(',', '.'));
const type = typeArg ? typeArg[0].toUpperCase() + typeArg.slice(1).toLowerCase() : null;
const VALID = ['Tank', 'Air', 'Missile'];
if (!name || !isFinite(powM) || !VALID.includes(type)) {
  console.error('Usage: node scripts/set-squad1.js "<name>" <powerM> <Tank|Air|Missile>');
  process.exit(1);
}

async function fetchFreshest() {
  let best = null, bestSquad = -1;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + '/latest?_cb=' + i + '_' + process.hrtime.bigint(), { headers: H });
    const d = await r.json();
    const rec = d.record || d;
    const roster = rec.roster || [];
    const c = roster.filter(m => m.squad1 != null).length;
    if (c > bestSquad) { bestSquad = c; best = rec; }
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
  const old = m.squad1;
  m.squad1 = Math.round(powM * 1e6);
  m.squadType = type;
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

  console.log(v.name + ' squad1: ' + (old == null ? '(none)' : (old / 1e6) + 'M') + ' -> ' + (v.squad1 / 1e6) + 'M ' + v.squadType);
  console.log('squad1 count: ' + beforeSquad + ' -> ' + afterSquad);
  console.log('dropped: ' + (afterSquad < beforeSquad ? 'YES' : 'none') + ', editHash preserved: ' + (vrec.editHash === beforeHash));
})();
