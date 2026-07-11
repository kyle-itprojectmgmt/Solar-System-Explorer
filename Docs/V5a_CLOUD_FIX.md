# Solar System Explorer — V5a Session Prompt
# Earth cloud realism fix + texture sourcing
# Save to Docs/V5a_CLOUD_FIX.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V5a_CLOUD_FIX.md. Implement in priority order.
Commit and push after every item."

---

## CONTEXT

v5.0.0 is live with Earth + Moon. The cloud shader produces
scattered wispy clouds uniformly distributed over the entire
Earth. Real Earth clouds follow atmospheric circulation patterns
that create distinct latitude bands — the current shader has
none of this structure.

All changes are in src/engine/shaders/earth-clouds.glsl only
plus any uniform wiring in renderer.js. No engine or config
changes needed.

Version bump: 5.0.1

---

## ITEM 1 — Earth Cloud Realism (Priority: Critical)

### The Problem
Current clouds use pure Simplex noise distributed uniformly.
Real Earth atmospheric circulation creates distinct zones:

ZONE 1 — ITCZ (0-15° latitude, both hemispheres):
  Intertropical Convergence Zone. Trade winds from both
  hemispheres converge here. Dense, continuous, organized
  cloud coverage. This is the bright white band visible in
  every NASA Earth photo. Convective towers with flat anvil
  tops. Very thick — blocks sunlight completely.

ZONE 2 — Subtropical Desert Belt (15-35°):
  Hadley cell descending air suppresses cloud formation.
  This is where all Earth's major deserts sit: Sahara,
  Arabian Peninsula, Atacama, Sonoran, Australian outback,
  Kalahari, Namib. Near-zero cloud coverage.
  Critical visual: the clear zones between cloud bands are
  as important as the clouds themselves.

ZONE 3 — Mid-latitude Storm Tracks (35-65°):
  Ferrel cell. Jet stream drives storms west to east.
  Cloud patterns are elongated east-west, organized into
  frontal systems — long curved bands, not random blobs.
  Spiral low-pressure systems (extratropical cyclones).
  Coverage: moderate, highly organized.

ZONE 4 — Polar Regions (65-90°):
  Persistent cloud and ice coverage. Dense and grey.
  Both poles covered. Southern polar vortex very persistent.

### The Fix — Latitude-Structured Cloud Function

Rewrite earth-clouds.glsl with proper atmospheric structure:

```glsl
// ============================================================
// Earth Cloud Shader — Atmospheric Circulation Model
// ============================================================

uniform float uTime;
uniform float uAltitude;
uniform float uDetailBlend;
uniform vec3  uSunDirection;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

// [include simplex noise from simplex.glsl]

// Latitude in radians from surface normal
// vNormal is the normalized surface normal in world space
// For a sphere aligned with Y-up: lat = asin(vNormal.y)
float getLatitude() {
  return asin(clamp(vNormal.y, -1.0, 1.0));
}

// Longitude (0 to 2π)
float getLongitude() {
  return atan(vNormal.z, vNormal.x) + 3.14159265;
}

// ─── ZONE WEIGHTS ──────────────────────────────────────────

float itczWeight(float lat) {
  // Dense band: 0-12° both hemispheres, peaks at equator
  float absLat = abs(lat);
  // Slight seasonal displacement: ITCZ migrates north in
  // northern summer. Use uTime for very slow seasonal drift.
  float seasonalShift = sin(uTime * 0.000001) * 0.087; // ~5°
  float shiftedLat = abs(lat - seasonalShift);
  return exp(-pow(shiftedLat / 0.18, 2.0));
}

float subTropicalClear(float lat) {
  // Clear zone: 15-35° both hemispheres
  float absLat = abs(lat);
  float inZone = smoothstep(0.26, 0.35, absLat)
               * (1.0 - smoothstep(0.52, 0.61, absLat));
  return inZone * 0.85; // 85% cloud suppression in this zone
}

float midLatWeight(float lat) {
  // Storm tracks: 35-65° both hemispheres
  float absLat = abs(lat);
  return smoothstep(0.52, 0.65, absLat)
       * (1.0 - smoothstep(1.04, 1.13, absLat))
       * 0.65;
}

float polarWeight(float lat) {
  // Polar coverage: 65-90° both hemispheres
  float absLat = abs(lat);
  return smoothstep(1.04, 1.22, absLat) * 0.9;
}

// ─── CLOUD PATTERNS BY ZONE ────────────────────────────────

// ITCZ: vertical convective towers, roughly circular cells
float itczClouds(vec2 uv, float t) {
  // Convective cells: medium frequency, high contrast
  // Slightly faster animation — convective turnover is rapid
  vec2 cellUv = uv * 6.0;
  cellUv.x += t * 0.00006; // slow eastward drift
  float cells = fbm(cellUv, 4);
  // High threshold — dense coverage with some gaps between cells
  return smoothstep(0.45, 0.75, cells);
}

// Mid-latitude: elongated frontal bands, east-west oriented
float midLatClouds(vec2 uv, float lat, float t) {
  // Stretch UV heavily in longitude direction → frontal bands
  // Sign of latitude determines which hemisphere — fronts
  // spiral differently north vs south but we simplify here
  vec2 frontUv = vec2(uv.x * 2.0, uv.y * 8.0);
  frontUv.x += t * 0.00010; // faster eastward motion
  // Add slight curvature to simulate spiral arms
  float curve = sin(uv.x * 6.28 + t * 0.00003) * 0.3;
  frontUv.y += curve;
  
  float fronts = fbm(frontUv, 3);
  // Lower threshold — moderate coverage
  float base = smoothstep(0.38, 0.62, fronts);
  
  // Spiral cyclone features: circular vortex cells
  // 2-3 per hemisphere, drift eastward over weeks
  // Use time to position them moving slowly east
  float cycSeed1 = floor(t * 0.000005); // changes every ~200k time units
  vec2 cPos1 = vec2(
    fract(sin(cycSeed1 * 127.1) * 43758.5) * 6.28,
    lat + (fract(sin(cycSeed1 * 311.7) * 43758.5) - 0.5) * 0.3
  );
  float cDist1 = length(vec2(
    uv.x - cPos1.x / 6.28,
    uv.y - (cPos1.y + 1.5708) / 3.14159
  ) * vec2(3.0, 8.0));
  float cyclone1 = (1.0 - smoothstep(0.0, 0.12, cDist1))
                 * (0.5 + 0.5 * sin(cDist1 * 40.0 - t * 0.0001));
  
  return clamp(base + cyclone1 * 0.4, 0.0, 1.0);
}

// Polar: dense, grey, amorphous
float polarClouds(vec2 uv, float t) {
  vec2 polUv = uv * 4.0;
  polUv += t * 0.00002;
  float dense = fbm(polUv, 3);
  return smoothstep(0.35, 0.55, dense);
}

// ─── MAIN ──────────────────────────────────────────────────

void main() {
  if (uDetailBlend < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  
  float lat = getLatitude();
  float lon = getLongitude();
  vec2 uv = vec2(lon / 6.28318, (lat + 1.5708) / 3.14159);
  float t = uTime;
  
  // ── Zone weights
  float wITCZ    = itczWeight(lat);
  float wClear   = subTropicalClear(lat);
  float wMidLat  = midLatWeight(lat);
  float wPolar   = polarWeight(lat);
  
  // ── Cloud coverage per zone
  float cITCZ   = itczClouds(uv, t) * wITCZ;
  float cMid    = midLatClouds(uv, lat, t) * wMidLat;
  float cPolar  = polarClouds(uv, t) * wPolar;
  
  // ── Combine zones, suppressing subtropical clear zone
  float rawCoverage = max(cITCZ, max(cMid, cPolar));
  float coverage = rawCoverage * (1.0 - wClear);
  
  // ── Altitude-staged detail (more octaves when closer)
  int octaves = uAltitude > 20000.0 ? 3
              : uAltitude > 5000.0  ? 5
              : uAltitude > 1000.0  ? 7 : 9;
  // Fine cloud texture on top of structure (mobile: subtract 2)
  float detail = fbm(uv * 12.0 + t * 0.00004, octaves) * 0.25;
  coverage = clamp(coverage + detail * coverage, 0.0, 1.0);
  
  // ── Cloud color
  // Thick clouds (ITCZ): bright white
  // Thin clouds (mid-lat edges): light grey
  float thickness = coverage;
  vec3 cloudColor = mix(
    vec3(0.85, 0.88, 0.92),  // thin: slight grey
    vec3(0.98, 0.98, 1.00),  // thick: bright white
    thickness
  );
  
  // ── Sun shading: clouds lit from sun direction
  float sunFace = max(0.0, dot(vNormal, uSunDirection));
  float lit = 0.3 + 0.7 * sunFace; // ambient + direct
  cloudColor *= lit;
  
  // ── Final output
  float alpha = coverage * uDetailBlend;
  gl_FragColor = vec4(cloudColor, alpha);
}
```

### Additional requirements:

**Tropical cyclone (hurricane) positioning:**
Hurricanes/typhoons only form:
  - Over warm ocean water (not over land, not near poles)
  - Between 5-25° latitude (not at equator — needs Coriolis)
  - In specific ocean basins

Replace the current random vortex placement with basin-aware
positioning. Basins: Atlantic (lon 260-350°), East Pacific
(180-260°), West Pacific (100-180°), Indian (40-100°).
Each basin has 0-2 active storms at any time.

**ITCZ discontinuity:**
The ITCZ is not a perfect band — it has breaks over continents
and is stronger over oceans. Add a simple land mask:
Suppress ITCZ slightly (20%) where the base Earth texture
shows brown/green (continental) vs blue (ocean).
Approximate: if vUv.x and vUv.y land in continent-rough
coordinates, reduce ITCZ strength.

**Verify at multiple altitudes:**
From 50,000 km: clear banding pattern visible — white ITCZ
  band near equator, clear subtropical zones, mid-lat swirls
From 20,000 km: frontal systems organized as east-west bands
From 5,000 km: individual cloud cells visible in ITCZ,
  spiral arms of mid-lat cyclones
From 1,000 km: detailed cloud texture, some gaps showing
  ocean/land beneath in clear zones

The clear subtropical zones are AS IMPORTANT as the cloud
coverage — they show the desert belts and make Earth look
recognizable from space.

Commit: `fix: Earth clouds — atmospheric circulation model
replaces uniform noise`

---

## ITEM 2 — Source Missing Textures

The current Earth system uses a 5400px Blue Marble (lower res
than ideal). These textures need to be downloaded and placed:

**Note the following in a comment in earth.js and attempt
download during the session:**

Earth:
  8K Blue Marble day map:
  https://visibleearth.nasa.gov/images/74117/august-blue-marble-next-generation
  (download tif, convert to jpg)

  Black Marble city lights 8K:
  https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps
  (download and use for city-lights shader sampling if possible)

  Earth specular map (land/ocean mask):
  https://planetpixelemporium.com/earth.html
  (download earthspec1k.jpg or higher res)

  Cloud layer:
  https://visibleearth.nasa.gov/images/57747/blue-marble-clouds
  (download and use as cloud base if procedural isn't sufficient)

Moon:
  NASA CGI Moon Kit 8K:
  https://svs.gsfc.nasa.gov/4720
  (download LRO_color_poles_8k.jpg for diffuse,
   ldem_3_8bit.jpg for displacement/normal)

If downloads succeed: place in public/textures/earth/ and
public/textures/moon/ and update texture references in earth.js.

If downloads fail: leave placeholder, update the URL comments
in earth.js, and note as a manual step in PROJECT_LOG.md.

Do not block the session on texture downloads.

Commit: `feat: texture sources documented + downloaded where possible`

---

## ITEM 3 — City Lights Calibration

The current city lights are procedural noise weighted by
approximate population density. Calibrate for realism:

Major issues to fix:
1. Lights should NOT appear in the Sahara, Amazon, Siberia,
   oceans — currently may appear anywhere
2. Western Europe cluster should be the most distinct feature
   (visible from very high altitude)
3. US eastern seaboard (Boston-Washington corridor) should
   be clearly visible
4. Japan and South Korea should form distinct clusters

Implement a rough population density weight using hardcoded
rectangle regions:

```glsl
float populationDensity(float lat, float lon) {
  // lon in 0-2π, lat in -π/2 to π/2
  float density = 0.0;
  
  // Western Europe (major feature)
  if (lon > 0.0 && lon < 0.52 && lat > 0.78 && lat < 1.05)
    density = max(density, 0.9);
  
  // US Northeast + Southeast
  if (lon > 4.85 && lon < 5.32 && lat > 0.52 && lat < 0.87)
    density = max(density, 0.75);
  
  // US Midwest + West Coast
  if (lon > 4.54 && lon < 5.06 && lat > 0.52 && lat < 0.87)
    density = max(density, 0.55);
  
  // Japan + South Korea
  if (lon > 2.27 && lon < 2.53 && lat > 0.52 && lat < 0.74)
    density = max(density, 0.85);
  
  // Eastern China coast
  if (lon > 1.92 && lon < 2.27 && lat > 0.42 && lat < 0.70)
    density = max(density, 0.70);
  
  // India (corridor)
  if (lon > 1.38 && lon < 1.66 && lat > 0.18 && lat < 0.42)
    density = max(density, 0.60);
  
  // Middle East
  if (lon > 0.78 && lon < 1.05 && lat > 0.35 && lat < 0.56)
    density = max(density, 0.45);
  
  // Southeast Asia
  if (lon > 1.75 && lon < 2.10 && lat > 0.0 && lat < 0.35)
    density = max(density, 0.50);
  
  // Australia (SE corner)
  if (lon > 2.53 && lon < 2.62 && lat > -0.61 && lat < -0.52)
    density = max(density, 0.45);
  
  // Brazil (São Paulo / Rio)
  if (lon > 5.28 && lon < 5.45 && lat > -0.42 && lat < -0.26)
    density = max(density, 0.45);
  
  // Everything else: near zero
  // Add tiny baseline to prevent complete darkness everywhere
  density = max(density, 0.02);
  
  return density;
}
```

Apply density as a multiplier on the noise-based city lights.
Dense regions (Europe, Japan): strong sharp clusters.
Medium regions (US, China): moderate visibility.
Low density: nearly invisible without very high zoom.

At very high altitude (>50,000 km) only Europe, Japan, and
US East Coast should be clearly visible. Other regions fade.

Commit: `fix: city lights — population density weighted regions`

---

## ITEM 4 — Hardware Calibration Notes

Do NOT attempt to calibrate shaders from headless screenshots.
Leave visual calibration for Kyle's real-hardware review.

Add console.log statements (dev-only) showing key shader values:
  - Cloud coverage percentage (average across visible hemisphere)
  - City light intensity multiplier
  - Aurora intensity at current time
  - Earthshine intensity on Moon

These help calibrate after real-hardware review.

---

## FINAL STEPS

Version bump to 5.0.1 in package.json.

```bash
npm run build
npm run preview
```

Verify at localhost:4173:
  [ ] Earth cloud bands clearly visible:
      White ITCZ near equator
      Clear subtropical zones (desert belt)
      Organized mid-lat swirls
      Polar coverage
  [ ] Cloud pattern recognizable as Earth from high altitude
  [ ] City lights concentrated in major urban regions
  [ ] No lights in Sahara, Amazon, oceans
  [ ] Western Europe clearly brightest region
  [ ] Japan cluster visible
  [ ] All existing features still work
  [ ] Jupiter system unaffected

```bash
npx wrangler deploy
```

Update PROJECT_LOG.md:
  - Add v5a to Version History
  - Note texture download status
  - Add any new calibration bugs

Commit: `docs: v5a complete — PROJECT_LOG.md updated`
Push and verify live.

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
Space Black: #050510
