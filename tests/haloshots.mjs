// Thin-atmosphere halo verification (post-v7 hardware fix).
//
// Disc test (Earth, Mars, Io, Europa, Ganymede): whole-disc framing with
// the terminator vertical, camera perpendicular to the sun. The disc edge
// position is computed analytically (asin(R/d) projected to pixels), then
// pixels just OUTSIDE the edge are sampled on the lit and night halves:
// the lit limb may carry a thin glow, the night limb must carry none.
//
// Limb close-ups (spec altitudes: Io 370 km, Earth 2,919 km + 405 km ISS
// horizon line): camera at altitude aimed at the lit tangent point —
// screenshots for visual review, no pixel assertion (framing only).
//
//   SMOKE_URL=http://localhost:5173 node tests/haloshots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
mkdirSync('tests/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

let failures = 0;
const pages = new Map(); // one page per system — reused across probes

async function getPage(system) {
  if (pages.has(system)) return pages.get(system);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?system=${system}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(() => {
    const { physics, ui, cameraCtl } = window.__sse;
    ui.setPresentation(true);
    physics.setTimeIndex(0);
    cameraCtl.setMode('free');
    for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  });
  pages.set(system, page);
  return page;
}

// Place the camera, render one frame, and return the raw pixel buffer
// metadata needed for sampling. lookOffset aims off-center (limb shots).
function renderFrom(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function discProbe(system, body, { maxLitHaloPx, label }) {
  const page = await getPage(system);
  const res = await page.evaluate((bodyName) => {
    const { renderer, physics, cameraCtl, THREE } = window.__sse;
    const center = renderer.bodyWorldPos(bodyName, new THREE.Vector3());
    const R = renderer.bodyRadius(bodyName);
    const FOV = 40;
    const dist = R * 3.5;
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    // Perpendicular to the sun: terminator vertical, lit half toward the sun.
    const side = new THREE.Vector3(0, 1, 0).cross(sunW).normalize();
    renderer.camera.position.copy(center).addScaledVector(side, dist);
    renderer.camera.lookAt(center);
    renderer.camera.fov = FOV; renderer.camera.updateProjectionMatrix();
    const e = new THREE.Euler().setFromQuaternion(renderer.camera.quaternion, 'YXZ');
    cameraCtl.yaw = e.y; cameraCtl.pitch = e.x;
    renderer.update(physics, 0.016, 1);

    // Diff-render: frame with atmosphere shells vs without. The halo is
    // exactly what disappears; stars/clouds/terrain cancel out.
    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = () => {
      renderer.renderer.render(renderer.scene, renderer.camera);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    const withAtmos = grab();
    const shells = [];
    renderer.scene.traverse((o) => {
      const u = o.material?.uniforms;
      if (o.visible && u && (u.uFresnelPow || u.uSunW)) { shells.push(o); o.visible = false; }
    });
    const withoutAtmos = grab();
    shells.forEach((o) => { o.visible = true; });
    const px = withAtmos; // |with − without| sampled below
    for (let i = 0; i < px.length; i++) px[i] = Math.abs(withAtmos[i] - withoutAtmos[i]);

    // Analytic silhouette: angular radius asin(R/d) projected to pixels.
    const discPx = Math.tan(Math.asin(R / dist)) /
      Math.tan((FOV / 2) * Math.PI / 180) * (h / 2);
    const cx = w / 2, cy = h / 2;
    const lum = (x, y) => {
      const i = ((Math.round(y) * w) + Math.round(x)) * 4;
      return (px[i] + px[i + 1] + px[i + 2]) / 3;
    };
    // Which screen side is lit? Project a sun-ward point.
    const litRight = center.clone().addScaledVector(sunW, R).project(renderer.camera).x > 0;

    // Sample rings just outside the silhouette (1.5px margin for AA) out
    // to +12% of the radius, at 5° steps over each half. Track the max
    // luminance and the radial glow run at the worst angle.
    const sampleHalf = (litHalf) => {
      let maxLum = 0, maxRun = 0;
      for (let deg = -80; deg <= 80; deg += 5) {
        const a = deg * Math.PI / 180;
        const dirX = (litHalf === litRight ? 1 : -1) * Math.cos(a);
        const dirY = Math.sin(a);
        let run = 0;
        for (let rr = discPx + 1.5; rr <= discPx * 1.12; rr += 1) {
          const l = lum(cx + dirX * rr, cy + dirY * rr);
          if (l > maxLum) maxLum = l;
          if (l > 8) run++; else if (run) break;
        }
        if (run > maxRun) maxRun = run;
      }
      return { maxLum, maxRun };
    };
    return { lit: sampleHalf(true), night: sampleHalf(false), discPx: Math.round(discPx) };
  }, body);

  await page.screenshot({ path: `tests/shots/halo-disc-${body.toLowerCase()}.png` });
  const { lit, night } = res;
  console.log(`${label ?? body} disc (r=${res.discPx}px) — lit halo: run ${lit.maxRun}px, peak ${Math.round(lit.maxLum)}; ` +
    `night halo: run ${night.maxRun}px, peak ${Math.round(night.maxLum)}`);
  if (night.maxRun > 2 || night.maxLum > 20) {
    console.log(`FAIL ${body}: night-side halo present (must be dark)`); failures++;
  }
  if (lit.maxRun > maxLitHaloPx) {
    console.log(`FAIL ${body}: lit halo ${lit.maxRun}px exceeds thin-limb budget ${maxLitHaloPx}px`); failures++;
  }
}

// Close-up: camera at spec altitude, aimed at the lit (or night) limb
// tangent point. Screenshot only — reviewed visually.
async function limbShot(system, body, altKm, whichSide, tag) {
  const page = await getPage(system);
  await page.evaluate((bodyName, alt, sideSign) => {
    const { renderer, physics, cameraCtl, THREE } = window.__sse;
    const center = renderer.bodyWorldPos(bodyName, new THREE.Vector3());
    const R = renderer.bodyRadius(bodyName);
    const d = R + alt / 1000;
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(sunW).normalize();
    renderer.camera.position.copy(center).addScaledVector(side, d);
    // Tangent point on the lit (sideSign=+1) or night (−1) limb: rotate the
    // center direction by the tangent angle toward ±sun.
    const toCenter = center.clone().sub(renderer.camera.position).normalize();
    const tangentAngle = Math.asin(R / d);
    const target = renderer.camera.position.clone().addScaledVector(
      toCenter.clone().applyAxisAngle(
        new THREE.Vector3().crossVectors(toCenter, sunW).normalize(),
        sideSign * tangentAngle).normalize(), d);
    renderer.camera.lookAt(target);
    renderer.camera.fov = 55; renderer.camera.updateProjectionMatrix();
    const e = new THREE.Euler().setFromQuaternion(renderer.camera.quaternion, 'YXZ');
    cameraCtl.yaw = e.y; cameraCtl.pitch = e.x;
    renderer.update(physics, 0.016, 1);
    renderer.renderer.render(renderer.scene, renderer.camera);
  }, body, altKm, whichSide === 'lit' ? 1 : -1);
  const file = `tests/shots/halo-limb-${body.toLowerCase()}-${altKm}km-${tag ?? whichSide}.png`;
  await page.screenshot({ path: file });
  console.log(`shot: ${file}`);
}

// Disc-ring assertions — the universal fix. Lit budgets scale with how
// prominent each atmosphere should be (Earth widest, Europa thinnest).
await discProbe('earth', 'Earth', { maxLitHaloPx: 14 });
await discProbe('mars', 'Mars', { maxLitHaloPx: 12 });
await discProbe('jupiter', 'Io', { maxLitHaloPx: 8 });
await discProbe('jupiter', 'Europa', { maxLitHaloPx: 8 });
await discProbe('jupiter', 'Ganymede', { maxLitHaloPx: 8 });

// Spec-altitude close-ups for visual review.
await limbShot('earth', 'Earth', 2919, 'lit');
await limbShot('earth', 'Earth', 2919, 'night');
await limbShot('earth', 'Earth', 405, 'lit', 'iss');
await limbShot('jupiter', 'Io', 369, 'lit');

for (const p of pages.values()) await p.close();
await browser.close();
console.log(failures ? `FAIL (${failures})` : 'PASS');
process.exit(failures ? 1 : 0);
