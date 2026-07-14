// v10.0.3 visual shots: star backdrop vs lit planet, 30° FOV Milky Way.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=jupiter`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

// Lit Jupiter with starfield behind.
await page.evaluate(() => {
  const { cameraCtl, physics, renderer, ui } = window.__sse;
  physics.paused = true;
  ui.setPresentation?.(true);
  cameraCtl.setMode('orbit', 'Jupiter');
  const entry = renderer.bodyMeshes.get('Jupiter');
  cameraCtl.orbDist = entry.radiusUnits * 8;
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  cameraCtl.orbTheta = Math.atan2(sunW.z, sunW.x); // sun behind camera: lit face
  cameraCtl.orbPhi = Math.PI / 2;
  cameraCtl.distTween = null;
  for (let i = 0; i < 90; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'tests/shots/v1003-jupiter-stars.png' });

// 30° FOV starfield (Milky Way sharpness check).
await page.evaluate(() => {
  const { cameraCtl, ui } = window.__sse;
  ui.setFov(30, true);
  cameraCtl.orbTheta += Math.PI; // look away from the planet
  for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'tests/shots/v1003-milkyway-30fov.png' });
await browser.close();
console.log('shots saved');
