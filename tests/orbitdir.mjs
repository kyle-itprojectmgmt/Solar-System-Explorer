// Orbit-direction probe: measures the GEOGRAPHIC longitude drifting under
// the camera (east-positive, via the pixel-verified toLocal convention from
// nightlights.mjs) instead of trusting any angle sign convention.
//   prograde  => sub-camera longitude drifts EAST  (positive delta)
//   retrograde=> sub-camera longitude drifts WEST  (negative delta)
// Checks: Orbit mode, insertion 0° (prograde), insertion −51.6° (retrograde),
// GeoSync (stationary). Exits 0 only when all four match real-world behavior.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const mesh = renderer.primaryMesh;

  // East-positive geographic longitude under the camera. Inverse of the
  // nightlights.mjs mapping: local = (cos la cos lo, sin la, -cos la sin lo).
  const subCamLon = () => {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.worldToLocal(renderer.camera.position.clone()).normalize();
    return Math.atan2(-p.z, p.x) * 180 / Math.PI;
  };
  const unwrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);

  // Advance SIM time frame-by-frame so camera integrators see each step.
  const run = (simStepS, frames) => {
    const l0 = subCamLon();
    const p0 = { phase: cameraCtl.ins.phase, orbTheta: cameraCtl.orbTheta };
    for (let i = 0; i < frames; i++) {
      physics.jumpToSimSeconds(physics.simSeconds + simStepS);
      renderer.update(physics, 0.016, 1);
      cameraCtl.update(0.016);
    }
    return {
      lonDeltaDeg: unwrap(subCamLon() - l0),
      phaseDelta: cameraCtl.ins.phase - p0.phase,
      orbThetaDelta: cameraCtl.orbTheta - p0.orbTheta,
    };
  };
  const settle = () => { for (let i = 0; i < 60; i++) cameraCtl.update(0.05); };

  const out = {};
  physics.setTimeIndex(0);
  physics.jumpToSimSeconds(0);
  renderer.update(physics, 0.016, 1);

  // 1. Orbit mode (default camera mode) — 20 s sim, 1 s steps.
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 1;
  settle();
  out.orbit = run(1, 20);

  // 2. Orbit Insertion, 0° inclination (prograde), ISS-ish altitude.
  cameraCtl.setMode('insertion', 'Earth');
  cameraCtl.setInsertion({ body: 'Earth', altitudeKm: 420, incDeg: 0, locked: false });
  settle();
  out.insertionPrograde = run(10, 60); // 600 s sim ≈ 11% of an orbit

  // 3. Negative inclination = retrograde traversal.
  cameraCtl.setInsertion({ incDeg: -51.6 });
  settle();
  out.insertionRetro = run(10, 60);

  // 4. GeoSync — surface must stay put beneath the camera.
  cameraCtl.presetGeoSync();
  settle();
  out.geoSync = run(60, 60); // a full sim hour

  return out;
});

await browser.close();

const fmt = (r) => `lonΔ ${r.lonDeltaDeg.toFixed(2)}°  (phaseΔ ${r.phaseDelta.toFixed(4)}, orbThetaΔ ${r.orbThetaDelta.toFixed(4)})`;
console.log('orbit mode          :', fmt(res.orbit), '— want lonΔ > 0 (east/prograde)');
console.log('insertion 0° inc    :', fmt(res.insertionPrograde), '— want lonΔ > 0 (east/prograde)');
console.log('insertion −51.6° inc:', fmt(res.insertionRetro), '— want lonΔ < 0 (west/retrograde)');
console.log('geoSync             :', fmt(res.geoSync), '— want |lonΔ| ≈ 0 (locked)');

const pass =
  res.orbit.lonDeltaDeg > 1 &&
  res.insertionPrograde.lonDeltaDeg > 1 &&
  res.insertionRetro.lonDeltaDeg < -1 &&
  Math.abs(res.geoSync.lonDeltaDeg) < 0.5;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
