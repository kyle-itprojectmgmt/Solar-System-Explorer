// V5c bug #42 probe: sun glint footprint + cloud confetti at low altitude.
// Nadir over the subsolar point IS the specular point (n = sun = view), so
// aim there at 2,113 km over the open Pacific and measure the bright-blob
// footprint: pixels above luminance 200 around screen center, reported as
// an equivalent surface diameter. Old shader (pow 400, no dither) measured
// ~450 km core; the fix (altitude-scaled sharpness, 6000 close) measures
// ~157 km. Gate: core < 250 km with a feathered rim (halo/core > 1.3).
// The screenshot doubles as the cloud-confetti visual reference (LAYER 5
// edge erosion — no wall-to-wall dots inside dense decks).
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = fileURLToPath(new globalThis.URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

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
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const mesh = renderer.primaryMesh;
  const r = mesh.geometry.boundingSphere?.radius ?? 1;
  const center = () => mesh.getWorldPosition(new THREE.Vector3());
  const sunW = () => renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  const sunObj = () => {
    mesh.updateWorldMatrix(true, false);
    const q = mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
    return sunW().applyQuaternion(q).normalize();
  };
  // Subsolar longitude (object space, lon = atan2(-z, x)); park it over the
  // open Pacific SE of Hawaii so the glint sits on unbroken ocean.
  physics.setTimeIndex(0);
  let chosen = 0, best = 1e9;
  for (let h = 0; h < 24; h += 0.1) {
    const s = h * 3600;
    physics.jumpToSimSeconds(s);
    renderer.update(physics, 0.016, 1);
    const so = sunObj();
    const lon = Math.atan2(-so.z, so.x) * 180 / Math.PI;
    let dl = Math.abs(lon - -150); if (dl > 180) dl = 360 - dl;
    if (dl < best) { best = dl; chosen = s; }
  }
  physics.jumpToSimSeconds(chosen);
  renderer.update(physics, 0.016, 1);
  const so = sunObj();
  const subLat = Math.asin(so.y) * 180 / Math.PI;
  const subLon = Math.atan2(-so.z, so.x) * 180 / Math.PI;

  // Aim the orbit camera straight down the subsolar normal.
  const N = mesh.localToWorld(so.clone().multiplyScalar(r)).sub(center()).normalize();
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.orbTheta = Math.atan2(N.z, N.x);
  cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, N.y)));
  cameraCtl.setAltitudeDirect(2113);
  for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);

  // Surface scale at screen center: project a point 0.01 rad from subsolar.
  const cam = renderer.camera;
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const toScreen = (local) => {
    mesh.updateWorldMatrix(true, false);
    const ndc = mesh.localToWorld(local.clone().multiplyScalar(r)).project(cam);
    return { x: (ndc.x * 0.5 + 0.5) * innerWidth, y: (-ndc.y * 0.5 + 0.5) * innerHeight };
  };
  const e1 = new THREE.Vector3(0, 1, 0).cross(so).normalize();
  const off = so.clone().multiplyScalar(Math.cos(0.01)).add(e1.clone().multiplyScalar(Math.sin(0.01))).normalize();
  const c0 = toScreen(so), c1 = toScreen(off);
  const pxPerRad = Math.hypot(c1.x - c0.x, c1.y - c0.y) / 0.01;
  return {
    simSeconds: chosen, subLat: +subLat.toFixed(1), subLon: +subLon.toFixed(1),
    cx: c0.x, cy: c0.y, kmPerPx: 6371 / pxPerRad,
  };
});

console.log(`subsolar ${info.subLat}N ${info.subLon}E, simSeconds ${info.simSeconds}, ` +
  `center (${Math.round(info.cx)},${Math.round(info.cy)}), ${info.kmPerPx.toFixed(2)} km/px`);
await new Promise((r) => setTimeout(r, 1500));
const shot = `${OUT}v5c-glint-2113km.png`;
await page.screenshot({ path: shot });

const blob = await page.evaluate(async (b64, info) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  // 500x500 box around the specular point.
  const x0 = Math.max(0, Math.round(info.cx) - 250), y0 = Math.max(0, Math.round(info.cy) - 250);
  const d = cx.getImageData(x0, y0, 500, 500).data;
  let hot = 0, warm = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (l > 200) hot++;
    if (l > 120) warm++;
  }
  return { hot, warm };
}, readFileSync(shot).toString('base64'), info);

const diaKm = (n) => 2 * Math.sqrt(n / Math.PI) * info.kmPerPx;
console.log(`glint core (lum>200): ${blob.hot} px ≈ ${diaKm(blob.hot).toFixed(0)} km dia | ` +
  `halo (lum>120): ${blob.warm} px ≈ ${diaKm(blob.warm).toFixed(0)} km dia`);
console.log('(old shader: core ~490 km; target: core < 250 km and halo/core dia ratio > 1.3 = feathered rim)');
const coreDia = diaKm(blob.hot), haloDia = diaKm(blob.warm);
await browser.close();
process.exit(coreDia < 250 && haloDia > coreDia * 1.3 ? 0 : 1);
