// ---------------------------------------------------------------------------
// Global environment configuration.
// ---------------------------------------------------------------------------

// Texture origin. Development serves from /public/textures; production can be
// pointed at a Cloudflare R2 bucket with a one-line change.
export const TEXTURE_BASE_URL = import.meta.env.DEV
  ? '/textures'
  : '/textures'; // e.g. 'https://pub-XXXX.r2.dev/textures' once R2 is set up

// Active system. Must match a module in /src/data/systems/<name>.js.
// Switching to Saturn (once its config exists) is a one-line change here.
export const SYSTEM_CONFIG = 'jupiter';

// Scene scale: 1 world unit = 1,000 km.
export const KM_PER_UNIT = 1000;

// Physical constants (km-based units).
export const G = 6.674e-20; // km^3 / (kg * s^2)
export const C_KM_S = 299792.458; // speed of light, km/s
export const AU_KM = 149597870.7;

// Ko-fi handle for the donate button.
export const KOFI_URL = 'https://ko-fi.com/YOUR_HANDLE';
