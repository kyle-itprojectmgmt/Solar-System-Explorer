// Build-time processor for the HYG star database (V5 1c).
// Input:  hygdata CSV (v3/v41 schema — https://github.com/astronexus/HYG-Database)
// Output: public/data/brightstars.json — the ~9k naked-eye stars (mag < 6.5)
//         as unit sky directions + magnitude + B-V color index + names.
// Usage:  node tools/build-stars.mjs <path-to-hygdata.csv>
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/build-stars.mjs <hygdata.csv>'); process.exit(1); }

const lines = readFileSync(src, 'utf8').split('\n');
const header = lines[0].split(',').map((h) => h.replaceAll('"', '').trim());
const col = Object.fromEntries(header.map((h, i) => [h, i]));

// Minimal CSV split (the numeric fields we need never contain commas;
// quoted text fields may, so split respecting quotes).
function splitCsv(line) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const dirs = [], mags = [], cis = [], names = [];
let n = 0;
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  const f = splitCsv(lines[i]);
  const id = +f[col.id];
  const mag = parseFloat(f[col.mag]);
  if (id === 0 || !isFinite(mag) || mag >= 6.5) continue; // naked-eye only, no Sol
  const x = parseFloat(f[col.x]), y = parseFloat(f[col.y]), z = parseFloat(f[col.z]);
  const len = Math.hypot(x, y, z);
  if (!isFinite(len) || len === 0) continue;
  // Unit sky direction (positions are parsecs; only the direction matters).
  dirs.push(+(x / len).toFixed(5), +(y / len).toFixed(5), +(z / len).toFixed(5));
  mags.push(+mag.toFixed(2));
  const ci = parseFloat(f[col.ci]);
  cis.push(isFinite(ci) ? +ci.toFixed(2) : 0.5);
  const proper = (f[col.proper] || '').trim();
  if (proper && mag < 1.5) names.push([n, proper]);
  n++;
}

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/brightstars.json',
  JSON.stringify({ count: n, dirs, mags, cis, names }));
console.log(`wrote public/data/brightstars.json: ${n} stars, ${names.length} named (mag < 1.5)`);
