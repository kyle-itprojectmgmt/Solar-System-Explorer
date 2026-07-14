// v10.0.6 normal-map calibration probe: Himalaya under a LOW sun (relief
// shading is invisible at high noon), three configs — wired (+Y), flipped
// (-Y, DirectX convention), and no normal map — to pick the convention and
// judge strength. Screenshots to tests/shots/normalcal/.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = fileURLToPath(new globalThis.URL('./shots/normalcal/', import.meta.url));
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
await new Promise((r) => setTimeout(r, 4000)); // let normal.jpg stream in

// Find the sim hour with a LOW morning sun over the Himalaya (sunDot ~0.2)
// and park the camera above it.
const info = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const toLocal = (lat, lon) => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  };
  const mesh = renderer.primaryMesh;
  const r = mesh.geometry.boundingSphere?.radius ?? 1;
  const center = () => mesh.getWorldPosition(new THREE.Vector3());
  const worldNormal = (lat, lon) =>
    mesh.localToWorld(toLocal(lat, lon).multiplyScalar(r)).sub(center()).normalize();
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  physics.setTimeIndex(0);
  let chosen = 0, best = 1e9;
  for (let h = 0; h < 96; h++) { // 15-min steps over a day
    physics.jumpToSimSeconds(h * 900);
    renderer.update(physics, 0.016, 1);
    mesh.updateWorldMatrix(true, false);
    const dot = worldNormal(28, 87).dot(sunW);
    const score = Math.abs(dot - 0.25); // low-but-lit sun
    if (score < best) { best = score; chosen = h; }
  }
  physics.jumpToSimSeconds(chosen * 900);
  renderer.update(physics, 0.016, 1);
  mesh.updateWorldMatrix(true, false);
  const N = worldNormal(28, 87);
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.orbTheta = Math.atan2(N.z, N.x);
  cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, N.y)));
  cameraCtl.setAltitudeDirect(3000);
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  return { hour: chosen / 4, sunDot: +N.dot(sunW).toFixed(2),
    hasNormalMap: !!mesh.material.normalMap,
    normalScale: mesh.material.normalScale.x };
});
console.log('himalaya low-sun frame:', JSON.stringify(info));

for (const cfg of ['wired', 'flipY', 'off']) {
  await page.evaluate((cfg) => {
    const { renderer } = window.__sse;
    const mat = renderer.primaryMesh.material;
    if (!mat.__nmBackup) mat.__nmBackup = { map: mat.normalMap, s: mat.normalScale.clone() };
    mat.normalMap = mat.__nmBackup.map;
    mat.normalScale.copy(mat.__nmBackup.s);
    if (cfg === 'flipY') mat.normalScale.y = -mat.normalScale.y;
    if (cfg === 'off') mat.normalMap = null;
    mat.needsUpdate = true;
  }, cfg);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}himalaya-${cfg}.png` });
  console.log(`shot: himalaya-${cfg}.png`);
}
await page.evaluate(() => {
  const mat = window.__sse.renderer.primaryMesh.material;
  mat.normalMap = mat.__nmBackup.map;
  mat.normalScale.copy(mat.__nmBackup.s);
  mat.needsUpdate = true;
});
await browser.close();
console.log('DONE — eyeball the three shots: ridges must be LIT on the sun side.');
