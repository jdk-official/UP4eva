// Set t11 = 'No' for every roster member (safe write path with verification).
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

  let set = 0;
  roster.forEach(m => {
    if (m.t11 !== 'No') { m.t11 = 'No'; m.updated = Date.now(); set++; }
  });

  const putBody = JSON.stringify({ core: rec.core, votedYes: rec.votedYes, editHash: rec.editHash, roster });
  const pr = await fetch(BASE, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: putBody });
  if (!pr.ok) { console.error('PUT failed', pr.status, await pr.text()); process.exit(1); }

  await sleep(900);

  const vr = await fetch(BASE + '/latest?_cb=verify_' + process.hrtime.bigint(), { headers: H });
  const vd = await vr.json();
  const vrec = vd.record || vd;
  const vroster = vrec.roster || [];
  const afterSquad = vroster.filter(m => m.squad1 != null).length;
  const noCount = vroster.filter(m => m.t11 === 'No').length;
  const notNo = vroster.filter(m => m.t11 !== 'No').map(m => m.name);

  console.log('Roster members: ' + vroster.length);
  console.log('Newly set to No this run: ' + set);
  console.log('t11 === "No": ' + noCount + ' / ' + vroster.length);
  console.log('members NOT No: ' + (notNo.length ? notNo.join(', ') : 'none'));
  console.log('dropped (squad1): ' + (afterSquad < beforeSquad ? ('YES ' + beforeSquad + '→' + afterSquad) : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
