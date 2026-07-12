// V5c bug #49 probe: curated SAVE presets are scoped per system — Jupiter
// flybys must not appear on Earth and vice versa — and each new Earth
// preset actually drives the camera (ISS altitude tween, Earthrise
// sequence, dark-city aim, dark-pole aurora aim).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

const JUPITER_SET = ['Io Volcano Flyby', 'Triple Moon Shadow', 'GRS Close Pass', 'Voyager 1979', 'Moon Alignment'];
const EARTH_SET = ['ISS Orbit View', 'Earthrise', 'Apollo 11', 'City Lights at Night', 'Aurora from Orbit'];

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

async function load(system) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?system=${system}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  return { page, errors };
}

const labels = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.preset-row')].map((b) => b.textContent));

// ---- Jupiter scoping ----
{
  const { page, errors } = await load('jupiter');
  const got = await labels(page);
  for (const want of JUPITER_SET)
    check(`jupiter shows "${want}"`, got.some((l) => l.includes(want)));
  for (const not of EARTH_SET)
    check(`jupiter hides "${not}"`, !got.some((l) => l.includes(not)));
  check('jupiter: zero page errors', errors.length === 0, errors[0]);
  await page.close();
}

// ---- Earth scoping + preset behavior ----
{
  const { page, errors } = await load('earth');
  const got = await labels(page);
  for (const want of EARTH_SET)
    check(`earth shows "${want}"`, got.some((l) => l.includes(want)));
  for (const not of JUPITER_SET)
    check(`earth hides "${not}"`, !got.some((l) => l.includes(not)));

  const clickAndSettle = (label) => page.evaluate((label) => {
    const btn = [...document.querySelectorAll('.preset-row')]
      .find((b) => b.textContent.includes(label));
    if (!btn) return null;
    btn.click();
    const { cameraCtl, physics, renderer } = window.__sse;
    for (let i = 0; i < 120; i++) cameraCtl.update(0.05); // 6 s of camera time
    renderer.update(physics, 0.016, 1);
    const mesh = renderer.primaryMesh;
    mesh.updateWorldMatrix(true, false);
    const THREE = window.__sse.THREE;
    const center = mesh.getWorldPosition(new THREE.Vector3());
    const camDir = renderer.camera.position.clone().sub(center).normalize();
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    return {
      mode: cameraCtl.mode,
      target: cameraCtl.target,
      seqLen: cameraCtl.activeSeq?.length ?? 0,
      orbDist: cameraCtl.orbDist,
      camLatDeg: Math.asin(Math.max(-1, Math.min(1, camDir.y))) * 180 / Math.PI,
      camSunDot: camDir.dot(sunW),
    };
  }, label);

  // ISS: orbit mode tweens to Earth radius + 408 km (units are 1000 km).
  const iss = await clickAndSettle('ISS Orbit View');
  check('ISS preset: orbit mode on Earth', iss?.mode === 'orbit' && iss?.target === 'Earth', JSON.stringify(iss));
  check('ISS preset: altitude ~408 km', iss && Math.abs((iss.orbDist - 6.371) * 1000 - 408) < 60,
    iss ? `${((iss.orbDist - 6.371) * 1000).toFixed(0)} km` : 'no result');

  // Earthrise: one-shot cinematic sweep around the Moon at a lunar phase
  // where Earth is mostly lit (the preset jumps up to a month ahead).
  const rise = await clickAndSettle('Earthrise');
  check('Earthrise preset: cinematic sweep', rise?.mode === 'cinematic' && rise?.seqLen === 1, JSON.stringify(rise));
  const fullness = await page.evaluate(() => {
    const { renderer, THREE } = window.__sse;
    const moon = renderer.bodyWorldPos('Moon', new THREE.Vector3()).clone();
    const earth = renderer.bodyWorldPos('Earth', new THREE.Vector3());
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    return moon.sub(earth).normalize().dot(sunW);
  });
  check('Earthrise preset: Earth mostly lit from the Moon', fullness > 0.5, `fullness ${fullness.toFixed(2)}`);

  // City lights: camera parked over the night side.
  const city = await clickAndSettle('City Lights at Night');
  check('City Lights preset: night-side aim', city && city.camSunDot < -0.2, `camSunDot ${city?.camSunDot?.toFixed(2)}`);

  // Aurora: camera at a high-latitude pole (epoch = July -> dark south pole).
  const aur = await clickAndSettle('Aurora from Orbit');
  check('Aurora preset: polar aim', aur && Math.abs(aur.camLatDeg) > 55, `cam lat ${aur?.camLatDeg?.toFixed(1)}`);

  check('earth: zero page errors', errors.length === 0, errors[0]);
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
