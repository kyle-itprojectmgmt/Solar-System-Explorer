// Pole-snap reproduction + fix verification.
// Entry into insertion must keep the camera near its current position at
// ANY stored inclination; INC drags must never reset phase.
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
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const out = {};
  physics.setTimeIndex(0);
  const center = () => renderer.bodyWorldPos('Jupiter', new THREE.Vector3());
  const camLat = () => {
    const rel = cameraCtl.camera.position.clone().sub(center()).normalize();
    return THREE.MathUtils.radToDeg(Math.asin(rel.y));
  };
  const settle = () => { for (let i = 0; i < 30; i++) cameraCtl.update(0.05); };

  // Scenario A (the report): stored inclination 90 from earlier testing,
  // then enter insertion from free fly near the equator, ~-Z bearing
  // (equatorial longitude ~90°, the worst case for the old derivation).
  cameraCtl.ins.incDeg = 90;
  cameraCtl.setMode('free');
  cameraCtl.blend = 1; // finish the transition so the set position sticks
  const cJ = center();
  cameraCtl.camera.position.set(cJ.x + 30, cJ.y + 8, cJ.z - 120); // near equator, -Z side
  cameraCtl.fromPos.copy(cameraCtl.camera.position);
  cameraCtl.update(0.016);
  const beforeA = cameraCtl.camera.position.clone();
  const latBefore = camLat();
  cameraCtl.setMode('insertion', 'Jupiter');
  settle();
  out.aLatBefore = +latBefore.toFixed(1);
  out.aLatAfter = +camLat().toFixed(1);
  out.aMoveUnits = +cameraCtl.camera.position.distanceTo(beforeA).toFixed(1);
  out.aNotPole = Math.abs(out.aLatAfter) < 45;

  // Scenario B: orbit mode -> I. Camera stays approximately put.
  cameraCtl.setInsertion({ incDeg: 0 });
  cameraCtl.setMode('orbit', 'Jupiter');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.orbTheta = 2.2; cameraCtl.orbPhi = 1.3;
  cameraCtl.orbDist = renderer.bodyRadius('Jupiter') * 2.2;
  settle();
  const beforeB = cameraCtl.camera.position.clone();
  cameraCtl.setMode('insertion', 'Jupiter');
  settle();
  out.bMoveUnits = +cameraCtl.camera.position.distanceTo(beforeB).toFixed(1);
  // Geometric floor: at inc 0 the insertion orbit is equatorial, so the
  // camera must descend from orbPhi 1.3 rad (~15° latitude) to the plane:
  // orbDist·sin(15°) ≈ 42u. "Approximately put" = within ~1.3x of that.
  out.bStays = out.bMoveUnits < renderer.bodyRadius('Jupiter') * 2.2 * Math.cos(1.3) * 1.35;

  // Scenario C: in insertion at 0°, drag INC to 7° via the panel slider.
  const phase0 = cameraCtl.ins.phase;
  const beforeC = cameraCtl.camera.position.clone();
  const latC0 = camLat();
  const slider = [...document.querySelectorAll('input.slider')].find((s) => s.min === '-90');
  slider.value = 7; slider.dispatchEvent(new Event('input'));
  settle();
  out.cPhasePreserved = Math.abs(cameraCtl.ins.phase - phase0) < 1e-6;
  out.cLatDelta = +(camLat() - latC0).toFixed(1);
  out.cSmallMove = cameraCtl.camera.position.distanceTo(beforeC) < renderer.bodyRadius('Jupiter') * 0.5;

  // Back to 0 returns near original.
  slider.value = 0; slider.dispatchEvent(new Event('input'));
  settle();
  out.dReturn = +cameraCtl.camera.position.distanceTo(beforeC).toFixed(2);
  out.dBack = cameraCtl.camera.position.distanceTo(beforeC) < 0.5;

  // Sliders in sync.
  const sliders = [...document.querySelectorAll('input.slider')].filter((s) => s.min === '-90');
  slider.value = 25; slider.dispatchEvent(new Event('input'));
  out.sync = sliders.every((s) => +s.value === 25);
  return out;
});

check('A: enter insertion with stored 90° — no pole snap', r.aNotPole,
  `lat ${r.aLatBefore} -> ${r.aLatAfter}, moved ${r.aMoveUnits}u`);
check('B: orbit -> I stays approximately put', r.bStays, `${r.bMoveUnits}u`);
check('C: INC drag 0->7 preserves phase', r.cPhasePreserved);
check('C: 7° drag tilts ~7°, small move', Math.abs(r.cLatDelta) < 10 && r.cSmallMove, `dLat ${r.cLatDelta}`);
check('D: back to 0° returns near original', r.dBack, `${r.dReturn}u`);
check('sliders stay in sync', r.sync);
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
