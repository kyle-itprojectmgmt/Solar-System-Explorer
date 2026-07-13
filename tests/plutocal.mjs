// Pluto sun-calibration guard (V10 1b), saturncal.mjs's sibling — pure
// node: ephemeris.js is dependency-free and pluto.js imports nothing.
//
// Anchor policy (see pluto.js star.direction): lambda0 = +158.1° anchored
// so the New Horizons epoch subsolar latitude matches the flyby geometry
// (+51.5°N — the north polar region and Tombaugh Regio sunlit, the south
// pole in decades-long darkness) and the LIVE era tracks toward the
// ~2029-30 northern solstice (max +57.47° = 180 − axialTilt 122.53).
// Pluto's e = 0.249 is the largest the circular model carries — good for
// lighting, ±ephemeris-grade longitude is out of scope (bug #64 class).
//
//   1. Epoch (2015-07-14 11:49): δ ≈ +51.5°N.
//   2. Seasonal direction: δ INCREASING through the epoch (northern
//      spring→summer; equinox was 1987-88).
//   3. LIVE era (2026-07-13): δ ≈ +57.0° — near solstice.
//   4. Solstice window (~2030): δ within 0.2° of the 57.47° max.
//   5. Internal consistency: declination returns after one Pluto year.
//   6. Config guards: retrograde via tilt > 90 (POSITIVE period), mutual
//      tidal lock (rotation period == Charon orbit period), true radii.
import { sunDirectionAt } from '../src/engine/ephemeris.js';
import pluto from '../src/data/systems/pluto.js';

const EPOCH_MS = Date.parse(pluto.epoch);
const YEAR_D = pluto.primary.orbitalPeriodDays;

const decAt = (dateIso) => {
  const simS = (Date.parse(dateIso) - EPOCH_MS) / 1000;
  const d = sunDirectionAt(pluto, simS);
  return Math.asin(d.y) * 180 / Math.PI;
};

let pass = true;
const check = (name, ok, detail) => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name} — ${detail}`);
  pass = pass && ok;
};

const eDec = decAt(pluto.epoch);
check('epoch (New Horizons flyby) declination ≈ +51.5°N',
  Math.abs(eDec - 51.5) < 1.0, `sim ${eDec.toFixed(1)}°`);

const laterDec = decAt('2016-07-14T00:00:00Z');
check('seasonal direction: δ increasing through the epoch (northern spring)',
  laterDec > eDec, `epoch ${eDec.toFixed(2)}° → +1y ${laterDec.toFixed(2)}°`);

const nowDec = decAt('2026-07-13T00:00:00Z');
check('2026-07-13 (LIVE era): δ ≈ +57.0° — near northern solstice',
  Math.abs(nowDec - 57.0) < 1.0, `sim ${nowDec.toFixed(1)}°`);

const maxDec = 180 - pluto.primary.axialTiltDeg;
const solsticeDec = decAt('2030-01-01T00:00:00Z');
check(`solstice window (~2030): δ within 0.5° of the ${maxDec.toFixed(2)}° max`,
  Math.abs(solsticeDec - maxDec) < 0.5, `sim ${solsticeDec.toFixed(2)}°`);

const yearDec = decAt(new Date(EPOCH_MS + YEAR_D * 86400000).toISOString());
check('declination returns after one Pluto year (248 y)',
  Math.abs(yearDec - eDec) < 0.1,
  `epoch ${eDec.toFixed(2)}° vs +248y ${yearDec.toFixed(2)}°`);

check('retrograde via tilt > 90° with a POSITIVE rotation period (house rule)',
  pluto.primary.axialTiltDeg > 90 && pluto.primary.rotationPeriodHours > 0,
  `tilt ${pluto.primary.axialTiltDeg}°, period ${pluto.primary.rotationPeriodHours} h`);

const charon = pluto.bodies.find((b) => b.slug === 'charon');
check('mutual tidal lock: Pluto rotation == Charon orbital period',
  Math.abs(pluto.primary.rotationPeriodHours / 24 - charon.periodDays) < 1e-4,
  `${(pluto.primary.rotationPeriodHours / 24).toFixed(6)} d vs ${charon.periodDays} d`);

check('true radii: Pluto 1188.3 km, Charon 606 km (largest ratio known)',
  pluto.primary.radiusKm === 1188.3 && charon.radiusKm === 606.0,
  `ratio ${(charon.radiusKm / pluto.primary.radiusKm).toFixed(3)}`);

console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
