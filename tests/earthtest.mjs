// V5 3f: Earth + Moon system end-to-end.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = new globalThis.URL('./shots/', import.meta.url).pathname.slice(1);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
const ver = await page.$eval('#loading-version', (e) => e.textContent);
check('loading screen shows Earth System v5.1.0', /Earth System — v5.1.0/.test(ver), ver);
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const r = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const out = {};
  out.primary = renderer.system.primary.name;
  out.moonExists = !!renderer.bodyMeshes.get('Moon');
  out.moonOrbitKm = Math.round(Math.hypot(
    physics.getBody('Moon').pos.x, physics.getBody('Moon').pos.z) / 100) * 100;

  // Terra + luna detail styles registered and wired.
  out.terraEntry = renderer.detailEntries.some((e) => e.name === 'Earth');
  out.lunaEntry = renderer.detailEntries.some((e) => e.name === 'Moon');
  out.rayleigh = !!renderer.atmosphereMesh?.material.uniforms.uAltitude;

  // Force the shaders to compile at close range (blend > 0) — one render.
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.setAltitudeDirect(2000);
  for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  out.earthBlend = +renderer.getDetailBlend('Earth').toFixed(2);

  cameraCtl.setMode('orbit', 'Moon');
  cameraCtl.setAltitudeDirect(500);
  for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 2);
  renderer.renderer.render(renderer.scene, renderer.camera);
  out.moonBlend = +renderer.getDetailBlend('Moon').toFixed(2);

  // Apollo markers parented to the moon mesh.
  const moonEntry = renderer.bodyMeshes.get('Moon');
  out.apolloCount = moonEntry.apolloSprites?.length ?? 0;
  out.apolloOnMesh = moonEntry.apolloSprites?.every((s) => s.parent === moonEntry.mesh);

  // Insertion on Earth (ISS-ish) and on the Moon.
  cameraCtl.setMode('insertion', 'Earth');
  cameraCtl.setInsertion({ body: 'Earth', altitudeKm: 408, incDeg: 51.6, locked: false });
  out.issAlt = Math.round(cameraCtl.ins.altitudeKm);
  cameraCtl.setMode('orbit', 'Moon');
  cameraCtl.setMode('insertion', 'Moon');
  out.moonIns = cameraCtl.ins.body === 'Moon';

  // Ephemeris seasons: sun y-component flips sign across half a year.
  const { dateToSimSeconds } = window.__sse; // not exported — compute directly
  const y0 = physics.sunDir.y;
  physics.jumpToSimSeconds(physics.simSeconds + 182.6 * 86400);
  const y1 = physics.sunDir.y;
  out.seasons = (y0 * y1 < 0) || Math.abs(y0 - y1) > 0.3;
  out.sunY = [+y0.toFixed(2), +y1.toFixed(2)];

  // Date picker moves the Moon.
  const before = Math.atan2(-physics.getBody('Moon').pos.z, physics.getBody('Moon').pos.x);
  physics.jumpToSimSeconds(physics.simSeconds + 7 * 86400);
  const after = Math.atan2(-physics.getBody('Moon').pos.z, physics.getBody('Moon').pos.x);
  out.moonMoves = Math.abs(after - before) > 0.5;

  // NAV panel: Earth is current (HERE), Jupiter is a travel row.
  document.querySelector('.stack-btn[data-panel="bodies"]').click();
  const rows = [...document.querySelectorAll('.body-row')];
  out.hereOnEarth = rows.find((x) => x.textContent.includes('Earth'))?.classList.contains('current');
  out.jupiterTravel = rows.find((x) => x.textContent.includes('Jupiter'))?.textContent.includes('→');
  out.moonRow = [...document.querySelectorAll('.moon-row:not(.ghost-moon)')].length === 1;
  return out;
});

check('Earth is primary, Moon present', r.primary === 'Earth' && r.moonExists);
check(`Moon orbit radius ~384,400 km (${r.moonOrbitKm})`, Math.abs(r.moonOrbitKm - 384400) < 8000);
check('terra + luna detail entries registered', r.terraEntry && r.lunaEntry);
check('Rayleigh atmosphere shell active', r.rayleigh);
check('terra shader compiled + blending at 2,000 km', r.earthBlend > 0.5, r.earthBlend);
check('luna shader compiled + blending at 500 km', r.moonBlend > 0.5, r.moonBlend);
check('6 Apollo sites parented to moon mesh', r.apolloCount === 6 && r.apolloOnMesh, r.apolloCount);
check('ISS-altitude insertion at 408 km / 51.6°', r.issAlt === 408, r.issAlt);
check('Moon insertion works', r.moonIns);
check('ephemeris seasons (sun-Y shifts over half a year)', r.seasons, JSON.stringify(r.sunY));
check('date jump moves the Moon', r.moonMoves);
check('NAV: Earth [HERE], Jupiter travel row, 1 moon', r.hereOnEarth && r.jupiterTravel && r.moonRow);

await page.screenshot({ path: `${OUT}earth-system.png` });

// Visual: Earth from 20,000 km, day side.
await page.evaluate(() => {
  const { cameraCtl, renderer, physics } = window.__sse;
  physics.setTimeIndex(0);
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  const d = renderer.sunDir;
  cameraCtl.orbTheta = Math.atan2(d.z, d.x);
  cameraCtl.orbPhi = Math.PI / 2 - 0.2;
  cameraCtl.setAltitudeDirect(20000);
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
});
await new Promise((r2) => setTimeout(r2, 1500));
await page.screenshot({ path: `${OUT}earth-day.png` });

// Night side for city lights.
await page.evaluate(() => {
  const { cameraCtl, renderer } = window.__sse;
  const d = renderer.sunDir;
  cameraCtl.orbTheta = Math.atan2(d.z, d.x) + Math.PI;
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
});
await new Promise((r2) => setTimeout(r2, 1500));
await page.screenshot({ path: `${OUT}earth-night.png` });

// Moon at 500 km.
await page.evaluate(() => {
  const { cameraCtl, renderer } = window.__sse;
  cameraCtl.setMode('orbit', 'Moon');
  cameraCtl.orbSpeedMult = 0;
  const d = renderer.sunDir;
  cameraCtl.orbTheta = Math.atan2(d.z, d.x);
  cameraCtl.orbPhi = Math.PI / 2 - 0.15;
  cameraCtl.setAltitudeDirect(500);
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
});
await new Promise((r2) => setTimeout(r2, 1500));
await page.screenshot({ path: `${OUT}moon-500.png` });

const realErrors = errors.filter((e) => !/favicon/i.test(e));
check('zero console errors (shaders compiled clean)', realErrors.length === 0,
  realErrors.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
