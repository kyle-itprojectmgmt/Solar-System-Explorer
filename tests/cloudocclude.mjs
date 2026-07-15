// v10.0.7 cloud-occlusion probe: the Black Marble night texture is static,
// so any night-to-night variation in a city's luminance is the cloud deck
// (gCloudCover) occluding it. Samples London at its darkest hour across 14
// consecutive days. PASS: spread exists (some nights clouded) AND the max
// stays near full brightness (clear nights unoccluded) AND min shows real
// occlusion (< 60% of max).
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
await new Promise((r) => setTimeout(r, 4000)); // night.jpg streams in

// Find London's darkest hour on day 0 (same argmin discipline as
// nightlights.mjs — fixed thresholds are a July-twilight trap).
const darkHour = await page.evaluate(() => {
  const { physics, renderer, THREE } = window.__sse;
  const toLocal = (lat, lon) => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  };
  const mesh = renderer.primaryMesh;
  const r = mesh.geometry.boundingSphere?.radius ?? 1;
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  physics.setTimeIndex(0);
  let chosen = 0, best = 1;
  for (let h = 0; h < 24; h++) {
    physics.jumpToSimSeconds(h * 3600);
    renderer.update(physics, 0.016, 1);
    mesh.updateWorldMatrix(true, false);
    const n = mesh.localToWorld(toLocal(51.5, -0.1).multiplyScalar(r))
      .sub(mesh.getWorldPosition(new THREE.Vector3())).normalize();
    const dot = n.dot(sunW);
    if (dot < best) { best = dot; chosen = h; }
  }
  return chosen;
});
console.log('london darkest hour:', darkHour);

const lums = [];
for (let day = 0; day < 14; day++) {
  const pt = await page.evaluate((day, darkHour) => {
    const { cameraCtl, physics, renderer, THREE } = window.__sse;
    const toLocal = (lat, lon) => {
      const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
      return new THREE.Vector3(
        Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
    };
    // Sidereal-ish repeat: same UTC hour each day keeps London near its
    // darkest; the ephemeris drift over 14 days is negligible for this.
    physics.jumpToSimSeconds((day * 24 + darkHour) * 3600);
    renderer.update(physics, 0.016, 1);
    const mesh = renderer.primaryMesh;
    mesh.updateWorldMatrix(true, false);
    const r = mesh.geometry.boundingSphere?.radius ?? 1;
    const center = mesh.getWorldPosition(new THREE.Vector3());
    const N = mesh.localToWorld(toLocal(51.5, -0.1).multiplyScalar(r)).sub(center).normalize();
    cameraCtl.setMode('orbit', 'Earth');
    cameraCtl.orbSpeedMult = 0;
    cameraCtl.orbTheta = Math.atan2(N.z, N.x);
    cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, N.y)));
    cameraCtl.setAltitudeDirect(22000);
    for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
    renderer.renderer.render(renderer.scene, renderer.camera);
    const cam = renderer.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const world = center.clone().add(N.clone().multiplyScalar(
      r * mesh.getWorldScale(new THREE.Vector3()).x));
    const ndc = world.project(cam);
    return {
      x: Math.round((ndc.x * 0.5 + 0.5) * innerWidth),
      y: Math.round((-ndc.y * 0.5 + 0.5) * innerHeight),
    };
  }, day, darkHour);
  await new Promise((r) => setTimeout(r, 900));
  const b64 = await page.screenshot({ encoding: 'base64' });
  const lum = await page.evaluate(async (b64, pt) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    // 9x9 patch mean over Greater London — big enough to average the
    // city's speckle, small enough to stay inside it.
    const d = cx.getImageData(pt.x - 4, pt.y - 4, 9, 9).data;
    let l = 0;
    for (let i = 0; i < d.length; i += 4) l += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return l / (d.length / 4);
  }, b64, pt);
  lums.push(+lum.toFixed(1));
}
console.log('london night luminance across 14 nights:', JSON.stringify(lums));
const max = Math.max(...lums), min = Math.min(...lums);
console.log(`max ${max} (clear-sky) / min ${min} (occluded) — want max > 45, min < 0.6*max`);
await browser.close();
process.exit(max > 45 && min < 0.6 * max ? 0 : 1);
