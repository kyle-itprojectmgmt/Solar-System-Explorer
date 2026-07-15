// Preset-insertion-speed probe (v10.0.13, bug: presets inherit time scale).
// Measures what ACTUALLY happens when a curated insertion preset fires while
// the sim is at 500× or paused — vs the ⬤ Enter Orbit button, which funnels
// through userSetTimeIndex(1).
//   MEASURE phase (pre-fix): expects to show mode==='insertion' (ruling out
//   the "lands in orbit mode" hypothesis) and timeIndex inherited (the bug).
//   GUARD phase (post-fix): PASS requires every curated insertion preset to
//   leave physics at 1× and the camera in insertion mode, and the insertion
//   phase advance to match sqrt(GM/r^3) within 5%.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

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
await new Promise((r) => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, ui } = window.__sse;
  const G = 6.674e-11;

  const fire = (label) => {
    const btn = [...document.querySelectorAll('.preset-row')]
      .find((b) => b.textContent.includes(label));
    if (!btn) return { error: `preset "${label}" not found` };
    btn.click();
    return null;
  };

  // Physical angular rate check: advance sim time frame-by-frame and
  // compare ins.phase advance per SIM second against sqrt(GM/r^3).
  const measureRate = () => {
    for (let i = 0; i < 120; i++) cameraCtl.update(0.05); // settle transition
    const p0 = cameraCtl.ins.phase;
    const s0 = physics.simSeconds;
    for (let i = 0; i < 60; i++) {
      physics.jumpToSimSeconds(physics.simSeconds + 10);
      renderer.update(physics, 0.016, 1);
      cameraCtl.update(0.016);
    }
    const entry = renderer.bodyMeshes.get(cameraCtl.ins.body);
    // 1 world unit = 1,000 km (camera.js: rUnits = radiusUnits + altKm/1000).
    const rKm = (entry.radiusUnits + cameraCtl.ins.altitudeKm / 1000) * 1000;
    const mass = entry.isPrimary ? renderer.system.primary.massKg : entry.cfg.massKg;
    const wPhys = Math.sqrt(G * mass / Math.pow(rKm * 1000, 3));
    const wMeas = Math.abs(cameraCtl.ins.phase - p0) / (physics.simSeconds - s0);
    return { wPhys, wMeas, ratio: wMeas / wPhys };
  };

  const out = {};

  // Case 1: preset fired while sim is at 500× (index 4).
  physics.setTimeIndex(4);
  let err = fire('Enceladus Geysers');
  if (err) return err;
  out.at500x = {
    mode: cameraCtl.mode,
    body: cameraCtl.ins.body,
    timeIndexAfter: physics.timeIndex,
    hudMode: document.querySelector('.hud-mode')?.textContent,
  };

  // Case 2: preset fired while paused (index 0).
  physics.setTimeIndex(0);
  err = fire('Titan Close Pass');
  if (err) return err;
  out.paused = {
    mode: cameraCtl.mode,
    body: cameraCtl.ins.body,
    timeIndexAfter: physics.timeIndex,
    pausedAfter: physics.paused,
  };

  // Case 3: physical rate at whatever state case 2 left (1× required
  // post-fix; measured in SIM seconds so it is fix-independent).
  out.rate = measureRate();

  return out;
});

await browser.close();

if (res.error) { console.error(res.error); process.exit(1); }

console.log('preset @500× :', JSON.stringify(res.at500x));
console.log('preset @pause:', JSON.stringify(res.paused));
console.log(`phase rate   : measured ${res.rate.wMeas.toExponential(3)} rad/sim-s, physical ${res.rate.wPhys.toExponential(3)} (ratio ${res.rate.ratio.toFixed(3)})`);

const pass =
  res.at500x.mode === 'insertion' && res.at500x.timeIndexAfter === 1 &&
  res.paused.mode === 'insertion' && res.paused.timeIndexAfter === 1 &&
  !res.paused.pausedAfter &&
  Math.abs(res.rate.ratio - 1) < 0.05;
console.log(pass ? 'PASS' : 'FAIL (expected pre-fix: timeIndexAfter inherited 4/0)');
process.exit(pass ? 0 : 1);
