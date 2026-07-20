// Extract the LAST image attachment from the session transcript and save it
// (used to capture the farm-location screenshot into the repo).
const fs = require('fs');
const path = 'C:/Users/jdk/.claude/projects/C--Users-jdk/ccb0c1af-a620-4a89-8523-df9ac12fce89.jsonl';
const out = 'C:/Users/jdk/UP4eva/farm-location';

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
let last = null;
function walk(node) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (node.type === 'image' && node.source && node.source.type === 'base64' && node.source.data) {
    last = node.source; // keep overwriting — final one wins
  }
  for (const k of Object.keys(node)) if (k !== 'data') walk(node[k]);
}
for (const line of lines) {
  try { walk(JSON.parse(line)); } catch (e) {}
}
if (!last) { console.error('no image found'); process.exit(1); }
const ext = last.media_type === 'image/png' ? '.png' : last.media_type === 'image/webp' ? '.webp' : '.jpg';
const buf = Buffer.from(last.data, 'base64');
fs.writeFileSync(out + ext, buf);
console.log('saved ' + out + ext + ' (' + last.media_type + ', ' + Math.round(buf.length / 1024) + ' KB)');
