// ---------------------------------------------------------------------------
// Keplerian ephemeris (V5 1a) — where is the Sun, for any simulation date?
//
// The engine works in the active primary's EQUATORIAL frame (the renderer's
// root group carries the axial tilt as rotation.z, and star.direction in the
// system config is the sun direction in that frame at the epoch). Until v5
// that direction was frozen; this utility rotates it with the primary's
// orbital motion so lighting is physically correct across dates: the date
// picker and LIVE mode move the terminator, and Earth gets real seasons
// (the equatorial-frame sun direction oscillates ±axialTilt over the year).
//
// Model: circular orbit in the world (ecliptic) XZ plane. Good to a couple
// of degrees for lighting purposes; eccentricity refinement is a V6+ item.
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;

/** Rotate (x, y) by `a` radians about the Z axis, in place on `v`. */
function rotZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const x = v.x * c - v.y * s;
  const y = v.x * s + v.y * c;
  v.x = x; v.y = y;
  return v;
}

/**
 * Sun direction in the primary's equatorial frame at `simSeconds` past the
 * system epoch. Returns a plain {x, y, z} unit vector (no three.js import —
 * physics.js is dependency-light).
 *
 * Systems whose primary has no orbitalPeriodDays keep their configured
 * static direction.
 */
export function sunDirectionAt(system, simSeconds) {
  const p = system.primary;
  const d0 = system.star.direction;
  const len = Math.hypot(d0[0], d0[1], d0[2]);
  const dir = { x: d0[0] / len, y: d0[1] / len, z: d0[2] / len };
  const periodDays = p.orbitalPeriodDays;
  if (!periodDays) return dir;

  const tilt = ((p.axialTiltDeg || 0) * Math.PI) / 180;

  // Equatorial -> world (ecliptic): the same tilt the renderer applies.
  rotZ(dir, tilt);
  // Epoch sun longitude in the ecliptic plane (flatten any residual y).
  const lambda0 = Math.atan2(-dir.z, dir.x);
  // Longitude advances one revolution per orbital period.
  const lambda = lambda0 + TWO_PI * (simSeconds / (periodDays * 86400));

  const w = { x: Math.cos(lambda), y: 0, z: -Math.sin(lambda) };
  // World -> equatorial.
  rotZ(w, -tilt);
  return w;
}
