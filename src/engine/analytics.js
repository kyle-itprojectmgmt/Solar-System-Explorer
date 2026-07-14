// ---------------------------------------------------------------------------
// GA4 event helpers. gtag is defined globally by the inline snippet in
// index.html (cookieless via consent-mode denial — see the comment there).
// Every helper no-ops in dev and under automation (navigator.webdriver) so
// local sessions and the headless regression suites never pollute the
// production property. When ad blockers stop gtag.js the global stub still
// exists and pushes harmlessly to dataLayer.
// ---------------------------------------------------------------------------

function ga(...args) {
  if (import.meta.env.DEV || navigator.webdriver) return;
  if (typeof window.gtag === 'function') window.gtag(...args);
}

/** One page_view per system visit, fired from boot(). switchSystem() is a
 *  full page navigation, so every system switch lands back here on the next
 *  load — the auto page_view is disabled in index.html (send_page_view:
 *  false) so each visit counts exactly once, titled by system. */
export function trackSystemView(systemSlug) {
  ga('event', 'page_view', {
    page_title: systemSlug.charAt(0).toUpperCase() + systemSlug.slice(1),
    page_location: window.location.origin + '/?system=' + systemSlug,
    page_path: '/?system=' + systemSlug,
  });
}

/** Curated preset launches. preset_id is the button label minus its emoji;
 *  user-saved presets are NOT tracked (their names are user data). */
export function trackPresetLaunch(presetId, systemSlug) {
  ga('event', 'preset_launch', { preset_id: presetId, system: systemSlug });
}
