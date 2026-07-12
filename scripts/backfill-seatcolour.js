// Backfill seatColour from the seat estimator (the old, removed Seat column).
// Members with THP get their estimated band colour (White/Blue/Purple/Gold);
// members with missing THP default to White. Same estimator the site uses.
const SeatEstimator = require('C:/Users/jdk/UP4eva/seat-estimator.js');
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

function colourFor(m) {
  if (m.thp == null) return 'White'; // missing data → default White
  const est = SeatEstimator.estimateSeat(m.thp / 1e6, m.squad1 != null ? m.squad1 / 1e6 : null);
  return (est && est.colour) ? est.colour : 'White';
}

(async () => {
  const rec = await fetchFreshest();
  const roster = rec.roster || [];
  const beforeSquad = roster.filter(m => m.squad1 != null).length;
  const beforeHash = rec.editHash;

  const dist = {};
  let missing = 0;
  roster.forEach(m => {
    const c = colourFor(m);
    if (m.thp == null) missing++;
    m.seatColour = c;
    m.updated = Date.now();
    dist[c] = (dist[c] || 0) + 1;
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
  const vdist = {};
  vroster.forEach(m => { const c = m.seatColour == null ? '(blank)' : m.seatColour; vdist[c] = (vdist[c] || 0) + 1; });
  const blanks = vroster.filter(m => m.seatColour == null).map(m => m.name);

  console.log('Roster members: ' + vroster.length + ' (missing THP → White: ' + missing + ')');
  console.log('written distribution: ' + JSON.stringify(dist));
  console.log('verified distribution: ' + JSON.stringify(vdist));
  console.log('still blank: ' + (blanks.length ? blanks.join(', ') : 'none'));
  console.log('dropped (squad1): ' + (afterSquad < beforeSquad ? ('YES ' + beforeSquad + '→' + afterSquad) : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
