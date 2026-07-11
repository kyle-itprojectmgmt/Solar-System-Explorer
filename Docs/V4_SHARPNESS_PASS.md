# Solar System Explorer — Sharpness Pass
# Paste this into the running Fable session after the current commit.
# This runs as Group 0 before continuing with V4 groups.

---

Before continuing with the next V4 group, run a sharpness pass
as Group 0. This applies to Jupiter AND all moons.
Work through in order, commit at the end of Group 0.

---

## 0a — Texture Quality Upgrades

For Jupiter: check if a 16K diffuse texture is available from
Solar System Scope (solarsystemscope.com/textures, CC BY 4.0).
If available and under 40MB, use it. If not, use 8K.
Either way replace the current texture.

For Galilean moons: check Björn Jónsson's planetary maps (bjj.is)
and USGS Astrogeology Science Center for higher resolution versions
of current moon textures. Upgrade any moon currently using 4K if
an 8K version exists.
Priority order: Europa first (ice cracks benefit most from
resolution), then Io, Ganymede, Callisto.

If textures cannot be fetched directly, note the URLs in a comment
in renderer.js and use the existing textures — do not block on this.

---

## 0b — Anisotropic Filtering on Every Texture

In renderer.js and detailShaders.js, on EVERY texture load without
exception (diffuse, normal, specular, emissive — all bodies):

```javascript
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
texture.minFilter = THREE.LinearMipmapLinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.needsUpdate = true;
```

This is the single highest-impact change for orbital distances.
Do not skip any texture — apply to every single texture load.

---

## 0c — Normal Map Intensity Per Body

Find where normalScale is set for each body in renderer.js.
Increase to the following values:

- Jupiter:      normalScale 2.0  (cloud band depth)
- Io:           normalScale 3.0  (extreme volcanic relief)
- Europa:       normalScale 2.5  (ice crack depth)
- Ganymede:     normalScale 2.5  (grooved terrain relief)
- Callisto:     normalScale 2.0  (ancient crater depth)
- Inner moons:  normalScale 1.5

Make normalScale a per-body property in jupiter.js config so it
is data-driven, not hardcoded in the engine. Add a normalScale
field to each body entry in the config.

---

## 0d — Jupiter Material Specular

Jupiter's upper atmosphere ammonia ice crystals are reflective.
Update Jupiter's material to add subtle specular:

If using MeshStandardMaterial:
```javascript
material.roughness = 0.7;
material.metalness = 0.05;
```

If using MeshPhongMaterial:
```javascript
material.shininess = 8;
material.specular = new THREE.Color(0x332211); // warm tint
```

The specular must be subtle — a soft warm highlight from the sun
direction, not metallic or plastic-looking. Verify visually that
Jupiter does not look like a shiny ball.

---

## 0e — Bloom Threshold Tighten

In postfx.js, raise the bloom luminance threshold so bloom only
affects the very brightest pixels. Only these should bloom:
- The sun point light
- Io volcanic hotspots
- Europa subsurface ocean glow

Cloud bands and general surface detail must NOT bloom — current
bloom softens surface features at mid-range altitudes.

```javascript
// Find the BloomEffect or SelectiveBloomEffect and update:
bloomEffect.luminanceThreshold = 0.85; // raise from current value
bloomEffect.luminanceSmoothing = 0.1;  // sharpen the cutoff
bloomEffect.intensity = 0.8;           // reduce overall intensity slightly
```

Verify: at 20,000 km over Jupiter, cloud band edges are crisp
and not softened by bloom bleed.

---

## 0f — Altitude-Staged Octave Counts in detailShaders.js

The existing procedural shaders use fixed octave counts. Implement
altitude-staged octaves so each zoom level reveals genuinely new
detail as the camera descends — the SpaceEngine approach.

For Jupiter cloud detail shader:
```glsl
int octaves;
if (uAltitude > 20000.0)      octaves = 3;
else if (uAltitude > 5000.0)  octaves = 5;
else if (uAltitude > 1000.0)  octaves = 7;
else                           octaves = 9;
// Use octaves variable in all fbm() calls in this shader
```

For all moon shaders (Io, Europa, Ganymede, Callisto):
```glsl
int octaves;
if (uAltitude > 5000.0)      octaves = 3;
else if (uAltitude > 1000.0) octaves = 5;
else if (uAltitude > 200.0)  octaves = 7;
else                          octaves = 9;
```

Mobile quality tier: cap at (octaves - 2) to maintain performance.
Use a GLSL loop with the dynamic octave count.
Verify shader compiles without errors on WebGL target.

Also increase base noise frequency:
- Jupiter: multiply base UV frequency by 1.5x
- All moons: multiply base UV frequency by 2.0x

This makes all procedural features smaller and crisper at every
altitude — more detail revealed per zoom level.

---

## 0g — Normal Perturbation from Procedural Noise

Currently procedural shaders add color variation but not lighting
variation — the surface looks flat even when texturally detailed.
Add normal map perturbation derived from the noise gradient so
the procedural layer also drives surface lighting.

Add this to each body's detail shader after computing the main
noise value:

```glsl
// Compute gradient of the noise for normal perturbation
float eps = 0.001;
float nx = fbm(uv + vec2(eps, 0.0), octaves);
float ny = fbm(uv + vec2(0.0, eps), octaves);
float nz = fbm(uv, octaves);

vec3 proceduralNormal = normalize(vec3(
  (nz - nx) / eps * uDetailBlend * 2.0,
  (nz - ny) / eps * uDetailBlend * 2.0,
  1.0
));

// Blend with existing normal map sample
vec3 finalNormal = normalize(
  mix(baseNormal, proceduralNormal, uDetailBlend * 0.6)
);
```

Expected result per body:
- Jupiter: cloud wisps cast subtle lighting variation, not flat
- Europa: ice crack edges have depth and shadow
- Io: volcanic flow boundaries have genuine relief
- Ganymede: groove ridges catch light from one side
- Callisto: crater rims are lit, floors are shadowed

This is the fix that makes low-altitude views look genuinely
three-dimensional rather than flat colored texture patterns.

---

## 0h — Visual Verification

Verify all of the following before committing:

Jupiter:
  - At 50,000 km: cloud bands noticeably crisper than before
  - At 20,000 km: GRS region shows more internal cloud structure
  - At 5,000 km: individual cloud wisps visible with lighting variation
  - At 1,000 km: surface looks 3D, not flat
  - No plastic or over-specular appearance

Europa:
  - At 10,000 km: ice crack network sharper and more defined
  - At 500 km: crack edges sharp, surface looks three-dimensional
  - Subsurface glow still visible and not blown out by bloom

Io:
  - At 5,000 km: sulfur color boundaries crisper
  - At 500 km: volcanic relief visible in lighting, not just color

Ganymede:
  - Dark/light terrain boundary sharper
  - Grooved terrain ridges catch directional light

Callisto:
  - Crater density looks overwhelming and sharp at 500 km
  - Bright ice crater floors contrast sharply with dark regolith

Performance:
  - FPS remains above 30 at all altitudes on current machine
  - Mobile tier: verify octave reduction keeps mobile smooth

---

## 0i — Commit and Push

```bash
git add -A
git diff --cached --name-only
# Verify .js and .glsl files appear — not just .md
git commit -m "feat: sharpness pass — anisotropic filtering + normal intensity + octave staging + normal perturbation + bloom tighten"
git push origin main
git show HEAD --name-only
# Verify source files in commit
```

Then continue with V4 Group 1.

---

## Expected Overall Result

Altitude range and what becomes visible after this pass:

100,000–20,000 km:  Dramatically sharper from anisotropic filtering
                    + 16K texture. Cloud band edges crisp.

20,000–5,000 km:    Normal map intensity makes relief pop.
                    Specular highlights visible on lit hemisphere.
                    Bloom no longer softening mid-tones.

5,000–1,000 km:     Octave staging reveals new detail layers.
                    Smaller cloud wisps, finer crack networks,
                    denser crater fields appear for first time.

1,000–200 km:       Normal perturbation makes surface genuinely
                    3D. Lighting variation across features.
                    Most SpaceEngine-like altitude range.

Below 200 km:       Zoom floor (V4 Group 4a) prevents descent
                    into blur. Last visible altitude is always
                    the sharpest and most detailed view.
