// Reset every member's seatColour to unset (safe write path with verification).
// Bumps each member's `updated` so merge-on-save LWW keeps the cleared state.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  let cleared = 0;
  roster.forEach(m => {
    if (m.seatColour != null) { delete m.seatColour; m.updated = Date.now(); cleared++; }
  });

  const putBody = JSON.stringify({ core: rec.core, votedYes: rec.votedYes, editHash: rec.editHash, roster });
  const pr = await fetch(BASE, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: putBody });
  if (!pr.ok) { console.error('PUT failed', pr.status, await pr.text()); process.exit(1); }

  await sleep(900);

  const vr = await fetch(BASE + '/latest?_cb=verify_' + process.hrtime.bigint(), { headers: H });
  const vd = await vr.json();
  const vrec = vd.record || vd;
  const vroster = vrec.roster || [];
  const remaining = vroster.filter(m => m.seatColour != null).map(m => m.name);
  const afterSquad = vroster.filter(m => m.squad1 != null).length;
  const afterGroup = vroster.filter(m => m.squadGroup).length;

  console.log('Cleared seatColour on ' + cleared + ' members.');
  console.log('still set: ' + (remaining.length ? remaining.join(', ') : 'none'));
  console.log('squad1 count: ' + beforeSquad + ' -> ' + afterSquad + ', T2/3 group: ' + beforeGroup + ' -> ' + afterGroup);
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
