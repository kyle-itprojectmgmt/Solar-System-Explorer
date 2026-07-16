// V7 security suite — run against a PRODUCTION build served by wrangler
// (the dev server does not apply public/_headers):
//   npm run build
//   npx wrangler dev --port 8788
//   SEC_URL=http://127.0.0.1:8788 node tests/security.mjs
// Checks: security response headers, security.txt, zero console errors /
// CSP violations on all systems, and embed-input URL sanitization
// (javascript: / data: rejected, legit Spotify/YouTube URLs still work).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_BASE = process.env.SEC_URL || 'http://127.0.0.1:8788';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); }
}

// -- Group 1: response headers (plain fetch — no browser needed) --------------
const res = await fetch(URL_BASE + '/');
const h = (n) => res.headers.get(n) || '';
check('CSP header present', h('content-security-policy').includes("default-src 'self'"), h('content-security-policy'));
check("CSP script-src 'self'", h('content-security-policy').includes("script-src 'self'"));
check('CSP frame-src spotify + youtube-nocookie',
  h('content-security-policy').includes('https://open.spotify.com')
  && h('content-security-policy').includes('https://www.youtube-nocookie.com'));
check('X-Frame-Options SAMEORIGIN', h('x-frame-options') === 'SAMEORIGIN', h('x-frame-options'));
check('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff');
check('Referrer-Policy strict-origin-when-cross-origin', h('referrer-policy') === 'strict-origin-when-cross-origin');
check('Permissions-Policy present', h('permissions-policy').includes('camera=()'));
check('COOP same-origin', h('cross-origin-opener-policy') === 'same-origin');

const sec = await fetch(URL_BASE + '/.well-known/security.txt');
const secBody = await sec.text();
check('security.txt returns 200', sec.status === 200);
check('security.txt has Contact + Expires',
  secBody.includes('Contact: mailto:') && secBody.includes('Expires:'));

// -- Group 2: each system loads with zero console errors under CSP ------------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

for (const system of ['jupiter', 'earth', 'mars', 'saturn']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => {
    window.__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`);
    });
  });
  try {
    await page.goto(`${URL_BASE}/?system=${system}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")',
      { timeout: 90000 },
    );
    // Let a few frames render so lazy CSP failures (textures, fonts) surface.
    await new Promise((r) => setTimeout(r, 3000));
    const csp = await page.evaluate(() => window.__cspViolations);
    check(`${system}: loads under CSP`, true);
    check(`${system}: zero console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    check(`${system}: zero CSP violations`, csp.length === 0, csp.slice(0, 3).join(' | '));
  } catch (e) {
    check(`${system}: loads under CSP`, false, String(e));
  }
  await page.close();
}

// -- Group 3: embed URL sanitization (DOM-level, fresh page) -------------------
// Must be an explicit ?system= URL: since v10.0.14 bare "/" serves the solar
// map landing page, which has no simulator DOM to drive.
const page = await browser.newPage();
await page.goto(`${URL_BASE}/?system=jupiter`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")',
  { timeout: 90000 },
);
await page.waitForSelector('.af-stream-body', { timeout: 15000 });

// .af-stream-body order matches construction order in ui.js: [spotify, youtube].
async function tryEmbed(rowIndex, url) {
  return page.evaluate((i, u) => {
    const body = document.querySelectorAll('.af-stream-body')[i];
    const input = body.querySelector('.embed-input');
    const load = body.querySelector('button');
    const frame = body.querySelector('.embed-frame');
    frame.innerHTML = '';
    input.value = u;
    load.click();
    const f = frame.querySelector('iframe');
    return f ? f.src : null;
  }, rowIndex, url);
}

check('Spotify input rejects javascript: URL',
  (await tryEmbed(0, 'javascript:alert(document.domain)//open.spotify.com/playlist/abc123')) === null);
check('Spotify input rejects foreign host',
  (await tryEmbed(0, 'https://evil.example/open.spotify.com/playlist/abc123')) === null);
const spotifyOk = await tryEmbed(0, 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
check('Spotify legit URL embeds from open.spotify.com/embed',
  (spotifyOk || '').startsWith('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'), spotifyOk);
check('YouTube input rejects data: URL',
  (await tryEmbed(1, 'data:text/html,<script>alert(1)</script>')) === null);
const ytOk = await tryEmbed(1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
check('YouTube legit URL embeds from youtube-nocookie.com',
  (ytOk || '').startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), ytOk);
const ytShort = await tryEmbed(1, 'https://youtu.be/dQw4w9WgXcQ');
check('youtu.be short link still accepted',
  (ytShort || '').startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), ytShort);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
