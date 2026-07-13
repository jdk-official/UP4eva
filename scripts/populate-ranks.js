// Populate alliance ranks from the in-game member list (2026-07-13).
// R5: Papa Pagh (paghgroen). R4: the ten shown in the R4 list.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RANKS = {};
RANKS[norm('paghgroen')] = 'R5';
['JDKOfficial', 'SaEed15', 'PHOENIX WICK', 'SNC2N Shaun', 'Choops29',
 'Bearror404', 'Deano Gotti', 'Calamity Arte', 'titizz', 'Alinéacode126']
  .forEach(n => RANKS[norm(n)] = 'R4');

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
    const r = RANKS[norm(m.name)];
    if (!r) return;
    m.rank = r;
    m.updated = Date.now();
    applied.push(m.name + '=' + r);
  });
  if (applied.length !== Object.keys(RANKS).length) {
    const found = new Set(roster.map(m => norm(m.name)));
    const missing = Object.keys(RANKS).filter(k => !found.has(k));
    console.error('Expected ' + Object.keys(RANKS).length + ' matches, got ' + applied.length + '. Missing: ' + missing.join(', '));
    process.exit(1);
  }

  const putBody = JSON.stringify({ core: rec.core, votedYes: rec.votedYes, editHash: rec.editHash, roster });
  const pr = await fetch(BASE, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: putBody });
  if (!pr.ok) { console.error('PUT failed', pr.status, await pr.text()); process.exit(1); }

  await sleep(900);

  const vr = await fetch(BASE + '/latest?_cb=verify_' + process.hrtime.bigint(), { headers: H });
  const vd = await vr.json();
  const vrec = vd.record || vd;
  const vroster = vrec.roster || [];
  const counts = {};
  vroster.filter(m => m.rank).forEach(m => counts[m.rank] = (counts[m.rank] || 0) + 1);
  console.log('Applied: ' + applied.join(', '));
  console.log('verified rank counts: ' + JSON.stringify(counts));
  console.log('R5: ' + vroster.filter(m => m.rank === 'R5').map(m => m.name).join(', '));
  console.log('dropped (squad1): ' + ((vroster.filter(m => m.squad1 != null).length < beforeSquad) ? 'YES' : 'none') +
    ', group: ' + beforeGroup + ' -> ' + vroster.filter(m => m.squadGroup).length);
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
