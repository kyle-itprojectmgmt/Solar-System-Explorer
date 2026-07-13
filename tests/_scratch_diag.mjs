// Where does the heart preset actually put the camera?
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/?system=pluto', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await page.evaluate(() => window.__sse.ui.setPresentation(true));

const measure = () => page.evaluate(() => {
  const { renderer, cameraCtl, THREE } = window.__sse;
  const mesh = renderer.primaryMesh;
  mesh.updateWorldMatrix(true, false);
  const c = mesh.getWorldPosition(new THREE.Vector3());
  const local = (worldDir) => {
    const p = mesh.worldToLocal(c.clone().add(worldDir)).normalize();
    return { lat: +(Math.asin(p.y) * 180 / Math.PI).toFixed(1),
             lon: +(Math.atan2(-p.z, p.x) * 180 / Math.PI).toFixed(1) };
  };
  const camDir = renderer.camera.position.clone().sub(c).normalize();
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  return {
    mode: cameraCtl.mode,
    subCam: local(camDir),
    subsolar: local(sunW),
    altKm: (renderer.camera.position.distanceTo(c) - renderer.bodyRadius('Pluto')) * 1000,
    camSunDot: camDir.dot(sunW).toFixed(3),
  };
});

const clickPreset = (name) => page.evaluate((n) => {
  const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes(n));
  b.click();
}, name);
const settle = (n) => page.evaluate((k) => {
  for (let i = 0; i < k; i++) window.__sse.cameraCtl.update(0.05);
}, n).then(() => new Promise((r) => setTimeout(r, 400)));

console.log('boot:', JSON.stringify(await measure()));
await clickPreset('The Heart');
for (const n of [40, 80, 160, 240]) {
  await settle(40);
  console.log(`after ~${n}:`, JSON.stringify(await measure()));
}
await browser.close();
