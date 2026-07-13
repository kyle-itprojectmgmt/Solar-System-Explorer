// Re-shoot crescent + settled boot + heart close terrain.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/KYLEEW~1/AppData/Local/Temp/claude/C--dev-Solar-System-Explorer/72fe2cd1-929d-4e4f-9a95-0e3ab85da01f/scratchpad/shots';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/?system=pluto', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

const settle = (n = 80) => page.evaluate((k) => {
  for (let i = 0; i < k; i++) window.__sse.cameraCtl.update(0.05);
}, n).then(() => new Promise((r) => setTimeout(r, 900)));

// Settled BOOT shot first (before touching anything).
await settle(60);
const boot = await page.evaluate(() => {
  const { renderer, THREE } = window.__sse;
  const c = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
  const camDir = renderer.camera.position.clone().sub(c).normalize();
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  return camDir.dot(sunW).toFixed(3);
});
console.log('settled boot camSunDot:', boot);
await page.screenshot({ path: `${OUT}/boot.png` });

await page.evaluate(() => window.__sse.ui.setPresentation(true));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes('Blue Haze Crescent'));
  b.click();
});
await settle(120);
await page.screenshot({ path: `${OUT}/crescent.png` });
console.log('crescent shot');

// Heart terrain close-up: flyToFeature with a low-altitude preset copy.
await page.evaluate(() => {
  const { ui, cameraCtl } = window.__sse;
  const p = { ...ui.system.primary.navPresets[0], altitudeKm: 400 };
  cameraCtl.flyToFeature('Pluto', p);
});
await settle(160);
await page.screenshot({ path: `${OUT}/close.png` });
console.log('close shot; errors:', errors.length, errors.slice(0, 3));
await browser.close();
