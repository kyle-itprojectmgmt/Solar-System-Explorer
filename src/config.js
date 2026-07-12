// ---------------------------------------------------------------------------
// Global environment configuration.
// ---------------------------------------------------------------------------

// Texture origin. Development serves from /public/textures; production can be
// pointed at a Cloudflare R2 bucket with a one-line change.
export const TEXTURE_BASE_URL = import.meta.env.DEV
  ? '/textures'
  : '/textures'; // e.g. 'https://pub-XXXX.r2.dev/textures' once R2 is set up

// Systems with a complete config in /src/data/systems/<name>.js.
// Append new systems here as their configs land.
export const AVAILABLE_SYSTEMS = ['jupiter', 'earth', 'mars', 'saturn'];

// Active system: ?system= URL parameter, validated against the list.
const requested = new URLSearchParams(window.location.search).get('system');
export const SYSTEM_CONFIG = AVAILABLE_SYSTEMS.includes(requested) ? requested : 'jupiter';

// Switch systems via a page navigation (V5 1d): the reload shows the
// loading screen, disposes the GPU state cleanly, and pulls only the
// target system's lazy chunk. A cinematic hyperjump is a future upgrade.
export function switchSystem(name) {
  if (!AVAILABLE_SYSTEMS.includes(name) || name === SYSTEM_CONFIG) return false;
  const u = new URL(window.location.href);
  u.searchParams.set('system', name);
  u.searchParams.delete('view'); // shared views are system-specific
  window.location.assign(u);
  return true;
}

// Scene scale: 1 world unit = 1,000 km.
export const KM_PER_UNIT = 1000;

// Physical constants (km-based units).
export const G = 6.674e-20; // km^3 / (kg * s^2)
export const C_KM_S = 299792.458; // speed of light, km/s
export const AU_KM = 149597870.7;

// Solar system roadmap for the Bodies panel. The active system's moons come
// from its own config at runtime; entries here are the future-build listing
// ("Coming Soon") shown in the UI.
export const SOLAR_SYSTEM = [
  { name: 'Sun', star: true },
  { name: 'Mercury' },
  { name: 'Venus' },
  { name: 'Earth', moons: ['Moon'] },
  { name: 'Mars', moons: ['Phobos', 'Deimos'] },
  { name: 'Jupiter', moons: [] }, // active system — moons injected from config
  { name: 'Saturn', moons: ['Titan', 'Enceladus', 'Rhea', 'Iapetus'] },
  { name: 'Uranus', moons: ['Titania', 'Miranda'] },
  { name: 'Neptune', moons: ['Triton'] },
  { name: 'Pluto', moons: ['Charon'] },
];

// Ko-fi handle for the donate button.
export const KOFI_URL = 'https://ko-fi.com/YOUR_HANDLE';
if (import.meta.env.DEV && KOFI_URL.includes('YOUR_HANDLE')) {
  console.warn('Ko-fi handle not set — update KOFI_URL in config.js');
}
