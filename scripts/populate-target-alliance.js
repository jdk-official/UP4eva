// Populate targetAlliance (PSD / SPnX) from the 2026-07-19 mapping.
const BIN = '6a3d3011da38895dfefd77ce';
const KEY = '$2a$10$egxZyu05krfM.7bD6.6YMOYkS5JCyTRZms/QZb2xl9jqCANWuEFlG';
const BASE = 'https://api.jsonbin.io/v3/b/' + BIN;
const H = { 'X-Access-Key': KEY, 'X-Bin-Meta': 'false' };
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MAP = {};
['MML', 'JDKOfficial', 'Mr Birb', 'Bearror404', 'SaEed15', 'Pawel124', 'LanaBananaa',
 'Calamity Arte', '7GRUT', 'Karolina212', 'abo Najm', 'Abu Ameer1002', 'Hoodedx', 'Karrol']
  .forEach(n => MAP[norm(n)] = 'PSD');
['Sheriff Bummer', 'paghgroen', 'Deano Gotti', 'SNC2N Shaun', 'PHOENIX WICK', 'AxRO10',
 'Joker Pjoter', 'Gun JRP', 'flatliner111', 'Nurkian', 'royaluus', 'Biggunsbigarmy',
 'Sipppppppppppppppu', 'JAcA']
  .forEach(n => MAP[norm(n)] = 'SPnX');

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
  const beforeHash = rec.editHash;

  const applied = [];
  roster.forEach(m => {
    const t = MAP[norm(m.name)];
    if (!t) return;
    m.targetAlliance = t;
    m.updated = Date.now();
    applied.push(m.name + '=' + t);
  });
  if (applied.length !== Object.keys(MAP).length) {
    const found = new Set(roster.map(m => norm(m.name)));
    const missing = Object.keys(MAP).filter(k => !found.has(k));
    console.error('Expected ' + Object.keys(MAP).length + ' matches, got ' + applied.length + '. Missing: ' + missing.join(', '));
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
  const psd = vroster.filter(m => m.targetAlliance === 'PSD').map(m => m.name);
  const spnx = vroster.filter(m => m.targetAlliance === 'SPnX').map(m => m.name);
  console.log('PSD  (' + psd.length + '): ' + psd.join(', '));
  console.log('SPnX (' + spnx.length + '): ' + spnx.join(', '));
  console.log('dropped (squad1): ' + ((vroster.filter(m => m.squad1 != null).length < beforeSquad) ? 'YES' : 'none'));
  console.log('editHash preserved: ' + (vrec.editHash === beforeHash));
})();
