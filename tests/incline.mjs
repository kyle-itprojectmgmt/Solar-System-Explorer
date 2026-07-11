// V4d Item 1 diagnosis: what do the CURRENT inclination mechanics do?
// Measures, per inclination: camera latitude sweep over a revolution
// (polar orbits must reach ±~90°), Jupiter's screen-space offset from
// view center (must stay centered), and traversal direction.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

const res = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const out = {};
  const run = (incDeg) => {
    cameraCtl.setMode('insertion', 'Jupiter');
    cameraCtl.setInsertion({ body: 'Jupiter', altitudeKm: 30000, incDeg, locked: false });
    cameraCtl.blend = 1; // skip transition
    const center = renderer.bodyWorldPos('Jupiter', new THREE.Vector3());
    let minLat = 90, maxLat = 90 * -1, offSum = 0, n = 0;
    const phases = [];
    // Drive one+ revolution purely via sim time (period at 30,000 km ~ 3.9 h).
    for (let i = 0; i < 400; i++) {
      physics.simSeconds += 40; // advance sim clock directly
      cameraCtl._lastSimSec = physics.simSeconds - 40;
      cameraCtl.update(0.016);
      const rel = cameraCtl.camera.position.clone().sub(center);
      const lat = THREE.MathUtils.radToDeg(Math.asin(rel.clone().normalize().y));
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      // Jupiter's projected offset from screen center (NDC units).
      const p = center.clone().project(cameraCtl.camera);
      offSum += Math.hypot(p.x, p.y); n++;
      if (i % 100 === 0) phases.push(+cameraCtl.ins.phase.toFixed(2));
    }
    return {
      minLat: +minLat.toFixed(1), maxLat: +maxLat.toFixed(1),
      meanCenterOffset: +(offSum / n).toFixed(3),
      phaseTrend: phases[3] > phases[0] ? 'prograde' : 'retrograde',
    };
  };
  out.inc0 = run(0);
  out.inc45 = run(45);
  out.inc90 = run(90);
  out.incNeg90 = run(-90);

  // Plane-change continuity: tilting from equatorial must NOT move the
  // camera (its position becomes the line of nodes).
  cameraCtl.setMode('insertion', 'Jupiter');
  cameraCtl.setInsertion({ body: 'Jupiter', altitudeKm: 30000, incDeg: 0, locked: false });
  cameraCtl.blend = 1;
  cameraCtl.update(0.016);
  const before = cameraCtl.camera.position.clone();
  cameraCtl.setInsertion({ incDeg: 60 });
  cameraCtl.blend = 1; // evaluate the new pose directly
  cameraCtl.update(0.016);
  out.planeChangeJumpUnits = +cameraCtl.camera.position.distanceTo(before).toFixed(4);
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
