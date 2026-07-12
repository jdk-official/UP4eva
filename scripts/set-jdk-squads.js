// Set JDKOfficial's Squad 2/3 details (safe write path with verification).
// Squad 2: 40.44M Air · Squad 3: 37.00M Missile · flag into the T2/3 group.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  const m = roster.find(x => x.name === 'JDKOfficial');
  if (!m) { console.error('JDKOfficial not found in roster!'); process.exit(1); }
  m.squad2 = 40440000;      // 40.44M
  m.squad2Type = 'Air';
  m.squad3 = 37000000;      // 37.00M
  m.squad3Type = 'Missile';
  m.squadGroup = true;      // hand-picked T2/3 group
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
  const v = vroster.find(x => x.name === 'JDKOfficial');

  console.log('JDKOfficial verified: squad2=' + v.squad2 + ' (' + (v.squad2 / 1e6) + 'M) ' + v.squad2Type +
    ', squad3=' + v.squad3 + ' (' + (v.squad3 / 1e6) + 'M) ' + v.squad3Type + ', squadGroup=' + v.squadGroup);
  console.log('dropped (squad1): ' + (afterSquad < beforeSquad ? ('YES ' + beforeSquad + '→' + afterSquad) : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
