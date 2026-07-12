// V8 Phase 1 gate: each new-system SKELETON must boot with zero console
// errors before workers are spawned (and stays useful as a fast loader
// check afterwards). Run against `npm run dev` on :5175.
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

for (const sys of ['mercury', 'venus', 'uranus', 'neptune']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?system=${sys}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")',
      { timeout: 60000 });
    const info = await page.evaluate(() => ({
      slug: window.__sse.renderer.system.slug,
      primary: !!window.__sse.renderer.primaryMesh,
      rings: (window.__sse.renderer.ringMeshes || []).length,
      sunY: window.__sse.physics.sunDir.y,
    }));
    check(`${sys} boots (primary mesh present)`, info.slug === sys && info.primary);
    if (sys === 'uranus') {
      check('uranus ring disc built', info.rings === 1, `rings=${info.rings}`);
      check('uranus LIVE sun is near-polar (|y| > 0.9)', Math.abs(info.sunY) > 0.9,
        `sunY=${info.sunY.toFixed(3)}`);
    }
    check(`${sys} zero console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check(`${sys} boots`, false, String(e).slice(0, 120));
  }
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
