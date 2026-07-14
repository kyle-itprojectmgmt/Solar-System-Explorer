// GA4 bootstrap (cookieless, anonymized). External file, not an inline
// snippet — script-src has no 'unsafe-inline' (Observatory A+), so this is
// served same-origin under 'self'. Loaded synchronously BEFORE the async
// gtag.js tag in index.html so dataLayer + consent defaults exist first.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
// Consent default MUST precede config — GA4 ignores the legacy
// storage/client_storage fields; denied analytics_storage is what actually
// keeps GA4 cookieless (it falls back to cookieless pings).
gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' });
gtag('js', new Date());
gtag('config', 'G-9WT0466782', {
  anonymize_ip: true,
  storage: 'none',
  client_storage: 'none',
  send_page_view: false, // per-system page_view fires from src/main.js boot()
});
