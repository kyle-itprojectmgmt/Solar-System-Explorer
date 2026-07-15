// v10.0.13 guard: camera mode renames + key rebinding.
//   T = Tour (slug 'cinematic'), C = Cinematic Orbit (slug 'orbit'),
//   O = Orbit Simulation (slug 'insertion', opens the OI panel),
//   F/H/G unchanged. Slugs are frozen — only labels and keys moved.
// Also asserts the CAM panel rows and HELP table carry the new names/keys.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const press = async (code) => {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
  }, code);
  await new Promise((r) => setTimeout(r, 300));
};

const state = () => page.evaluate(() => ({
  mode: window.__sse.cameraCtl.mode,
  hud: document.querySelector('.hud-mode')?.textContent,
  oiPanelOpen: document.querySelector('.insertion-panel')?.style.display !== 'none',
}));

// Order matters: C and H are TARGETED modes — a bare keypress engages only
// once a target exists (house behavior, unchanged from the old O/H keys).
// O (Orbit Simulation) establishes one, so it goes first.
const out = {};
await press('KeyT'); out.T = await state();
await press('KeyO'); out.O = await state();
await press('KeyC'); out.C = await state();
await press('KeyF'); out.F = await state();
await press('KeyH'); out.H = await state();
await press('KeyG'); out.G = await state();

out.panels = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.mode-row')].map((r) => ({
    slug: r.dataset.camMode,
    label: r.querySelector('.mode-label')?.textContent,
    key: r.querySelector('.key')?.textContent,
  }));
  const help = [...document.querySelectorAll('.help-row')]
    .map((r) => r.textContent);
  return { rows, help };
});

await browser.close();

const expectRows = {
  cinematic: ['Tour', 'T'], free: ['Free Fly', 'F'], orbit: ['Cinematic Orbit', 'C'],
  chase: ['Chase', 'H'], insertion: ['Orbit Simulation', 'O'], system: ['System View', 'G'],
};
const rowsOk = out.panels.rows.every((r) => {
  const e = expectRows[r.slug];
  return e && r.label === e[0] && r.key === e[1];
});
const helpText = out.panels.help.join('|');
const helpOk = helpText.includes('TTour (auto)') && helpText.includes('CCinematic Orbit')
  && helpText.includes('OOrbit Simulation') && !helpText.includes('Insertion');

for (const [k, v] of Object.entries(out)) {
  if (k !== 'panels') console.log(`${k}:`, JSON.stringify(v));
}
console.log('CAM rows ok:', rowsOk, '| HELP ok:', helpOk);

const pass =
  out.T.mode === 'cinematic' && out.T.hud === 'TOUR' &&
  out.C.mode === 'orbit' && out.C.hud === 'CINEMATIC ORBIT' &&
  out.O.mode === 'insertion' && out.O.hud === 'ORBIT SIMULATION' && out.O.oiPanelOpen &&
  out.F.mode === 'free' && out.F.hud === 'FREE FLY' &&
  out.H.mode === 'chase' && out.H.hud === 'CHASE' &&
  out.G.mode === 'system' && out.G.hud === 'SYSTEM VIEW' &&
  rowsOk && helpOk;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
