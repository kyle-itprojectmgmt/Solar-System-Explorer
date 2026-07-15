// v10.0.3 probe: Jupiter preset speeds + atmosphere gradient presence.
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

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

// ---- Jupiter preset speeds ----
{
  const { page, errors } = await load('jupiter');
  const speedAfter = (label, preTimeIndex) => page.evaluate(({ label, preTimeIndex }) => {
    const { physics } = window.__sse;
    if (preTimeIndex != null) physics.setTimeIndex(preTimeIndex); // simulate stale user speed
    const btn = [...document.querySelectorAll('.preset-row')]
      .find((b) => b.textContent.includes(label));
    if (!btn) return null;
    btn.click();
    return physics.timeMultiplier;
  }, { label, preTimeIndex });

  // Pre-set 500x (top step) before each click: presets must OVERRIDE stale
  // speed. v10.0.10 ladder: [0, 1, 5, 50, 500].
  check('Io Volcano Flyby -> 5x', await speedAfter('Io Volcano Flyby', 4) === 5);
  check('GRS Close Pass -> 5x', await speedAfter('GRS Close Pass', 4) === 5);
  check('Triple Moon Shadow -> 50x', await speedAfter('Triple Moon Shadow', 4) === 50);
  check('Voyager 1979 -> 50x', await speedAfter('Voyager 1979', 4) === 50);
  check('Moon Alignment -> 500x (top step)', await speedAfter('Moon Alignment', 1) === 500);
  check('jupiter: zero page errors', errors.length === 0, errors[0]);
  await page.close();
}

// ---- Atmosphere gradient: sample the halo along the lit limb ----
// Camera perpendicular to the sun, terminator vertical; walk outward from
// the disc edge on the lit side and record RGB at inner/outer halo samples.
// Physics paused + settled before the read (house probe rules).
async function limbGradient(system, body) {
  const { page } = await load(system);
  const res = await page.evaluate(async (body) => {
    const { cameraCtl, physics, renderer, THREE } = window.__sse;
    physics.paused = true;
    cameraCtl.setMode('orbit', body);
    const entry = renderer.bodyMeshes.get(body);
    const R = entry.radiusUnits;
    const t = entry.cfg.atmosphere?.thickness ?? 0.02; // shell band fraction
    cameraCtl.orbDist = R * 4;
    // Aim perpendicular to the sun so the lit limb is on one side.
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    cameraCtl.orbTheta = Math.atan2(sunW.z, sunW.x) + Math.PI / 2;
    cameraCtl.orbPhi = Math.PI / 2;
    cameraCtl.distTween = null;
    for (let i = 0; i < 90; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
    // House lesson: the starfield defeats luminance thresholds AND
    // renderer.update re-asserts ring visibility — hide sky/points/rings
    // AFTER the update, right before the raw renders.
    renderer.scene.traverse((o) => {
      if (o.isPoints) o.visible = false;
      if (o.isMesh && o.geometry?.parameters?.radius >= 1e6) o.visible = false;
      if (o.isMesh && /Ring|Torus/.test(o.geometry?.type ?? '')) o.visible = false;
    });
    // Diff render (house standard): with vs without the atmosphere shell in
    // ONE evaluate — the halo band self-locates from the pixel diff, no
    // screen-space silhouette math (tilted oblate ellipses defeated it).
    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const d = cameraCtl.orbDist;
    const fovY = renderer.camera.fov * Math.PI / 180;
    const rPix = Math.tan(Math.asin(R / d)) / Math.tan(fovY / 2) * (h / 2);
    const camRight = new THREE.Vector3().setFromMatrixColumn(renderer.camera.matrixWorld, 0);
    const sideSign = Math.sign(sunW.dot(camRight)) || 1;
    const cx = w / 2, cy = h / 2;
    const elev = 40 * Math.PI / 180;
    const buf = new Uint8Array(4);
    const readStrip = () => {
      const out = [];
      for (let rr = rPix * 0.85; rr <= rPix * 1.18; rr += 1) {
        const x = Math.round(cx + sideSign * Math.cos(elev) * rr);
        const y = Math.round(cy + Math.sin(elev) * rr);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        out.push([buf[0], buf[1], buf[2]]);
      }
      return out;
    };
    renderer.renderer.render(renderer.scene, renderer.camera);
    const withAtm = readStrip();
    renderer.atmosphereMesh.visible = false;
    renderer.renderer.render(renderer.scene, renderer.camera);
    const withoutAtm = readStrip();
    renderer.atmosphereMesh.visible = true;
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const diffs = withAtm.map((c, i) => ({
      i, col: c, d: lum(c) - lum(withoutAtm[i]),
    })).filter((p) => p.d > 3);
    if (!diffs.length) return { band: 0 };
    // Inner vs outer half of the located halo band.
    const half = Math.floor(diffs.length / 2);
    const avg = (arr) => {
      const s = arr.reduce((a, p) => [a[0] + p.col[0], a[1] + p.col[1], a[2] + p.col[2]], [0, 0, 0]);
      return s.map((v) => Math.round(v / arr.length));
    };
    return {
      band: diffs.length,
      inner: avg(diffs.slice(0, half || 1)),
      outer: avg(diffs.slice(half)),
    };
  }, body);
  await page.close();
  return res;
}

for (const [system, body] of [['earth', 'Earth'], ['jupiter', 'Jupiter'], ['saturn', 'Saturn'], ['mars', 'Mars'], ['neptune', 'Neptune'], ['uranus', 'Uranus']]) {
  const g = await limbGradient(system, body);
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  check(`${body} halo band located by diff render`, g.band >= 2, `band ${g.band}px`);
  if (g.band >= 2) {
    const li = lum(g.inner), lo = lum(g.outer);
    check(`${body} gradient: inner brighter than outer`, li > lo,
      `inner ${g.inner} outer ${g.outer} — lum ${li.toFixed(0)} -> ${lo.toFixed(0)}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
