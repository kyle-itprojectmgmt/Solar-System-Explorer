# Solar System Explorer — V3 Prompt
# Procedural Detail Shaders: Jupiter + All Galilean Moons

---

## CONTEXT

V2 is built and live. This prompt adds infinite-resolution procedural
detail shaders to Jupiter and all four Galilean moons. As the camera
descends, surfaces reveal progressively more geological detail generated
in GLSL — no additional texture assets required.

Work through each body in order. Commit after each one. Shared
infrastructure goes first.

---

## STEP 1 — SHARED INFRASTRUCTURE

Create a shared GLSL Simplex noise library that all five shaders
reference. Do not duplicate noise code across shaders.

Create `/src/engine/glsl/simplex.glsl`:
- Implement 2D and 3D Simplex noise functions
- Include a ridged noise variant (absolute value, inverted) for crack
  and ridge features
- Include a fractal Brownian motion (fBm) helper at 2, 3, and 4 octaves
- This file is imported/injected into all five body shaders

Add two shared uniforms passed every frame to all body shaders:
- `uTime` — elapsed simulation time, for subtle animation
- `uAltitude` — camera distance minus body radius in km
- `uDetailBlend` — float 0.0 to 1.0, driven by per-body altitude
  smoothstep, controls procedural blend over base texture

All procedural shaders must be fully disabled (uDetailBlend = 0.0)
above their activation altitude. Zero GPU cost when viewing from far.

Add a small "Surface Detail Active" green dot indicator to the body
info panel that appears when uDetailBlend > 0.05 for the current
target body.

Commit: `feat: shared GLSL simplex noise library + detail blend uniforms`

---

## STEP 2 — JUPITER PROCEDURAL CLOUD DETAIL

Activation altitude: 50,000 km (blend fully in by 5,000 km)
`uDetailBlend = smoothstep(50000.0, 5000.0, uAltitude)`

Upgrade base texture first:
Replace current Jupiter texture with the highest resolution version
available from Solar System Scope (8K or 16K, CC BY 4.0). Set
THREE.LinearMipmapLinearFilter (trilinear filtering) on the texture
with anisotropy set to renderer.capabilities.getMaxAnisotropy().

Procedural cloud detail shader layers (blend over base texture):

LAYER 1 — Fine cloud turbulence:
- Simplex fBm at 3 octaves, increasing frequency
- Modulate by base texture color to preserve banding pattern
- Light zones (bright base color): wispy high cloud detail in
  whites and pale yellows (#F5F0E0)
- Dark belts (dark base color): turbulent brown-orange eddies
  (#8B5A2B, #C47A2B)
- Animate: uTime * 0.00005 so clouds slowly churn

LAYER 2 — Small-scale wisps:
- Higher frequency Simplex noise, lower amplitude
- Thin wispy streaks in the direction of latitude lines
- Stretch noise UV coordinates 4:1 horizontally to create
  elongated cloud streaks

LAYER 3 — Great Red Spot vortex detail:
- Activate when camera is within 20,000 km AND aimed at
  GRS latitude (~23 degrees South)
- Vortex noise: rotate UV coordinates around GRS center by
  an angle that increases with distance from center (spiral)
- Add slower rotation to this layer vs base texture rotation
- Internal color variation: deep reds (#8B0000) at center,
  orange (#FF6600) mid-ring, pale cream (#F5E6C8) outer edge
- Should look like a genuine atmospheric vortex up close

LAYER 4 — Atmospheric depth haze:
- Activate below 10,000 km altitude
- Distance-from-nadir gradient: clouds at horizon appear
  more hazy and blue-shifted than clouds directly below
- Implement as dot product of view direction and nadir vector
- Haze color: very pale blue-grey (#C8D4E8 at low opacity)

Commit: `feat: Jupiter procedural cloud detail shader with GRS vortex`

---

## STEP 3 — IO PROCEDURAL SURFACE DETAIL

Activation altitude: 10,000 km (blend fully in by 500 km)
`uDetailBlend = smoothstep(10000.0, 500.0, uAltitude)`

Io is the most volcanically active body in the solar system. The
procedural layer communicates geological violence and chemical chaos.

LAYER 1 — Sulfur palette modulation:
- Sample existing texture color as base
- Shift toward sulfur palette using noise-defined regions:
  Yellows: #E8D44D (sulfur dioxide frost)
  Oranges: #D4541A (sulfur allotropes, mid-temperature)
  Reds: #8B1A1A (high-temperature sulfur)
  Blacks: #1A1A00 (basaltic lava, freshest flows)
- Different noise frequencies create different compound zones

LAYER 2 — Lava flow texture:
- Elongated noise (stretch UV 3:1 in flow direction) creates
  flow-like patterns
- Dark basaltic flows (#1A1200) cut through lighter sulfur
- Flow direction varies by region using low-frequency noise
  to rotate the stretch axis

LAYER 3 — Caldera features:
- Circular low-frequency noise creates dark collapse depressions
- Each caldera: dark floor (#0D0D00) with bright sulfur ring
  deposit around edge (#FFE44D)
- Size variation: large calderas at low frequency, smaller
  pit craters at higher frequency

LAYER 4 — Hot spot glow:
- Activate below 200 km altitude only
- Small intense points of warm glow (#FF4400, additive blend)
  at noise-identified volcanic hot spot locations
- Pulse slowly: sin(uTime * 0.2) * 0.3 + 0.7 for breathing
  effect suggesting active heat emission

LAYER 5 — SO2 frost patches:
- High-frequency noise adds subtle frost deposits (#F5F5E0)
  in topographic lows between lava flows
- Very subtle — frost is thin and patchy

Animation speed: uTime * 0.0001
Io's surface changes over years not seconds, but subtle
animation suggests ongoing geological activity.

Commit: `feat: Io procedural volcanic surface detail shader`

---

## STEP 4 — EUROPA PROCEDURAL SURFACE DETAIL

Activation altitude: 10,000 km (blend fully in by 500 km)
`uDetailBlend = smoothstep(10000.0, 500.0, uAltitude)`

Europa is a smooth ice world cracked by Jupiter's tidal forces.
The procedural layer reveals the fractal beauty of a frozen ocean lid.

LAYER 1 — Micro-crack fractal network:
- The base texture shows major lineae (cracks)
- Add fractal sub-cracks at 3 scales using ridged noise
  (absolute value of Simplex, inverted)
- Color cracks reddish-brown (#8B4513) — organic compounds
  deposited by upwelling water from the subsurface ocean
- Line width decreases with each fractal level
- Cracks follow the local stress field direction (use low-
  frequency noise to rotate crack orientation by region)

LAYER 2 — Ice plain color variation:
- Smooth areas: subtle blue-white variation (#E8F4F8 to #B0D4E8)
  from compression and tension stresses in the ice sheet
- Low frequency noise, very subtle amplitude (0.05 max)
- Conveys the sense of a living, flexing ice shell

LAYER 3 — Chaos terrain:
- In regions where base texture is mid-tone (0.35 to 0.65
  luminance), add blocky noise suggesting jumbled ice rafts
- Sharp-edged Voronoi-style noise: irregular polygon blocks
  with slight brightness variation between adjacent blocks
- Implies the ice shell has broken up and refrozen

LAYER 4 — Subsurface ocean glow:
- Activate below 1,000 km altitude
- Very subtle warm blue-white underlighting (#4488FF at 5%
  max opacity)
- Pulse: sin(uTime * 0.1) * 0.025 + 0.025 opacity variation
- The liquid ocean 10-30 km below, glowing through thin ice
- Should be barely perceptible — almost subliminal

LAYER 5 — Fresh crater floor ice:
- Noise-identified bright spots receive pure white (#FFFFFF)
  crater floors — fresh water ice exposed by recent impacts
- Contrasts sharply with darker surrounding terrain

Animation speed: uTime * 0.00002
Ice shell moves extremely slowly under tidal flexing.

Commit: `feat: Europa procedural ice crack and ocean glow shader`

---

## STEP 5 — GANYMEDE PROCEDURAL SURFACE DETAIL

Activation altitude: 10,000 km (blend fully in by 500 km)
`uDetailBlend = smoothstep(10000.0, 500.0, uAltitude)`

Ganymede has two completely distinct terrain types. Sample base
texture luminance to determine which treatment to apply per pixel.

DARK TERRAIN (base luminance < 0.35):
Ancient heavily cratered silicate terrain, 4 billion years old.

- High-frequency noise for dust and regolith texture
  Colors: dark browns #2A1F0E with subtle #3D2B1A variation
- Crater micro-detail: circular noise features with slightly
  brighter rims (#4A3828) and darker floors (#1A1008)
- Almost no color variation — this terrain is uniformly dark,
  old, and geologically dead
- Fine impact gardening texture at highest frequency: suggests
  billions of years of micrometeorite bombardment turning the
  surface to fine dark powder

LIGHT TERRAIN (base luminance > 0.45):
Younger grooved terrain formed by ancient tectonic extension.

- Parallel ridge-and-groove structure using directionally
  stretched noise (like grooves on a vinyl record)
- Alternating light (#C8D4C0) and slightly darker (#8090A0)
  parallel bands at small scale
- Groove direction varies by region: use low-frequency noise
  to slowly rotate the groove orientation across the surface —
  in reality different groove regions have different orientations
  from different tectonic episodes
- Fresh crater ejecta rays: bright white streaks (#E8EEE0)
  extending from noise-identified recent impact points

POLAR AURORA (both terrain types):
- Activate below 2,000 km altitude at latitudes above 60 degrees
- Faint green-blue shimmer (#44FF88 at 3% max opacity)
- Animate: sin(uTime * 0.3 + latitude * 0.1) for dancing aurora
- Ganymede has its own magnetosphere and produces real auroras —
  the only moon in the solar system to do so

TRANSITION ZONE (luminance 0.35 to 0.45):
- Blend between dark and light terrain treatments using
  smoothstep on the luminance value
- Creates natural-looking boundary between terrain types

Animation speed: uTime * 0.00003

Surface feature labels to add (in addition to existing):
"Osiris Crater" — large fresh bright crater
"Gilgamesh Basin" — ancient large impact basin in dark terrain

Commit: `feat: Ganymede procedural grooved terrain and aurora shader`

---

## STEP 6 — CALLISTO PROCEDURAL SURFACE DETAIL

Activation altitude: 10,000 km (blend fully in by 500 km)
`uDetailBlend = smoothstep(10000.0, 500.0, uAltitude)`

Callisto is the most heavily cratered object in the solar system.
4 billion years of impact history. Zero geological resurfacing.
The procedural layer is about density, age, and deep time.

LAYER 1 — Multi-scale fractal cratering:
Add 4 octaves of circular crater features at decreasing sizes.
Each crater in noise: dark floor, brighter rim ring, faint ejecta.

Large craters (low frequency):
- Floor: #0D0D0D (deeply shadowed, ancient)
- Rim: #3D3020 (slightly brighter, raised edge)
- Ejecta blanket: very faint #2A2018 gradient outward

Medium craters (mid frequency):
- Overlapping the large ones in all directions
- Slightly brighter floors than large craters (less deep shadow)

Small craters (high frequency):
- Covering every surface including crater floors and rims
- The surface has been re-cratered so many times that craters
  are on top of craters on top of craters

Micro-cratering (highest frequency):
- Suggests a fine powdery regolith surface
- The top few meters turned to dust by 4 billion years of
  micrometeorite impacts

LAYER 2 — Dark dusty regolith base:
- Overall surface: very dark #1A1510 with warm brown dust
  #3D2B1F in noise-defined patches
- Callisto is one of the darkest objects in the solar system —
  dark carbonaceous material covers everything

LAYER 3 — Bright ice crater floors:
- Fresh craters expose clean water ice beneath the dark surface
- Noise-identified bright spots: pure white (#FFFFFF) to pale
  blue-white (#E8F0FF) crater floors
- Sharp contrast with surrounding dark terrain
- These bright craters are some of the most striking features
  visible on the real Callisto

LAYER 4 — Valhalla multi-ring basin:
- Near Valhalla coordinates (approximately lat 16N, lon 56W)
- Concentric ring noise at very large scale (rings spread 900 km)
- Subtle brightness variation in concentric bands: alternating
  slightly lighter (#2A2018) and darker (#141008) rings
- The innermost bright zone (Valhalla central plain): pale
  grey-white (#C8C0B0) — ancient impact melt that refroze flat
- Very low amplitude — Valhalla is ancient and worn flat by
  subsequent cratering, not dramatic raised rings

Animation speed: uTime * 0.00001
Callisto is geologically completely dead. The only surface
change is cosmic ray gardening — imperceptible on any human
timescale. Near-zero animation reflects this deep stillness.

Surface feature labels to add:
"Lofn Crater" — bright fresh crater
"Burr Crater" — prominent impact feature

Commit: `feat: Callisto procedural fractal cratering shader`

---

## STEP 7 — INTEGRATION AND SMOKE TEST

After all five shaders are implemented:

1. Test each body by entering Orbit Insertion mode and descending
   through the full altitude range from 50,000 km to minimum:

   Jupiter:
   - At 50,000 km: base texture only, no procedural
   - At 20,000 km: subtle cloud turbulence visible
   - At 5,000 km: full cloud detail, GRS shows internal vortex
   - At 1,000 km: atmospheric haze at horizon visible

   Io:
   - At 10,000 km: base texture only
   - At 2,000 km: sulfur color modulation and lava flows appear
   - At 500 km: caldera features clearly visible
   - At 100 km: hot spot glow visible on dark side features

   Europa:
   - At 10,000 km: base texture only
   - At 3,000 km: micro-crack network appears over major lineae
   - At 500 km: chaos terrain blocks, ice color variation
   - At 200 km: subsurface ocean glow barely perceptible

   Ganymede:
   - At 10,000 km: base texture only
   - At 3,000 km: groove texture on light terrain, dust on dark
   - At 500 km: aurora shimmer at poles visible
   - At 200 km: crater micro-detail covering all terrain

   Callisto:
   - At 10,000 km: base texture only
   - At 3,000 km: multi-scale cratering begins appearing
   - At 500 km: crater-on-crater density is overwhelming
   - At 200 km: bright ice floor craters contrast with dark regolith

2. Verify performance targets:
   - No FPS drop above activation altitude (shaders disabled)
   - Acceptable FPS at minimum altitude on desktop tier
   - Mobile tier: reduce noise octave count by 1 when on mobile
     quality setting to maintain performance

3. Verify "Surface Detail Active" indicator appears correctly
   for each body when below activation altitude

4. Check that all existing features still work:
   - All 7 camera modes
   - Time controls
   - Eclipse events
   - Audio system
   - Screenshot (captures procedural detail correctly)

5. Build and verify production:
   ```bash
   npm run build
   npm run preview
   ```

6. Deploy:
   ```bash
   npm run deploy
   ```

Final commit:
`feat: v3 complete — procedural detail shaders for Jupiter + 4 Galilean moons`

---

## STYLE GUIDE REMINDER

All UI additions use:
- Headings: Montserrat
- Body / data: Lato
- Primary Blue: #0077CC
- Light Blue Accent: #66B2FF
- White: #FFFFFF
- Light Gray: #D9D9D9
- Dark Gray: #4D4D4D at 85% opacity
- Space Black: #050510
