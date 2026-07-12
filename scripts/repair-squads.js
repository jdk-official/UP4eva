// Repair T2/3 data lost to a concurrent browser save (last-write-wins clobber).
// Reapplies all known submissions in ONE atomic write, preserving the
// user's own UI entries (Mr Birb squads), then verifies everything.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Authoritative submissions (from chat screenshots this session).
const FIXES = {
  saeed15:       { squad2: 36540000, squad2Type: 'Air',  squad3: 35010000, squad3Type: 'Missile' },
  sheriffbummer: { squad2: 46000000, squad2Type: 'Air',  squad3: 42700000, squad3Type: 'Tank' },
  snc2nshaun:    { squad2: 41100000, squad2Type: 'Air',  squad3: 38740000, squad3Type: 'Missile' },
  jdkofficial:   { squad2: 40440000, squad2Type: 'Air',  squad3: 37000000, squad3Type: 'Missile' },
  paghgroen:     { squad2: 44000000, squad2Type: 'Air',  squad3: 38000000, squad3Type: 'Tank' },
  nurkian:       { squad2: 36000000, squad2Type: 'Air',  squad3: 34300000, squad3Type: 'Missile', squad1: 46700000 },
  phoenixwick:   { squad2: 38170000, squad2Type: 'Tank', squad3: 35830000, squad3Type: 'Air' },
  mrbirb:        { kills: 13.3 } // keep his UI-entered squad2/squad3 values; types unknown
};

async function fetchFreshest() {
  let best = null, bestScore = -1;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + '/latest?_cb=' + i + '_' + process.hrtime.bigint(), { headers: H });
    const d = await r.json();
    const rec = d.record || d;
    const roster = rec.roster || [];
    // Prefer the snapshot with the most squad2 data AND most recent updates.
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
  const beforeHash = rec.editHash;

  const applied = [];
  roster.forEach(m => {
    const fix = FIXES[norm(m.name)];
    if (!fix) return;
    Object.assign(m, fix);
    m.squadGroup = true;
    m.updated = Date.now();
    applied.push(m.name);
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

  console.log('Applied fixes to: ' + applied.join(', '));
  console.log('--- verified live state ---');
  vroster.filter(m => m.squadGroup || m.squad2 != null).forEach(m =>
    console.log('  ' + m.name.padEnd(16) + 's2=' + (m.squad2 != null ? (m.squad2 / 1e6) + 'M ' + (m.squad2Type || '?') : '—') +
      '  s3=' + (m.squad3 != null ? (m.squad3 / 1e6) + 'M ' + (m.squad3Type || '?') : '—') + '  flag=' + !!m.squadGroup));
  const birb = vroster.find(m => norm(m.name) === 'mrbirb');
  const nur = vroster.find(m => norm(m.name) === 'nurkian');
  console.log('Mr Birb kills: ' + birb.kills + 'M (squads kept: s2=' + (birb.squad2 / 1e6) + 'M, s3=' + (birb.squad3 / 1e6) + 'M)');
  console.log('Nurkian squad1: ' + (nur.squad1 / 1e6) + 'M');
  console.log('dropped (squad1): ' + (afterSquad < beforeSquad ? ('YES ' + beforeSquad + '→' + afterSquad) : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
