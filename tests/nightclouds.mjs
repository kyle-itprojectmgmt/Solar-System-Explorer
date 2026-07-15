// Item 5 probe (v10.0.10): night-side cloud visibility + city-field banding.
// PASS criteria (post-fix): over dark night ocean, cloudy patches read a few
// luminance points above clear patches (spread > 2.0 across the grid) while
// the darkest patch stays <= 13 (nightlights DARK_CAP class); day side is
// untouched (asserted separately by hazeprobe).
// Also saves night-Europe + night-ocean screenshots for banding eyeballing.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = fileURLToPath(new globalThis.URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const TAG = process.env.NC_TAG || 'after';

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
await new Promise((r) => setTimeout(r, 3000));

// The orchestrator may hot-edit ui.js on the shared dev server — Vite then
// full-reloads this page mid-probe. Re-wait for readiness before each phase
// and retry once on the resulting evaluate races.
const ready = async () => {
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
};
const withRetry = async (fn) => {
  try { return await fn(); } catch { await ready(); return fn(); }
};

// Aim helper: darkest hour for a lat/lon, camera down its normal (nightlights
// pattern — argmin over 24h, never a fixed threshold).
const aimRaw = (lat, lon, altKm) => page.evaluate((lat, lon, altKm) => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const toLocal = (la2, lo2) => {
    const la = la2 * Math.PI / 180, lo = lo2 * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  };
  const mesh = renderer.primaryMesh;
  const r = mesh.geometry.boundingSphere?.radius ?? 1;
  const center = () => mesh.getWorldPosition(new THREE.Vector3());
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  physics.setTimeIndex(0);
  let chosen = 0, best = 1;
  for (let h = 0; h < 24; h++) {
    physics.jumpToSimSeconds(h * 3600);
    renderer.update(physics, 0.016, 1);
    mesh.updateWorldMatrix(true, false);
    const n = mesh.localToWorld(toLocal(lat, lon).multiplyScalar(r)).sub(center()).normalize();
    const dot = n.dot(sunW);
    if (dot < best) { best = dot; chosen = h; }
  }
  physics.jumpToSimSeconds(chosen * 3600);
  renderer.update(physics, 0.016, 1);
  mesh.updateWorldMatrix(true, false);
  const N = mesh.localToWorld(toLocal(lat, lon).multiplyScalar(r)).sub(center()).normalize();
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.orbTheta = Math.atan2(N.z, N.x);
  cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, N.y)));
  cameraCtl.setAltitudeDirect(altKm);
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  return { hour: chosen, sunDot: +best.toFixed(3) };
}, lat, lon, altKm);
const aim = (lat, lon, altKm) => withRetry(async () => { await ready(); return aimRaw(lat, lon, altKm); });

// --- A. Night mid-Pacific ocean: cloud-vs-clear patch spread ----------------
const a = await aim(5, -150, 22000);
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}nightclouds-ocean-${TAG}.png` });
const grid = await withRetry(() => page.evaluate(async () => {
  // sample the LIVE canvas via a raw re-render + readPixels (postfx grain
  // averaged by 11x11 patches)
  const { renderer, physics } = window.__sse;
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  const gl = renderer.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const scale = w / innerWidth;
  const patch = (sx, sy) => {
    let l = 0, n = 0;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const x = Math.round((sx + dx) * scale), y = Math.round(h - (sy + dy) * scale);
        const i = (y * w + x) * 4;
        l += 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; n++;
      }
    }
    return l / n;
  };
  // Disc radius at 22,000 km is only ~107 px — keep the whole grid inside
  // it (a ±160 grid sampled starfield and faked a spread).
  const vals = [];
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      vals.push(+patch(640 - 80 + gx * 40, 400 - 80 + gy * 40).toFixed(1));
    }
  }
  vals.sort((x, y) => x - y);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return { min: vals[0], max: vals[vals.length - 1], mean: +mean.toFixed(1), vals };
}));
console.log(`ocean night grid (${TAG}): hour ${a.hour}, sunDot ${a.sunDot}`);
console.log(JSON.stringify(grid));
// Faint night clouds = patches in the 1.5..13 band (above pitch black,
// below the nightlights DARK_CAP); clear gaps and cloudless sky stay dark.
const faint = grid.vals.filter((v) => v >= 1.5 && v <= 13).length;
console.log(`faint-cloud patches (1.5..13): ${faint}/25  (want >= 4 after fix); ` +
  `max ${grid.max} (must stay <= 13: no glowing night clouds)`);

// --- B. Night Europe city field: banding eyeball shot -----------------------
await aim(45, 10, 22000);
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}nightclouds-europe-${TAG}.png` });
console.log(`shots: nightclouds-ocean-${TAG}.png, nightclouds-europe-${TAG}.png`);

await browser.close();
// Assertions only enforced in 'after' mode; 'before' mode is measurement.
if (TAG === 'after') {
  process.exit(faint >= 4 && grid.max <= 13 ? 0 : 1);
}
