// Fix B verification: ring altitude floor + geosync exemption + GRS routing.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

const r = await page.evaluate(() => {
  const { cameraCtl, physics, renderer } = window.__sse;
  physics.setTimeIndex(0);
  const out = {};

  // ALT slider / setInsertion cannot go below the ring floor on Jupiter.
  cameraCtl.setMode('insertion', 'Jupiter');
  cameraCtl.setInsertion({ body: 'Jupiter', altitudeKm: 60000, incDeg: 30, locked: false });
  out.clampedUp = cameraCtl.ins.altitudeKm;
  // Note surfaces once via onInsertionChange:
  out.noteShown = [...document.querySelectorAll('.notification')]
    .some((n) => /Minimum safe altitude/.test(n.textContent));

  // Zoom-in pinch cannot cross it either.
  for (let i = 0; i < 300; i++) cameraCtl._pinch(400);
  out.pinchFloor = Math.round(cameraCtl.ins.altitudeKm);

  // Geosync exemption: preset still parks at the physical geosync altitude.
  cameraCtl.presetGeoSync();
  out.geosyncAlt = Math.round(cameraCtl.ins.altitudeKm);
  out.geosyncLocked = cameraCtl.ins.locked;

  // Unlocking below the floor lifts the camera above the rings.
  cameraCtl.setInsertion({ locked: false });
  out.unlockLift = Math.round(cameraCtl.ins.altitudeKm);

  // GRS preset routes through orbit mode and reaches 20,000 km.
  const preset = renderer.system.primary.navPresets[0];
  cameraCtl.flyToFeature('Jupiter', preset);
  for (let i = 0; i < 80; i++) cameraCtl.update(0.05);
  const entry = renderer.bodyMeshes.get('Jupiter');
  out.grsMode = cameraCtl.mode;
  out.grsAltKm = Math.round((cameraCtl.orbDist - entry.radiusUnits) * 1000);

  // Moons unaffected (Io floor still 150 km).
  cameraCtl.setMode('insertion', 'Io');
  cameraCtl.setInsertion({ body: 'Io', altitudeKm: 10, locked: false });
  out.ioFloor = Math.round(cameraCtl.ins.altitudeKm);
  return out;
});

check('insertion altitude clamped above rings (160,000 km)', r.clampedUp === 160000, r.clampedUp);
check('"Minimum safe altitude" note shown', r.noteShown);
check('pinch zoom respects ring floor', r.pinchFloor >= 160000, r.pinchFloor);
check('GeoSync exempt — parks at 88,508 km locked', r.geosyncAlt === 88508 && r.geosyncLocked, r.geosyncAlt);
check('unlocking below floor lifts above rings', r.unlockLift === 160000, r.unlockLift);
check('GRS preset uses orbit mode at ~20,000 km', r.grsMode === 'orbit' && Math.abs(r.grsAltKm - 20000) < 500, `${r.grsMode} ${r.grsAltKm}`);
check('Io insertion floor unchanged (150 km)', r.ioFloor === 150, r.ioFloor);
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
