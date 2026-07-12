// Sun-calibration guard: the sim's SUBSOLAR POINT (geographic lat/lon, via
// the pixel-verified toLocal convention) must match the real sun at any UTC
// date. Reference: standard low-precision solar ephemeris for declination +
// MEAN-sun longitude (the engine's circular model has no equation of time,
// so apparent-sun longitude can differ by up to ~1°; eccentricity puts the
// declination off by up to ~2° near the phase extremes).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

// Reference: real subsolar point at a UTC date (mean-sun longitude).
function refSubsolar(utcMs) {
  const n = (utcMs - 946728000000) / 86400000; // days since J2000
  const rad = Math.PI / 180;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const decl = Math.asin(Math.sin(23.439 * rad) * Math.sin(lam)) / rad;
  const d = new Date(utcMs);
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = -(utcH - 12) * 15;
  if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  return { lat: decl, lon };
}

const DATES = [
  '1969-07-20T20:17:00Z', // system epoch (Apollo 11)
  '2026-07-11T01:45:00Z', // the reported-bug instant
  '2026-12-21T12:00:00Z', // December solstice, noon UTC
  '2026-03-20T18:00:00Z', // March equinox
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

const sim = await page.evaluate((dates) => {
  const { physics, renderer, THREE } = window.__sse;
  const mesh = renderer.primaryMesh;
  const subsolar = () => {
    mesh.updateWorldMatrix(true, false);
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    const c = mesh.getWorldPosition(new THREE.Vector3());
    const p = mesh.worldToLocal(c.clone().add(sunW)).normalize();
    return {
      lat: Math.asin(p.y) * 180 / Math.PI,
      lon: Math.atan2(-p.z, p.x) * 180 / Math.PI,
    };
  };
  const out = {};
  for (const iso of dates) {
    physics.setTimeIndex(0);
    physics.jumpToSimSeconds((Date.parse(iso) - physics.epochMs) / 1000);
    renderer.update(physics, 0.016, 1);
    out[iso] = subsolar();
  }
  return out;
}, DATES);

await browser.close();

const wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
let pass = true;
for (const iso of DATES) {
  const ref = refSubsolar(Date.parse(iso));
  const s = sim[iso];
  const dLat = s.lat - ref.lat, dLon = wrap(s.lon - ref.lon);
  const ok = Math.abs(dLat) < 3 && Math.abs(dLon) < 4;
  pass = pass && ok;
  console.log(`${ok ? ' ok ' : 'FAIL'} ${iso}  sim (${s.lat.toFixed(1)}, ${s.lon.toFixed(1)})  real (${ref.lat.toFixed(1)}, ${ref.lon.toFixed(1)})  dLat ${dLat.toFixed(1)}  dLon ${dLon.toFixed(1)}`);
}
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
