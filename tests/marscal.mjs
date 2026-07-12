// Mars sun-calibration guard (V6 1c), suncal.mjs's sibling. Mars has no
// cheap full ephemeris here, so this asserts the documented epoch geometry
// plus internal consistency of the circular model:
//   1. Subsolar point at the Viking 1 epoch = (+25.0°, 111.5°W) ± 2°
//      (Ls ≈ 97°; landing at 16:13 LMST @ 49.97°W → sun 61.6° west of site).
//   2. Sol vs sidereal: the subsolar longitude returns after one SOL
//      (24.6597 h), NOT after one sidereal day (24.6229 h) — the sidereal
//      residual is ~0.54°, which catches solar/sidereal day mix-ups.
//   3. Seasons: declination ≈ −3° a quarter Mars-year after the epoch and
//      ≈ −25° at the half year (sin(Ls) phasing through the orbit).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

const SOL_H = 24.6597, SIDEREAL_H = 24.6229, YEAR_D = 686.98;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/?system=mars`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

const sim = await page.evaluate((probes) => {
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
  for (const [name, s] of Object.entries(probes)) {
    physics.setTimeIndex(0);
    physics.jumpToSimSeconds(s);
    renderer.update(physics, 0.016, 1);
    out[name] = subsolar();
  }
  return out;
}, {
  epoch: 0,
  plusSol: SOL_H * 3600,
  plusSidereal: SIDEREAL_H * 3600,
  quarterYear: (YEAR_D / 4) * 86400,
  halfYear: (YEAR_D / 2) * 86400,
});

await browser.close();

const wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
let pass = true;
const check = (name, ok, detail) => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name} — ${detail}`);
  pass = pass && ok;
};

const e = sim.epoch;
check('epoch subsolar latitude ≈ +25.0°', Math.abs(e.lat - 25.0) < 2,
  `sim ${e.lat.toFixed(1)}°`);
check('epoch subsolar longitude ≈ 111.5°W', Math.abs(wrap(e.lon - -111.5)) < 2,
  `sim ${e.lon.toFixed(1)}°`);

const dSol = Math.abs(wrap(sim.plusSol.lon - e.lon));
const dSid = Math.abs(wrap(sim.plusSidereal.lon - e.lon));
check('subsolar lon returns after one SOL', dSol < 0.3, `drift ${dSol.toFixed(2)}°`);
check('one sidereal day leaves ~0.54° residual', dSid > 0.3 && dSid < 0.8,
  `residual ${dSid.toFixed(2)}° (0 here = solar/sidereal day mix-up)`);

check('quarter-year declination ≈ −3°', Math.abs(sim.quarterYear.lat - -3.0) < 2.5,
  `sim ${sim.quarterYear.lat.toFixed(1)}°`);
check('half-year declination ≈ −25°', Math.abs(sim.halfYear.lat - -25.0) < 2.5,
  `sim ${sim.halfYear.lat.toFixed(1)}°`);

console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
