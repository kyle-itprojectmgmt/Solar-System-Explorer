// V7 Saturn visual sweep — screenshots for the eyeball pass.
//   SMOKE_URL=http://localhost:5173 node tests/saturnshots.mjs
// Output: tests/shots/saturn-*.png (git-ignored).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
mkdirSync('tests/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=saturn`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

// Presentation mode: clean frames. Pause physics: stable shots.
await page.evaluate(() => {
  const { ui, physics } = window.__sse;
  ui.setPresentation(true);
  physics.setTimeIndex(0);
});

async function shot(name, fn) {
  await page.evaluate(fn);
  // Free mode re-poses orientation from its own yaw/pitch every frame —
  // sync them from the lookAt-set quaternion or the framing drifts back
  // (measured: three shots framed empty sky before this).
  await page.evaluate(() => {
    const { renderer, cameraCtl, THREE } = window.__sse;
    cameraCtl.setMode('free');
    const e = new THREE.Euler().setFromQuaternion(renderer.camera.quaternion, 'YXZ');
    cameraCtl.yaw = e.y;
    cameraCtl.pitch = e.x;
  });
  // Let detail shaders + progressive textures settle a few frames.
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `tests/shots/${name}.png` });
  console.log(`  saved ${name}`);
}

// Root-frame camera placement helper is inlined per shot (page context).
await shot('saturn-global', () => {
  const { renderer, physics, cameraCtl, THREE } = window.__sse;
  cameraCtl.setMode('free');
  renderer.camera.fov = 48; renderer.camera.updateProjectionMatrix();
  // 30° above the ring plane, sunward-ish side, whole system in frame.
  renderer.camera.position.copy(renderer.root.localToWorld(new THREE.Vector3(420, 260, 260)));
  renderer.camera.lookAt(0, 0, 0);
  renderer.update(physics, 0.016, 1);
});

await shot('saturn-rings-closeup', () => {
  const { renderer, physics, THREE } = window.__sse;
  // Above the A/B rings looking across the Cassini Division.
  renderer.camera.position.copy(renderer.root.localToWorld(new THREE.Vector3(150, 55, 40)));
  renderer.camera.lookAt(renderer.root.localToWorld(new THREE.Vector3(95, 0, -10)));
  renderer.update(physics, 0.016, 1);
});

await shot('saturn-ringshadow', () => {
  const { renderer, physics, THREE } = window.__sse;
  // Northern summer (Cassini era): sun well above the ring plane throws a
  // wide shadow band across the southern cloud tops. In 2026 the sun is
  // only ~7° off the plane and the band thins to a sliver.
  physics.jumpToSimSeconds(4718 * 86400); // ≈ 2017-06-01
  renderer.update(physics, 0.016, 1); // sync renderer.sunDir BEFORE reading it
  const sun = renderer.sunDir.clone();
  // From BELOW the ring plane: the 2017 shadow band lands on the
  // southern hemisphere (sun is 26° north).
  const pos = sun.multiplyScalar(105).add(new THREE.Vector3(0, -35, 0));
  renderer.camera.position.copy(renderer.root.localToWorld(pos));
  renderer.camera.lookAt(0, 0, 0);
  renderer.update(physics, 0.016, 1);
});

await shot('saturn-titan', () => {
  const { renderer, physics, cameraCtl, THREE } = window.__sse;
  const t = renderer.bodyWorldPos('Titan', new THREE.Vector3());
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion);
  renderer.camera.position.copy(t).addScaledVector(sunW, 9).add(new THREE.Vector3(0, 2, 0));
  renderer.camera.lookAt(t);
  renderer.update(physics, 0.016, 1);
});

await shot('saturn-iapetus', () => {
  const { renderer, physics, THREE } = window.__sse;
  const t = renderer.bodyWorldPos('Iapetus', new THREE.Vector3());
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion);
  renderer.camera.position.copy(t).addScaledVector(sunW, 2.4).add(new THREE.Vector3(0, 0.5, 0));
  renderer.camera.lookAt(t);
  renderer.update(physics, 0.016, 1);
});

await shot('saturn-enceladus-south', () => {
  const { renderer, physics, THREE } = window.__sse;
  const t = renderer.bodyWorldPos('Enceladus', new THREE.Vector3());
  // From below the south pole: tiger stripes + geyser plumes.
  renderer.camera.position.copy(t).add(
    renderer.root.localToWorld(new THREE.Vector3(0.3, -1.1, 0.2))
      .sub(renderer.root.localToWorld(new THREE.Vector3(0, 0, 0))));
  renderer.camera.lookAt(t);
  renderer.update(physics, 0.016, 1);
});

await shot('saturn-hexagon', () => {
  const { renderer, physics, THREE } = window.__sse;
  // From above the north pole — at a NORTHERN-SUMMER date (2026's pole is
  // in polar night, physically correct but photographs black).
  physics.jumpToSimSeconds(4718 * 86400); // ≈ 2017-06-01
  renderer.camera.position.copy(renderer.root.localToWorld(new THREE.Vector3(8, 95, 0)));
  renderer.camera.lookAt(0, 0, 0);
  renderer.update(physics, 0.016, 1);
});

await browser.close();
console.log('done');
