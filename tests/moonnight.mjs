// Night-side detail bleed probe (v8.0.1, bug class = Mars #55). Parks the
// camera over each body's ANTI-SOLAR point and measures the night-side
// luminance: max, mean, and "bright" pixel count. Camera pose + render +
// readPixels happen inside ONE evaluate (single JS task — the rAF loop
// cannot interleave, and the WebGL buffer is read before it's cleared).
// Run against `npm run dev` (SMOKE_URL, default :5175).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

const PROBES = [
  { system: 'earth', body: 'Moon', altKm: 3480 },
  { system: 'earth', body: 'Moon', altKm: 10888, region: 0.14 },
  { system: 'mercury', body: 'Mercury', altKm: 2000 },
  { system: 'uranus', body: 'Miranda', altKm: 500 },
  { system: 'uranus', body: 'Ariel', altKm: 1000 },
  { system: 'neptune', body: 'Triton', altKm: 800 },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

const results = [];
let currentSystem = null, page = null;
for (const probe of PROBES) {
  if (probe.system !== currentSystem) {
    if (page) await page.close();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE}/?system=${probe.system}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));
    currentSystem = probe.system;
  }
  const stats = await page.evaluate((body, altKm, region) => {
    const { physics, renderer, cameraCtl, ui, THREE } = window.__sse;
    ui.setPresentation(true);
    physics.setTimeIndex(0);
    renderer.update(physics, 0.016, 1);

    // Anti-solar point in world space.
    const sunW = new THREE.Vector3(
      physics.sunDir.x, physics.sunDir.y, physics.sunDir.z)
      .applyQuaternion(renderer.root.quaternion).normalize();
    const center = renderer.bodyWorldPos(body, new THREE.Vector3()).clone();
    const rUnits = renderer.bodyRadius(body);
    const camPos = center.clone().addScaledVector(sunW, -(rUnits + altKm / 1000));

    cameraCtl.setMode('free');
    const cam = renderer.camera;
    cam.position.copy(camPos);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);

    // Force detail uniforms for this pose, then render + read synchronously.
    renderer.update(physics, 0.016, 1);
    cam.position.copy(camPos); cam.lookAt(center); cam.updateMatrixWorld(true);
    renderer.renderer.render(renderer.scene, renderer.camera);

    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    // Sample the central region (default 40%) — the body's night disc must
    // fill it; per-probe `region` shrinks it where the disc is small.
    const frac = region || 0.4;
    const x0 = Math.floor(w * (0.5 - frac / 2)), y0 = Math.floor(h * (0.5 - frac / 2));
    const sw = Math.floor(w * frac), sh = Math.floor(h * frac);
    const buf = new Uint8Array(sw * sh * 4);
    gl.readPixels(x0, y0, sw, sh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let max = 0, sum = 0, bright = 0;
    const n = sw * sh;
    for (let i = 0; i < n; i++) {
      const lum = 0.299 * buf[i * 4] + 0.587 * buf[i * 4 + 1] + 0.114 * buf[i * 4 + 2];
      if (lum > max) max = lum;
      sum += lum;
      if (lum > 25) bright++;
    }
    ui.setPresentation(false);
    return { max: Math.round(max), mean: +(sum / n).toFixed(1), bright, n };
  }, probe.body, probe.altKm, probe.region);
  results.push({ ...probe, ...stats });
  console.log(`${probe.system}/${probe.body} @ ${probe.altKm} km: max ${stats.max}, mean ${stats.mean}, bright(>25) ${stats.bright}/${stats.n}`);
}
if (page) await page.close();
await browser.close();

// Gates (post-fix): night max <= 8% (~20/255) everywhere except the Moon's
// earthshine (<= 8% too per spec); bright-pixel count ~0.
const fails = results.filter((r) => r.max > 20 || r.bright > 50);
if (process.env.GATE === '1') {
  console.log(fails.length ? `\nGATE FAIL: ${fails.length} probes above night budget` : '\nGATE PASS');
  process.exit(fails.length ? 1 : 0);
}
