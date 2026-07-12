// Reusable single-member Kills updater (safe write path with verification).
// Usage: node scripts/set-kills.js "<name>" <killsM>
//   e.g. node scripts/set-kills.js "Mr Birb" 13.3
// Kills are stored in MILLIONS (the render does no division).
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [name, killsArg] = process.argv.slice(2);
const kills = parseFloat(String(killsArg).replace(',', '.'));
if (!name || !isFinite(kills)) {
  console.error('Usage: node scripts/set-kills.js "<name>" <killsM>');
  process.exit(1);
}
if (kills > 1000) {
  console.error('Refusing: ' + kills + ' looks like a RAW count, not millions. Divide by 1e6 first.');
  process.exit(1);
}

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
  const old = m.kills;
  m.kills = kills;
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

  console.log(v.name + ' kills: ' + (old == null ? '(none)' : old + 'M') + ' -> ' + v.kills + 'M');
  console.log('dropped (squad1): ' + (afterSquad < beforeSquad ? ('YES ' + beforeSquad + '→' + afterSquad) : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
