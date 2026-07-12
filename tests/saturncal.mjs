// Saturn sun-calibration guard (V7 1f), marscal.mjs's sibling — but pure
// node: ephemeris.js is dependency-free and saturn.js imports nothing, so
// the sun geometry is testable without the app (Saturn isn't loadable in
// the browser until Worker 4 fills the moon roster).
//
// Anchor policy (see saturn.js star.direction): the circular-orbit model
// carries e = 0.056 of error across Saturn's 29.5-year orbit — λ0 is
// anchored to the 2025-03-23 ring-plane crossing so LIVE-mode lighting in
// the 2020s–2030s is right, accepting ~2° declination error back at the
// 2004 Cassini SOI epoch.
//
//   1. Epoch (2004-07-01): model δ = −25.5° (real −23.6° — documented
//      circular-model cost of the 2025 anchor).
//   2. 2025-03-23 ring-plane crossing: |δ| ≈ 0 and FALLING (sun moving to
//      the south ring face).
//   3. Today-era check (2026-07-12): δ ≈ −7.1° — rings nearly edge-on,
//      south face barely lit (the real sky's ≈ −7.5°).
//   4. 2009-08-11 real equinox: |δ| < 6° (model crosses ~10 months later —
//      accepted, documented).
//   5. Internal consistency: declination returns to the epoch value after
//      exactly one Saturn year.
import { sunDirectionAt } from '../src/engine/ephemeris.js';
import saturn from '../src/data/systems/saturn.js';

const EPOCH_MS = Date.parse(saturn.epoch);
const YEAR_D = saturn.primary.orbitalPeriodDays;

const decAt = (dateIso) => {
  const simS = (Date.parse(dateIso) - EPOCH_MS) / 1000;
  const d = sunDirectionAt(saturn, simS);
  return Math.asin(d.y) * 180 / Math.PI;
};

let pass = true;
const check = (name, ok, detail) => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name} — ${detail}`);
  pass = pass && ok;
};

const eDec = decAt(saturn.epoch);
check('epoch declination ≈ −25.5° (model; real −23.6, documented anchor cost)',
  Math.abs(eDec - -25.5) < 1.0 && Math.abs(eDec - -23.6) < 3.5, `sim ${eDec.toFixed(1)}°`);

const xDec = decAt('2025-03-23T00:00:00Z');
const xDecLater = decAt('2025-06-23T00:00:00Z');
check('2025-03-23 ring-plane crossing: δ ≈ 0', Math.abs(xDec) < 0.5, `sim ${xDec.toFixed(2)}°`);
check('crossing direction: sun moving to the SOUTH ring face', xDecLater < xDec,
  `+3 months δ ${xDecLater.toFixed(2)}°`);

const nowDec = decAt('2026-07-12T00:00:00Z');
check('2026-07-12 (LIVE era): δ ≈ −7.1° — rings nearly edge-on',
  Math.abs(nowDec - -7.1) < 2.0, `sim ${nowDec.toFixed(1)}° (real sky ≈ −7.5°)`);

const eqDec = decAt('2009-08-11T00:00:00Z');
check('2009-08-11 real equinox within circular-model error', Math.abs(eqDec) < 6,
  `sim ${eqDec.toFixed(1)}° (model equinox lands ~10 months late — accepted)`);

const yearDec = decAt(new Date(EPOCH_MS + YEAR_D * 86400000).toISOString());
check('declination returns after one Saturn year', Math.abs(yearDec - eDec) < 0.1,
  `epoch ${eDec.toFixed(2)}° vs +29.46y ${yearDec.toFixed(2)}°`);

// Rotation config guards: System III sidereal day and the oblateness that
// drives the ellipsoid render scale — catches value regressions cheaply.
check('System III sidereal day 10.6562 h in config',
  Math.abs(saturn.primary.rotationPeriodHours - 10.6562) < 0.0001,
  `${saturn.primary.rotationPeriodHours} h`);
check('oblateness: polar/equatorial ≈ 0.902 (most oblate planet)',
  Math.abs(saturn.primary.polarRadiusKm / saturn.primary.radiusKm - 0.902) < 0.002,
  `${(saturn.primary.polarRadiusKm / saturn.primary.radiusKm).toFixed(4)}`);

console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
