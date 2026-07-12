# Solar System Explorer — V5c Session Prompt
# Earth cloud polish + curated preset scoping
# Small focused session — 3 items only.

---

## CONTEXT

v5.1.2 is live (bcac126). This session fixes three remaining
Earth polish issues before moving to V6 Mars. All changes are
in earth-clouds.glsl and ui.js only. No engine or physics changes.
Version bump to 5.1.3.

---

## ITEM 1 — Hurricane Vortex Stripe Fix (Bug #41)

The hurricane/cyclone shader (ec_hurricane function in
earth-clouds.glsl) uses a pure sin(ang * 3.5) spiral with no
noise modulation. At the terminator, the cloud-relief height
shading turns this into a visually machined spiral-rose pattern —
perfectly regular concentric rings that look artificial.

**Measure first:**
Run a screenshot at the terminator with a hurricane visible.
Note the exact ang_spiral frequency and the relief amplitude
that makes the rings visible. This determines how much fbm
modulation is needed to break up the pattern without destroying
the hurricane structure.

**Fix in earth-clouds.glsl, ec_hurricane function:**

```glsl
float ec_hurricane(vec2 uv, vec2 eye, float t) {
  vec2 d = uv - eye;
  float r = length(d);
  float ang = atan(d.y, d.x);

  // Current — perfectly regular rings:
  // float spiral = sin(ang * 3.5 - r * 18.0 + t * 0.3);

  // Fixed — break up rings with fbm modulation:
  // 1. Add noise to the angle before the sin (breaks regularity)
  float angNoise = fbm(uv * 4.0 + t * 0.00005, 3) * 0.8;
  float spiral = sin(ang * 3.5 + angNoise - r * 18.0 + t * 0.3);

  // 2. Fade ring contrast with distance from eye center
  // Outer bands should be softer than inner bands
  float bandContrast = smoothstep(0.25, 0.0, r);
  spiral = spiral * bandContrast + spiral * 0.3;

  // 3. Add radial noise to break the perfect concentric circles
  float radNoise = fbm(vec2(r * 8.0 + t * 0.00003, ang * 2.0), 2) * 0.4;
  spiral += radNoise;

  // Eye: dark calm center
  float eyeFade = smoothstep(0.0, 0.04, r);
  float coverage = clamp(spiral * eyeFade, 0.0, 1.0);

  return coverage * smoothstep(0.3, 0.0, r - 0.05);
}
```

The result: hurricane spiral still clearly recognizable as a
vortex, but bands are organic and irregular rather than machined.
The eye remains dark and calm. At the terminator, the relief
shading should now produce natural-looking curved shadows rather
than a spiral rose.

**Verify:**
Screenshot at the terminator with a hurricane. Spiral should
look like a real satellite photo of a hurricane — asymmetric
bands with natural variation. No perfectly regular concentric
rings visible at any angle or lighting condition.

Commit: `fix: hurricane vortex — fbm modulation breaks simplex
lattice ring pattern`

---

## ITEM 2 — Cloud Confetti + Sun Glint Fix (Bug #42)

Two related issues at low altitude:

**Issue A — Cloud confetti below 2,000 km:**
LAYER 5 puff term (snoise(vObjPos * 250) ± 0.18 additive)
adds speckle to ALL cloud areas, not just edges. Below 2,000 km
inside a large weather system this produces wall-to-wall dots.

Fix: halve the puff amplitude AND change its role from additive
speckle to edge erosion — it should eat into cloud edges to
give them a natural ragged texture, not add dots everywhere:

```glsl
// Current — additive speckle everywhere:
// float puff = snoise(vObjPos * 250.0 + uTime * 0.00008) * 0.18;
// coverage += puff;

// Fixed — edge erosion only (multiplied, not added):
float puff = snoise(vObjPos * 180.0 + uTime * 0.00008) * 0.09;
// Only erode edges (where coverage is between 0.3-0.7)
// Dense cloud centers and clear areas unaffected
float edgeMask = 1.0 - abs(coverage - 0.5) * 2.5;
coverage -= puff * edgeMask * uDetailBlend;
coverage = clamp(coverage, 0.0, 1.0);
```

Lower frequency (250→180) also reduces the lattice-alignment
dots-in-rows artifact at lower altitudes.

**Issue B — Sun glint undithered white blob at 2,000 km:**
The ocean specular glint renders as a large undithered white
blob at mid-altitude. It should be a tight, bright point that
expands gracefully with distance.

Fix in earth-ocean.glsl:
```glsl
// Current — large undithered blob:
// float glint = pow(max(0.0, dot(reflDir, viewDir)), 200.0);

// Fixed — tighter at low altitude, expands with distance:
// Scale sharpness with altitude: close = very tight, far = softer
float sharpness = mix(800.0, 150.0,
  smoothstep(2000.0, 20000.0, uAltitude));
float glint = pow(max(0.0, dot(reflDir, viewDir)), sharpness);

// Add subtle dither to break the hard edge at all distances:
float dither = (fract(gl_FragCoord.x * 0.5 + gl_FragCoord.y) - 0.5)
               * 0.15;
glint = clamp(glint + dither * glint, 0.0, 1.0);

// Cap intensity to prevent blinding white:
glint = min(glint * 2.5, 1.0);
```

**Verify:**
At 2,113 km over the Pacific day side:
- Cloud layer shows natural ragged edges, not confetti dots
- Dense cloud areas (ITCZ) solid without speckle inside
- Sun glint is a tight bright point, not a large blob
- Glint has soft edge (no hard circular cutoff)

Commit: `fix: cloud puff edge erosion + sun glint sharpness scaling`

---

## ITEM 3 — Jupiter Presets Showing on Earth (Bug #49)

The curated SAVE panel presets "Io Volcano Flyby", "GRS Close
Pass", and "Triple Moon Shadow" appear when viewing the Earth
system. These are Jupiter-specific and make no sense on Earth.

Fix in ui.js where curated presets are rendered in the SAVE panel:

Each curated preset in the config has a system scope. Add a
`system` field to each Jupiter preset:

In jupiter.js curatedPresets, add `system: 'jupiter'` to:
  - Io Volcano Flyby
  - GRS Close Pass
  - Triple Moon Shadow
  - Voyager 1979 (already Jupiter-specific by nature)

In earth.js curatedPresets, add `system: 'earth'` to:
  - ISS Orbit View
  - Earthrise
  - Apollo 11 Site
  - City Lights at Night
  - Aurora from Orbit

In ui.js SAVE panel rendering, filter presets by active system:
```javascript
const activeSys = physics.activeSystem; // 'jupiter' or 'earth'
const visiblePresets = curatedPresets.filter(p =>
  !p.system || p.system === activeSys
);
```

Presets with no `system` field (if any) show on all systems.

**Verify:**
- On Jupiter: SAVE panel shows Voyager, Io Flyby, GRS, Triple Shadow
- On Earth: SAVE panel shows ISS, Earthrise, Apollo 11, City Lights, Aurora
- Switching systems: preset list updates immediately
- My Presets (user-saved) always visible on all systems

Commit: `fix: curated presets scoped to their system — Jupiter
presets hidden on Earth and vice versa`

---

## FINAL STEPS

Version bump to 5.1.3 in package.json.

Update PROJECT_LOG.md:
  - Add v5c to Version History
  - Mark bugs #41, #42, #49 as resolved

```bash
npm run build
npm run preview
```

Verify:
  [ ] Hurricane spiral looks organic at terminator — no rings
  [ ] Cloud edges ragged and natural at 2,000 km
  [ ] No confetti dots inside dense cloud areas
  [ ] Sun glint is a tight point, not undithered blob
  [ ] Jupiter SAVE panel: Voyager, Io, GRS, Triple Shadow
  [ ] Earth SAVE panel: ISS, Earthrise, Apollo 11, City Lights, Aurora
  [ ] All existing features still work on both systems
  [ ] Regression suites green

```bash
npx wrangler deploy
```

Commit: `docs: v5c complete — PROJECT_LOG.md updated`
Push: `git push origin main`

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
Space Black: #050510
