// ---------------------------------------------------------------------------
// Scene renderer — builds a Three.js scene from ANY system config.
// No body-specific logic lives here; everything is driven by the config
// (feature flags, ring tables, textures, orbital elements).
//
// WebGPU note: v1 renders through WebGLRenderer so the `postprocessing`
// pipeline (bloom / DoF / grain) is available everywhere. The renderer is
// isolated behind this module so a WebGPURenderer path can be added without
// touching the rest of the engine.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { TEXTURE_BASE_URL, KM_PER_UNIT, AU_KM } from '../config.js';
import { applyDetailShader, detailBlend } from './detailShaders.js';
import EARTH_ATMOSPHERE_GLSL from './shaders/earth-atmosphere.glsl?raw';
import MARS_ATMOSPHERE_GLSL from './shaders/mars-atmosphere.glsl?raw';
import PLUTO_ATMOSPHERE_GLSL from './shaders/pluto-atmosphere.glsl?raw';
import SATURN_ATMOSPHERE_GLSL from './shaders/saturn-atmosphere.glsl?raw';
import TITAN_GLSL from './shaders/titan.glsl?raw';
import SATURN_RINGS_GLSL from './shaders/saturn-rings.glsl?raw';
import SUN_PHOTOSPHERE_GLSL from './shaders/sun-photosphere.glsl?raw';
import SUN_CORONA_GLSL from './shaders/sun-corona.glsl?raw';
import SUN_CHROMOSPHERE_GLSL from './shaders/sun-chromosphere.glsl?raw';
import SUN_SPOTS_GLSL from './shaders/sun-spots.glsl?raw';
import SIMPLEX_GLSL from './glsl/simplex.glsl?raw';

const K = 1 / KM_PER_UNIT; // km -> scene units

export class SceneRenderer {
  constructor(system, quality, onProgress) {
    this.system = system;
    this.quality = quality; // { tier, pixelRatio, postfx, highResPrimary }

    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.tier !== 'mobile',
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(quality.pixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050510);

    // FOV 48: wide FOVs perspective-stretch spheres near the frame edge,
    // which reads as an "oval" planet.
    // Near plane 0.01 units = 10 km: inner-moon zoom floors put the surface
    // ~20 km from the camera — a 50 km near plane clipped a hole through
    // them (bug #14). The logarithmic depth buffer keeps precision fine.
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.01, 4e6);
    this.camera.position.set(0, 60, 260);
    this.camera.updateProjectionMatrix();

    this.loadingManager = new THREE.LoadingManager();
    if (onProgress) {
      this.loadingManager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
    }
    this.texLoader = new THREE.TextureLoader(this.loadingManager);

    // Root group carries the primary's axial tilt; physics runs in the
    // primary's equatorial frame, so moons/rings/orbit lines all live here.
    this.root = new THREE.Group();
    this.root.rotation.z = THREE.MathUtils.degToRad(system.primary.axialTiltDeg || 0);
    this.scene.add(this.root);

    this.bodyMeshes = new Map(); // name -> { mesh, group, cfg, ... }
    this.pickables = [];
    this.resizeHooks = []; // extra consumers (postfx) resize through here
    this.detailEntries = []; // bodies with procedural detail shaders

    // Star systems (V9, system.isStar): the primary IS the light source —
    // self-luminous shader spheres instead of a lit textured planet, and no
    // external directional sun / sprite / lens flare.
    if (system.isStar) this._buildSunLights(); else this._buildLights();
    this._buildStarfield();
    if (system.isStar) this._buildSunPrimary(); else this._buildPrimary();
    this._buildRings();
    this._buildBodies();
    this._buildOrbitLines();
    this._buildTransitDecal();
    this._buildResonanceLines();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => this.onResize());
    this.onResize(); // ensure aspect/size are coherent before first frame
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    for (const hook of this.resizeHooks) hook(w, h);
  }

  texUrl(slug, file) {
    return `${TEXTURE_BASE_URL}/${slug}/${file}`;
  }

  // Texture upgrade sources (checked 2026-07-11, see PROJECT_LOG backlog):
  //   Jupiter 16K — not publicly available; Solar System Scope caps at 8K
  //     (https://www.solarsystemscope.com/textures/download/8k_jupiter.jpg,
  //     already shipped as jupiter/diffuse_8k.jpg).
  //   Galilean moons 8K — candidates require GeoTIFF conversion:
  //     Björn Jónsson: https://bjj.is/3d/planetary-maps (Io/Europa/Ganymede/Callisto)
  //     USGS Astrogeology: https://astrogeology.usgs.gov/search (Voyager/Galileo mosaics)

  /** Max-quality sampling on every surface texture — single highest-impact
   *  sharpness change at orbital distances. */
  _prepSurfaceTexture(tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter; // trilinear
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // -- Lighting ---------------------------------------------------------------

  _buildLights() {
    const star = this.system.star;
    const d = new THREE.Vector3(...star.direction).normalize();
    this.sunDir = d.clone(); // in root (equatorial) frame

    this.sunLight = new THREE.DirectionalLight(star.color, star.intensity);
    this.sunLight.position.copy(d).multiplyScalar(1000);
    this.root.add(this.sunLight);
    this.root.add(this.sunLight.target);

    // Faint fill so night sides aren't pure black on screens. Config-driven
    // per system (V5b): Earth's night side keeps faint terrain silhouettes
    // (earthglow / atmospheric scatter); Jupiter stays at the calibrated dim
    // default. Accepts a number (intensity) or { color, intensity }.
    const amb = this.system.nightAmbient;
    this.scene.add(new THREE.AmbientLight(
      typeof amb === 'object' ? amb.color : 0x223344,
      (typeof amb === 'object' ? amb.intensity : amb) ?? 0.06));

    // "Planet-shine": reflected light from the primary softly lights the
    // moons' primary-facing sides.
    this.planetShine = new THREE.PointLight(0xffc890, 0.55, 0, 1.2);
    this.root.add(this.planetShine);

    // Visible sun: bright sprite + lens flare at true distance.
    const sunDist = star.distanceAU * AU_KM * K;
    this.sunAnchor = new THREE.Object3D();
    this.sunAnchor.position.copy(d).multiplyScalar(sunDist);
    this.root.add(this.sunAnchor);

    const flareTex = makeFlareTexture(256, 'rgba(255,245,230,1)');
    const ringTex = makeFlareTexture(128, 'rgba(150,190,255,0.7)', true);
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flareTex, color: 0xfff8ee, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sunSprite.scale.setScalar(sunDist * 0.03);
    this.sunAnchor.add(sunSprite);

    const flareLight = new THREE.PointLight(star.color, 0, 0);
    flareLight.position.copy(this.sunAnchor.position);
    this.flareLight = flareLight; // repositioned when the ephemeris moves the sun
    this.root.add(flareLight);
    const lensflare = new Lensflare();
    lensflare.addElement(new LensflareElement(flareTex, 220, 0));
    lensflare.addElement(new LensflareElement(ringTex, 60, 0.4));
    lensflare.addElement(new LensflareElement(ringTex, 90, 0.62));
    lensflare.addElement(new LensflareElement(ringTex, 40, 0.85));
    flareLight.add(lensflare);
  }

  // -- Starfield ---------------------------------------------------------------

  _buildStarfield() {
    // Photographic Milky Way (V5 1b): ESO eso0932a equirectangular panorama
    // (ESO/S. Brunier, CC BY 4.0 — https://www.eso.org/public/images/eso0932a/),
    // rendered inside-out on a distant sphere, fixed in inertial space.
    // Falls back to the procedural field if the texture is missing.
    const tex = new THREE.TextureLoader().load(
      this.texUrl('starfield', 'milkyway.jpg'),
      undefined, undefined,
      () => { sky.visible = false; this._buildProceduralStarfield(); }
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1.8e6, 64, 32),
      // color multiplies the panorama — ~15% perceived dim (v10.0.3, stars
      // should recede behind lit planets). Deliberately NOT via
      // toneMappingExposure, which would dim the planets too.
      new THREE.MeshBasicMaterial({
        map: tex, color: 0xd9d9d9, side: THREE.BackSide, depthWrite: false,
      })
    );
    sky.material.toneMapped = false;
    // Orient the galactic band like the old procedural field (tilted).
    sky.rotation.z = 0.35;
    sky.rotation.x = 0.2;
    sky.renderOrder = -2;
    this.scene.add(sky);

    this._buildBrightStars();
  }

  /** HYG bright-star overlay (V5 1c): the ~9k naked-eye stars as spectrally
   *  colored point sprites over the panorama; names kept for labels. */
  _buildBrightStars() {
    this.starLabels = [];
    fetch(`${TEXTURE_BASE_URL.replace('/textures', '')}/data/brightstars.json`)
      .then((r) => r.json())
      .then((data) => {
        const R = 1.6e6;
        const n = data.count;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const size = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = data.dirs[i * 3] * R;
          pos[i * 3 + 1] = data.dirs[i * 3 + 1] * R;
          pos[i * 3 + 2] = data.dirs[i * 3 + 2] * R;
          const c = bvToColor(data.cis[i]);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          size[i] = Math.max(0.5, 3.0 - data.mags[i] * 0.4);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
        const mat = new THREE.ShaderMaterial({
          vertexShader: /* glsl */ `
            attribute float aSize;
            varying vec3 vColor;
            void main() {
              vColor = color;
              gl_PointSize = aSize;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: /* glsl */ `
            varying vec3 vColor;
            void main() {
              vec2 d = gl_PointCoord - 0.5;
              float a = smoothstep(0.5, 0.15, length(d));
              // x0.8 (v10.0.3): stars are a backdrop — ~20% dimmer so lit
              // planets dominate; bright named stars stay clearly visible.
              gl_FragColor = vec4(vColor * 0.8, a);
            }
          `,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          depthTest: true, // explicit: stars must never draw over a planet
        });
        mat.toneMapped = false;
        const points = new THREE.Points(geo, mat);
        points.renderOrder = -1; // drawn first; opaque bodies overdraw them
        this.scene.add(points);
        for (const [idx, name] of data.names) {
          this.starLabels.push({
            name,
            pos: new THREE.Vector3(
              pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]),
          });
        }
      })
      .catch(() => { /* catalog optional — sky still renders */ });
  }

  _buildProceduralStarfield() {
    const COUNT = 10000;
    const R = 1.8e6;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const rand = mulberry32(1979);
    const milkyWayNormal = new THREE.Vector3(0.35, 1, 0.2).normalize();
    const tangentA = new THREE.Vector3(1, 0, 0).cross(milkyWayNormal).normalize();
    const tangentB = milkyWayNormal.clone().cross(tangentA);

    for (let i = 0; i < COUNT; i++) {
      let v;
      if (i < COUNT * 0.45) {
        // Milky Way band: gaussian spread around a great circle.
        const ang = rand() * Math.PI * 2;
        const spread = gaussian(rand) * 0.16;
        v = tangentA.clone().multiplyScalar(Math.cos(ang))
          .add(tangentB.clone().multiplyScalar(Math.sin(ang)))
          .add(milkyWayNormal.clone().multiplyScalar(spread))
          .normalize();
      } else {
        v = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
      }
      pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;

      const mag = Math.pow(rand(), 2.2);
      const warm = rand();
      const b = 0.25 + mag * 0.75;
      col[i * 3] = b * (warm > 0.7 ? 1 : 0.85 + warm * 0.15);
      col[i * 3 + 1] = b * 0.92;
      col[i * 3 + 2] = b * (warm > 0.7 ? 0.8 : 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.80, depthWrite: false, // 0.95 → 0.80 (v10.0.3, backdrop dim)
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  // -- Primary body -------------------------------------------------------------

  _buildPrimary() {
    const p = this.system.primary;
    const rEq = p.radiusKm * K;
    const rPol = (p.features?.equatorialBulge ? p.polarRadiusKm : p.radiusKm) * K;

    const geo = new THREE.SphereGeometry(1, 128, 96);
    // Subtle warm specular: ammonia ice crystals in the upper atmosphere
    // catch sunlight — a soft highlight, never plastic.
    const mat = new THREE.MeshPhongMaterial({
      map: this.texLoader.load(this.texUrl(p.slug, p.textures.diffuse)),
      shininess: 8,
      specular: new THREE.Color(0x332211),
    });
    this._prepSurfaceTexture(mat.map);
    if (p.textures.normal) {
      mat.normalMap = this._prepSurfaceTexture(
        this.texLoader.load(this.texUrl(p.slug, p.textures.normal)));
      const ns = p.normalScale ?? 1;
      mat.normalScale = new THREE.Vector2(ns, ns);
    }

    this.primaryMesh = new THREE.Mesh(geo, mat);
    this.primaryMesh.scale.set(rEq, rPol, rEq);
    this.primaryMesh.renderOrder = 0; // opaque planet draws before the rings
    this.primaryMesh.name = p.name;
    this.root.add(this.primaryMesh);
    this.pickables.push(this._makePicker(p.name, this.primaryMesh, rEq));

    if (p.detail) this._registerDetail(p.name, this.primaryMesh, mat, p.detail, rEq, p.normalScale, p.shaderParams);

    // Progressive high-res swap (outside the loading manager on purpose —
    // the app starts on the low-res map and upgrades silently).
    if (this.quality.highResPrimary && p.textures.diffuseHigh) {
      new THREE.TextureLoader().load(this.texUrl(p.slug, p.textures.diffuseHigh), (tex) => {
        this._prepSurfaceTexture(tex);
        mat.map?.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
        // The high-res map may have a different longitude origin — retarget
        // any UV-anchored detail features (e.g. the Great Red Spot).
        const entry = this.detailEntries.find((e) => e.name === p.name);
        if (entry?.uniforms.uGrsUV && p.detail?.params?.grsUVHigh) {
          entry.uniforms.uGrsUV.value.set(...p.detail.params.grsUVHigh);
        }
      });
    }

    if (p.features?.atmosphericGlow) {
      // Atmospheric limb scattering (4b) — replaces the old solid halo
      // sphere. Thin feathered haze, lit-side only, terminator-boosted.
      const atm = p.atmosphere;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        atm.style === 'rayleigh' ? makeRayleighMaterial(atm)
          : atm.style === 'dust' ? makeDustMaterial(atm)
          : atm.style === 'saturn' ? makeShellAtmosphereMaterial(SATURN_ATMOSPHERE_GLSL, atm)
          : atm.style === 'plutohaze' ? makeShellAtmosphereMaterial(PLUTO_ATMOSPHERE_GLSL, atm)
          : makeLimbScatterMaterial(atm)
      );
      const s = 1 + (atm.thickness || 0.025);
      glow.scale.set(rEq * s, rPol * s, rEq * s);
      this.root.add(glow);
      this.atmosphereMesh = glow;
    }

    this.bodyMeshes.set(p.name, {
      cfg: p, mesh: this.primaryMesh, group: this.primaryMesh,
      radiusUnits: rEq, isPrimary: true,
    });
  }

  // -- Star primary (V9) ----------------------------------------------------------

  /** Lighting for a star system: the body is self-luminous (every sun
   *  material is an emissive raw shader that ignores scene lights), so no
   *  directional sun, no planet-shine, no sprite/lens flare. sunDir is kept
   *  in sync with physics for engine parity but drives nothing visual. */
  _buildSunLights() {
    const star = this.system.star;
    this.sunDir = new THREE.Vector3(...star.direction).normalize();
    const amb = this.system.nightAmbient;
    this.scene.add(new THREE.AmbientLight(
      typeof amb === 'object' ? amb.color : 0x223344,
      (typeof amb === 'object' ? amb.intensity : amb) ?? 0.06));
  }

  /** Photosphere + chromosphere + corona at true scale (radiusKm, house
   *  convention — the log depth buffer handles the 696-unit sphere and the
   *  5,568-unit corona shell without precision issues). */
  _buildSunPrimary() {
    const p = this.system.primary;
    const R = p.radiusKm * K;

    // Shared per-frame uniforms — one write updates every sun material.
    this.sunActivity = this._storedSunActivity();
    this.sunShared = {
      uTime: { value: 0 },
      uDays: { value: 0 },
      uActivity: { value: this.sunActivity },
      uCamPos: { value: new THREE.Vector3() },
    };

    // Photosphere: opaque self-luminous surface. simplex + the sunspot
    // library are prepended to the fragment stage (see the .glsl contracts).
    const ph = p.photosphere || {};
    const photoMat = makeSunShaderMaterial(SUN_PHOTOSPHERE_GLSL, {
      ...this.sunShared,
      uGranScale: { value: ph.granulationScale ?? 28.0 },
      uLimbCoeff: { value: ph.limbDarkeningCoeff ?? 0.6 },
      uSuperAmp: { value: ph.supergranulationAmp ?? 0.08 },
      uSpotPos: { value: Array.from({ length: 12 }, () => new THREE.Vector2()) },
      uSpotRad: { value: new Array(12).fill(0) },
      uSpotAge: { value: new Array(12).fill(0) },
      uSpotCount: { value: 0 },
    }, { fragmentPrelude: SIMPLEX_GLSL + '\n' + SUN_SPOTS_GLSL });
    this.primaryMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), photoMat);
    this.primaryMesh.scale.setScalar(R);
    this.primaryMesh.renderOrder = 0;
    this.primaryMesh.name = p.name;
    this.root.add(this.primaryMesh);
    this.pickables.push(this._makePicker(p.name, this.primaryMesh, R));

    // Chromosphere: thin H-alpha rim shell. BackSide + depth test keeps it
    // outside the disc silhouette (the far hemisphere is disc-occluded).
    const ch = p.chromosphere || {};
    const chromoMat = makeSunShaderMaterial(SUN_CHROMOSPHERE_GLSL, {
      ...this.sunShared,
      uColor: { value: new THREE.Color(...(ch.color || [0.95, 0.15, 0.20])) },
      uIntensity: { value: ch.intensity ?? 0.6 },
    }, { shell: true, fragmentPrelude: SIMPLEX_GLSL });
    const chromoMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), chromoMat);
    chromoMesh.scale.setScalar(R * (ch.thickness ?? 1.005));
    chromoMesh.renderOrder = 1;
    this.root.add(chromoMesh);

    // Corona: large additive glow shell. Shading works on the view ray's
    // impact parameter (see sun-corona.glsl) — shell radius is cosmetic.
    const co = p.corona || {};
    const coronaMat = makeSunShaderMaterial(SUN_CORONA_GLSL, {
      ...this.sunShared,
      uSurfaceR: { value: R },
      uBaseOpacity: { value: co.baseOpacity ?? 0.4 },
      uActivityScale: { value: co.activityScale ?? 0.8 },
    }, { shell: true, fragmentPrelude: SIMPLEX_GLSL });
    const coronaMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), coronaMat);
    coronaMesh.scale.setScalar(R * (co.radius ?? 8.0));
    coronaMesh.renderOrder = 2;
    this.root.add(coronaMesh);

    this.sunMats = { photoMat, chromoMat, coronaMat };
    // Exposed for the diff-render test probes (house rule: halo visibility
    // is measured with-vs-without the shell, never by raw luminance).
    this.sunMeshes = { photo: this.primaryMesh, chromo: chromoMesh, corona: coronaMesh };
    this.bodyMeshes.set(p.name, {
      cfg: p, mesh: this.primaryMesh, group: this.primaryMesh,
      radiusUnits: R, isPrimary: true,
    });

    // Sunspot lifecycle state (3d): CPU-side — spots spawn in the activity
    // belt, drift with differential rotation, and decay over sim-days.
    this.sunspots = [];
    this._sunSimLast = null;
    this.solarFlares = [];
    this._buildProminences();
  }

  /** Prominences (3c): plasma loops at the limb — TubeGeometry arcs
   *  parented to the photosphere MESH (unit object space; the mesh's
   *  uniform scale and rotation carry them). MeshBasicMaterial is a
   *  built-in — it inherits log-depth support automatically. */
  _buildProminences() {
    const rand = mulberry32(20260712); // deterministic placement
    this.prominences = [];
    for (let i = 0; i < 4; i++) {
      const lat = (rand() - 0.5) * 1.1;          // within ±~31°
      const lon = rand() * Math.PI * 2;
      const span = 0.10 + rand() * 0.08;         // angular footprint (rad)
      const hFrac = 0.05 + rand() * 0.05;        // loop apex: 35k–70k km
      const azim = rand() * Math.PI * 2;         // footpoint azimuth
      const A = latLonDir(lat, lon);
      const t1 = new THREE.Vector3(0, 1, 0).cross(A).normalize();
      const t2 = A.clone().cross(t1);
      const step = t1.clone().multiplyScalar(Math.cos(azim))
        .add(t2.clone().multiplyScalar(Math.sin(azim)));
      const B = A.clone().addScaledVector(step, span).normalize();
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const dir = A.clone().lerp(B, t).normalize();
        pts.push(dir.multiplyScalar(1.0 + hFrac * Math.sin(t * Math.PI)));
      }
      const tubeR = 0.005 + rand() * 0.005; // 3.5k–7k km plasma rope
      // Calibration: 0.5-opacity bright red read as cartoon rings floating
      // off the limb — thinner, dimmer, deeper red reads as plasma.
      const mat = new THREE.MeshBasicMaterial({
        color: 0xc22808, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide,
      });
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, tubeR, 8, false),
        mat);
      tube.renderOrder = 1;
      this.primaryMesh.add(tube);
      this.prominences.push(tube);
    }
  }

  /** Sunspot lifecycle (3d) + flare triggers (3b). Sim-time driven: spots
   *  live 7–21 sim-days and drift with the same residual Snodgrass rate the
   *  photosphere granulation uses, so they stay pinned to their plasma.
   *  Spawn/retire visibility blends over ~1.5 wall-seconds so the activity
   *  slider feels immediate (a sim-day fade is invisible at 1×). */
  _updateSunspots(physics, dt) {
    const cfg = this.system.primary.sunspots || {};
    const simNow = physics.simSeconds;
    const dtSim = this._sunSimLast === null ? 0 : simNow - this._sunSimLast;
    this._sunSimLast = simNow;

    const maxCount = Math.min(cfg.maxCount ?? 12, 12);
    const target = Math.round(this.sunActivity * maxCount);
    const belt = ((cfg.activityBeltDeg ?? 30) * Math.PI) / 180;

    // Age + drift (differential-rotation residual, matches the shader).
    for (const s of this.sunspots) {
      s.age += dtSim;
      const s2 = Math.sin(s.lat) ** 2;
      const residDegPerDay = -(2.396 * s2 + 1.787 * s2 * s2);
      s.lon += (residDegPerDay * Math.PI / 180) * (dtSim / 86400);
      // Wall-clock spawn/retire blend.
      s.blend = THREE.MathUtils.clamp(s.blend + (s.dying ? -dt : dt) * 0.7, 0, 1);
    }
    // Natural death + slider-down retirement.
    this.sunspots = this.sunspots.filter((s) => !(s.blend <= 0 && (s.dying || s.age >= s.maxAge)));
    for (const s of this.sunspots) if (s.age >= s.maxAge) s.dying = true;
    const alive = this.sunspots.filter((s) => !s.dying);
    for (let i = alive.length - 1; i >= target; i--) alive[i].dying = true;
    // Spawn up to target (revive nothing — fresh spots only).
    while (this.sunspots.filter((s) => !s.dying).length < target
      && this.sunspots.length < 12) {
      this.sunspots.push({
        lat: (Math.random() * 2 - 1) * belt,
        lon: Math.random() * Math.PI * 2,
        radius: 0.02 + Math.random() * 0.04,   // angular radius (rad)
        age: 0,
        maxAge: (7 + Math.random() * 14) * 86400, // 7–21 sim-days
        blend: 0,
        dying: false,
      });
    }

    // Write the (frozen) uniform contract. Presented age folds the
    // wall-clock blend into the shader's fade-in/fade-out windows.
    const u = this.sunMats.photoMat.uniforms;
    const n = Math.min(this.sunspots.length, 12);
    for (let i = 0; i < n; i++) {
      const s = this.sunspots[i];
      u.uSpotPos.value[i].set(s.lat, s.lon);
      u.uSpotRad.value[i] = s.radius;
      const simAge = THREE.MathUtils.clamp(s.age / s.maxAge, 0, 1);
      u.uSpotAge.value[i] = s.dying
        ? Math.max(simAge, 1.0 - 0.25 * s.blend)   // retire: run out the fade window
        : Math.min(Math.max(simAge, 0.15 * s.blend), 0.75); // spawn: fade in, hold visible
    }
    u.uSpotCount.value = n;

    this._updateSolarFlares(dt);
  }

  /** Solar flares (3b): brief particle arcs erupting from active sunspots.
   *  Wall-clock lifetime (a flare is an "event", not a physics body) with a
   *  mild boost at high time multipliers. PointsMaterial is a built-in —
   *  log-depth safe. Parented to the photosphere mesh in unit object space
   *  so arcs ride the rotation. */
  _updateSolarFlares(dt) {
    // Advance + cull live flares.
    for (const f of this.solarFlares) {
      f.life += dt;
      const t = f.life / f.duration;
      if (t >= 1) {
        this.primaryMesh.remove(f.points);
        f.points.geometry.dispose();
        f.points.material.dispose();
        f.done = true;
        continue;
      }
      // Particles sweep along the arc; brightness spikes then decays.
      const arr = f.points.geometry.attributes.position.array;
      for (let i = 0; i < f.count; i++) {
        const pt = (f.seeds[i] * 0.4 + t * 0.8) % 1;
        const k = Math.min(f.arc.length - 1, Math.floor(pt * (f.arc.length - 1)));
        const p = f.arc[k];
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      f.points.geometry.attributes.position.needsUpdate = true;
      f.points.material.opacity = 0.9 * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8);
    }
    this.solarFlares = this.solarFlares.filter((f) => !f.done);

    // Trigger: per active spot per second, scaled by activity and (mildly)
    // by time multiplier. At 100% activity with 12 spots ≈ one flare every
    // ~30 wall-seconds at 1×.
    const mult = this.system.isStar ? (this._lastMult ?? 1) : 1;
    const boost = Math.min(3, 1 + Math.log10(Math.max(1, mult)));
    const live = this.sunspots.filter((s) => !s.dying && s.blend > 0.5);
    const p = live.length * this.sunActivity * 0.0025 * boost * dt;
    if (live.length && Math.random() < p && this.solarFlares.length < 4) {
      const s = live[Math.floor(Math.random() * live.length)];
      this._spawnFlare(s);
    }
  }

  _spawnFlare(spot) {
    const A = latLonDir(spot.lat, spot.lon);
    const azim = Math.random() * Math.PI * 2;
    const t1 = new THREE.Vector3(0, 1, 0).cross(A).normalize();
    const t2 = A.clone().cross(t1);
    const step = t1.multiplyScalar(Math.cos(azim)).add(t2.multiplyScalar(Math.sin(azim)));
    const span = spot.radius * (2.5 + Math.random() * 2);
    const B = A.clone().addScaledVector(step, span).normalize();
    const hFrac = 0.04 + Math.random() * 0.10; // apex 28k–97k km
    const arc = [];
    for (let k = 0; k <= 32; k++) {
      const t = k / 32;
      arc.push(A.clone().lerp(B, t).normalize()
        .multiplyScalar(1.002 + hFrac * Math.sin(t * Math.PI)));
    }
    const count = 80;
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: makeFlareTexture(64, 'rgba(255,255,180,1)'),
      color: 0xffffaa, size: 6, // world units (unaffected by parent scale)
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.primaryMesh.add(points);
    this.solarFlares.push({
      points, arc, seeds, count, life: 0,
      duration: 4 + Math.random() * 5, // wall seconds
    });
  }

  _storedSunActivity() {
    const def = this.system.primary.sunspots?.defaultActivity ?? 0.75;
    const stored = parseFloat(localStorage.getItem('sse-sun-activity'));
    return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : def;
  }

  /** Live solar-activity level (VIEW slider) — one shared uniform. */
  setSunActivity(v) {
    this.sunActivity = v;
    if (this.sunShared) this.sunShared.uActivity.value = v;
  }

  // -- Rings ---------------------------------------------------------------------

  _buildRings() {
    this.ringMeshes = [];
    // Planet shadow inputs (2a): sun direction in world space and the
    // primary's radius — ring segments inside the shadow cylinder go dark,
    // so the lit band no longer "cuts across" the night-side disc.
    const sunWorld = new THREE.Vector3()
      .copy(this.sunDir).applyQuaternion(this.root.quaternion).normalize();
    const planetR = this.system.primary.radiusKm * K;

    // Textured ring system (V7 Saturn): ONE disc spanning the whole ring
    // family, color/opacity from a Cassini-derived radial strip, with the
    // shader's procedural fallback if the texture fails to load.
    const rs = this.system.ringSystem;
    if (rs) {
      const inner = rs.innerKm * K, outer = rs.outerKm * K;
      const mat = makeTexturedRingMaterial(inner, outer, sunWorld, planetR);
      // Texture flag flips on only when the strip actually arrives.
      new THREE.TextureLoader().load(this.texUrl(this.system.primary.slug,
        rs.texture.split('/')[1]), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        mat.uniforms.uRingTex.value = tex;
        mat.uniforms.uHasTex.value = 1;
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256, 8), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = 'Ring System';
      mesh.renderOrder = 1; // after the planet, no depth writes
      this.root.add(mesh);
      this.ringMeshes.push(mesh);
    }
    for (const ring of this.system.rings || []) {
      const inner = ring.innerKm * K, outer = ring.outerKm * K;
      let mesh;
      if (ring.type === 'torus') {
        const mid = (inner + outer) / 2;
        const tube = (outer - inner) / 2;
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(mid, tube, 24, 128),
          makeHaloMaterial(new THREE.Color(ring.color), ring.opacity, sunWorld, planetR)
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.scale.z = (ring.thicknessKm * K) / tube; // squash torus vertically
      } else {
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(inner, outer, 192, 4),
          makeRingMaterial(new THREE.Color(ring.color), ring.opacity, inner, outer, sunWorld, planetR)
        );
        mesh.rotation.x = -Math.PI / 2;
      }
      mesh.name = ring.name;
      mesh.renderOrder = 1; // after the planet (renderOrder 0), no depth writes
      this.root.add(mesh);
      this.ringMeshes.push(mesh);
    }
  }

  // -- Moons -----------------------------------------------------------------------

  _buildBodies() {
    for (const cfg of this.system.bodies) {
      // Irregular bodies carry explicit half-dimensions (km) in cfg.radii;
      // the X half-dimension is the reference radius, Y/Z become mesh scale.
      const r = Math.max((cfg.radii?.x ?? cfg.radiusKm) * K, 0.02);
      const group = new THREE.Group();
      group.name = cfg.name;

      // Untextured inner moons need explicit segments (cfg.geometrySegments):
      // at their zoom floors the default 24x12 sphere shows visible facets.
      const detail = cfg.geometrySegments ?? (cfg.textures ? 96 : 24);
      const heightSegs = cfg.geometrySegments ?? detail / 2;
      const matOpts = { shininess: 6, specular: new THREE.Color(0x0a0a0a) };
      if (cfg.textures?.diffuse) {
        matOpts.map = this._prepSurfaceTexture(
          this.texLoader.load(this.texUrl(cfg.slug, cfg.textures.diffuse)));
      } else {
        matOpts.color = new THREE.Color(cfg.color || 0x888888);
        // Detail styles read vMapUv, which three only compiles when a map
        // exists — give untextured detail bodies a 1px white map so the
        // varying exists and cfg.color still tints (V6: Phobos/Deimos are
        // the first color-only bodies with a detail style).
        if (cfg.detail) {
          const white = new THREE.DataTexture(
            new Uint8Array([255, 255, 255, 255]), 1, 1);
          white.colorSpace = THREE.SRGBColorSpace;
          white.needsUpdate = true;
          matOpts.map = white;
        }
      }
      const mat = new THREE.MeshPhongMaterial(matOpts);
      if (cfg.textures?.normal) {
        mat.normalMap = this._prepSurfaceTexture(
          this.texLoader.load(this.texUrl(cfg.slug, cfg.textures.normal)));
        const ns = cfg.normalScale ?? 1;
        mat.normalScale = new THREE.Vector2(ns, ns);
      }
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, detail, heightSegs), mat);
      if (cfg.radii) mesh.scale.set(1, cfg.radii.y / cfg.radii.x, cfg.radii.z / cfg.radii.x);
      group.add(mesh);

      const entry = {
        cfg, group, mesh, mat, radiusUnits: r,
        baseColor: (matOpts.color || new THREE.Color(0xffffff)).clone
          ? new THREE.Color(matOpts.map ? 0xffffff : cfg.color || 0x888888)
          : new THREE.Color(0xffffff),
        plumes: [],
      };

      // Feature-flag driven extras — config decides, engine renders.
      if (cfg.features?.subsurfaceGlow) {
        mat.emissive = new THREE.Color(0x0e2a3e);
        mat.emissiveIntensity = 0.35;
      }
      // Directional atmospheric limb glow (v4b, bug #13): thin exospheres
      // respond to the sun direction — lit side only, feathered, no ring.
      // Same scattering shader as Jupiter's limb, much thinner and fainter.
      if (cfg.atmosphereLimb) {
        const al = cfg.atmosphereLimb;
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(r * (1 + (al.thickness ?? 0.008)), 48, 32),
          makeLimbScatterMaterial({
            limbEdge: al.color, limbMid: al.color, intensity: al.intensity ?? 0.3,
            // Thin-exosphere class (post-v7 hardware fix): sharp fresnel,
            // tight night cutoff — a trace atmosphere is a sliver on the
            // lit limb, never a ring.
            fresnelPower: al.fresnelPower ?? 6.0,
            lit0: -0.05, lit1: 0.20,
          })
        );
        shell.material.userData.worldUniforms = true;
        group.add(shell);
      }
      // Opaque haze shell (V7 Titan): a whole-atmosphere shell that hides
      // the surface. NORMAL blending — additive glow cannot make an opaque
      // disc. Altitude-aware (the fill thins below 1,000 km).
      if (cfg.atmosphere?.style === 'titan') {
        const shellMat = makeShellAtmosphereMaterial(TITAN_GLSL, cfg.atmosphere);
        shellMat.blending = THREE.NormalBlending;
        // FrontSide, unlike the limb-glow shells: a BackSide shell's far
        // hemisphere is depth-occluded by the moon itself, so the disc
        // fill never renders (measured: orange donut around a bare
        // surface). The NEAR hemisphere sits in front of the moon and
        // composites the opaque haze over the whole disc.
        shellMat.side = THREE.FrontSide;
        shellMat.userData.worldUniforms = true;
        shellMat.userData.altitudeBody = cfg.name; // per-frame uAltitude source
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(r * (1 + (cfg.atmosphere.thickness ?? 0.06)), 64, 48),
          shellMat);
        shell.renderOrder = 1; // after the opaque moon beneath
        group.add(shell);
      }
      if (cfg.features?.volcanicPlumes && cfg.features.volcanoes) {
        for (const v of cfg.features.volcanoes) {
          const plume = makeVolcanicPlume(r, v, this.quality.tier);
          // Parent to the mesh, not the group: tidal-lock rotation is applied
          // to mesh.rotation.y, so only mesh children stay pinned to the surface.
          mesh.add(plume.points);
          mesh.add(plume.hotspot);
          entry.plumes.push(plume);
        }
      }
      // Geysers (V7 Enceladus): the Io plume system — including its
      // parent-to-the-mesh fix — retinted as tall white ice jets.
      if (cfg.geysers?.enabled && cfg.geysers.locations) {
        const hFrac = (cfg.geysers.heightKm ?? 500) / (cfg.radiusKm || 250);
        // Plume tint is config-overridable (V8): Enceladus keeps the white
        // ice defaults; Triton's nitrogen geysers entrain dark dust.
        const gt = cfg.geysers.tint || {};
        for (const g of cfg.geysers.locations) {
          const plume = makeVolcanicPlume(r, g, this.quality.tier, {
            spriteColor: gt.spriteColor ?? 'rgba(240,250,255,1)',
            pointColor: gt.pointColor ?? 0xeef6ff,
            hotspotSprite: gt.hotspotSprite ?? 'rgba(200,230,255,1)',
            hotspotColor: gt.hotspotColor ?? 0xbbddff,
            heightFrac: hFrac, spreadFrac: gt.spreadFrac ?? 0.35,
            opacity: gt.opacity ?? 0.45, hotspotScale: 0.05,
          });
          mesh.add(plume.points);
          mesh.add(plume.hotspot);
          entry.plumes.push(plume);
        }
      }
      // Named surface features: billboard labels riding the rotating mesh,
      // faded in below ~500 km altitude.
      if (cfg.surfaceFeatures?.length) {
        entry.featureSprites = [];
        for (const f of cfg.surfaceFeatures) {
          const sprite = makeTextSprite(f.name);
          const lat = THREE.MathUtils.degToRad(f.latDeg);
          const lon = THREE.MathUtils.degToRad(f.lonDeg);
          sprite.position.set(
            Math.cos(lat) * Math.cos(lon),
            Math.sin(lat),
            -Math.cos(lat) * Math.sin(lon)
          ).multiplyScalar(r * 1.03);
          sprite.scale.set(r * 0.26, r * 0.065, 1);
          sprite.material.opacity = 0;
          sprite.visible = false;
          mesh.add(sprite); // rides the tidally-locked rotation
          entry.featureSprites.push(sprite);
        }
      }

      // Apollo landing sites (V5 3c): bright markers + labels parented to
      // the MESH so they ride the tidal-lock rotation; labels below 50 km.
      if (cfg.apolloSites?.length) {
        entry.apolloSprites = [];
        for (const site of cfg.apolloSites) {
          const lat = THREE.MathUtils.degToRad(site.latDeg);
          const lon = THREE.MathUtils.degToRad(site.lonDeg);
          const dir = new THREE.Vector3(
            Math.cos(lat) * Math.cos(lon),
            Math.sin(lat),
            -Math.cos(lat) * Math.sin(lon)
          );
          const dot = new THREE.Sprite(new THREE.SpriteMaterial({
            map: makeFlareTexture(32, 'rgba(255,255,255,1)'),
            color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          dot.position.copy(dir).multiplyScalar(r * 1.002);
          dot.scale.setScalar(r * 0.01);
          const label = makeTextSprite(`${site.name} ↓`);
          label.position.copy(dir).multiplyScalar(r * 1.03);
          label.scale.set(r * 0.18, r * 0.045, 1);
          label.material.opacity = 0;
          label.visible = false;
          mesh.add(dot);
          mesh.add(label);
          entry.apolloSprites.push(label);
        }
      }

      if (cfg.detail) this._registerDetail(cfg.name, group, mat, cfg.detail, r, cfg.normalScale, cfg.shaderParams);

      this.root.add(group);
      this.bodyMeshes.set(cfg.name, entry);
      this.pickables.push(this._makePicker(cfg.name, group, r));
    }
  }

  _registerDetail(name, anchor, material, detail, radiusUnits, normalScale, shaderParams) {
    // shaderParams (V7 1b): per-body terminator/graze fade bands for the
    // unified surface convention — see glsl/surface-base.glsl.
    const uniforms = applyDetailShader(material, detail.style, detail.params, this.quality, shaderParams);
    if (!uniforms) return;
    if (normalScale != null) uniforms.uNormalScale.value = normalScale;
    this.detailEntries.push({ name, anchor, uniforms, detail, radiusUnits, blend: 0 });
  }

  /** Current procedural-detail blend (0..1) for a body — for the UI indicator. */
  getDetailBlend(name) {
    return this.detailEntries.find((e) => e.name === name)?.blend ?? 0;
  }

  _updateDetailShaders(physics) {
    const t = physics.simSeconds % 1e6; // keep float32-precision-friendly
    const v = this._tmpV ??= new THREE.Vector3();
    const q = this._tmpQ ??= new THREE.Quaternion();
    const sunWorld = (this._tmpSun ??= new THREE.Vector3())
      .copy(this.sunDir).applyQuaternion(this.root.quaternion);
    for (const e of this.detailEntries) {
      const altKm = (e.anchor.getWorldPosition(v).distanceTo(this.camera.position) - e.radiusUnits) * KM_PER_UNIT;
      e.blend = detailBlend(altKm, e.detail.activationKm, e.detail.fullKm);
      e.uniforms.uTime.value = t;
      e.uniforms.uAltitude.value = altKm;
      e.uniforms.uDetailBlend.value = e.blend;
      // Object-space sun + camera (V5): terminator-relative effects rotate
      // with the mesh exactly like vObjPos does.
      if (e.blend > 0 && e.uniforms.uSunObj) {
        const mesh = this.bodyMeshes.get(e.name)?.mesh;
        if (mesh) {
          mesh.getWorldQuaternion(q).invert();
          e.uniforms.uSunObj.value.copy(sunWorld).applyQuaternion(q).normalize();
          e.uniforms.uCamObj.value.copy(mesh.worldToLocal(this.camera.position.clone()));
        }
      }
      // Hardware-calibration aid (v5a): log each detail shader as it fades
      // in/out so tuning sessions can correlate what's on screen with the
      // live uniform values. Dev builds only — stripped from production.
      if (import.meta.env.DEV) {
        const on = e.blend > 0.001;
        if (on !== (e._logOn ?? false)) {
          e._logOn = on;
          console.info(
            `[detail] ${e.name} ${on ? 'ACTIVE' : 'off'} — alt ${Math.round(altKm).toLocaleString()} km, ` +
            `blend ${e.blend.toFixed(2)} (activation ${e.detail.activationKm.toLocaleString()} km, ` +
            `full ${e.detail.fullKm.toLocaleString()} km). __sse.renderer.logShaderState() for a snapshot.`);
        }
      }
    }
  }

  /**
   * Dev-mode calibration snapshot (v5a): dumps every detail entry's live
   * uniforms plus where the tuning knobs live. Call from the console:
   *   __sse.renderer.logShaderState()
   */
  logShaderState() {
    if (!import.meta.env.DEV) return;
    console.table(this.detailEntries.map((e) => ({
      body: e.name,
      style: e.detail.style,
      blend: +e.blend.toFixed(3),
      altKm: Math.round(e.uniforms.uAltitude.value),
      sunObj: e.uniforms.uSunObj
        ? [...'xyz'].map((k) => e.uniforms.uSunObj.value[k].toFixed(2)).join(', ')
        : '—',
      normalScale: this.bodyMeshes.get(e.name)?.mesh?.material.normalScale?.x ?? '—',
    })));
    console.info(
      'Tuning knobs — clouds: zone coverage weights + threshold in earth-clouds.glsl LAYER 1; ' +
      'city lights: region weights in el_population() + final 0.4 gain in earth-lights.glsl; ' +
      'moon relief: crater amplitudes in moon-detail.glsl LAYER 3; ' +
      'relief depth: normalScale per body in the system config.');
  }

  _makePicker(name, parent, radiusUnits) {
    // Invisible, generously sized sphere so small moons are clickable.
    const picker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(radiusUnits * 1.4, 2.5), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    picker.name = `picker:${name}`;
    picker.userData.bodyName = name;
    parent.add(picker);
    return picker;
  }

  // -- Orbit lines, decals, resonance ------------------------------------------------

  _buildOrbitLines() {
    this.orbitLines = new THREE.Group();
    for (const cfg of this.system.bodies) {
      const a = cfg.semiMajorAxisKm * K;
      // Inclined orbits (V7): same +X node-line rotation as physics.
      const inc = ((cfg.inclinationDeg || 0) * Math.PI) / 180;
      const cosI = Math.cos(inc), sinI = Math.sin(inc);
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const t = (i / 180) * Math.PI * 2;
        const z = -a * Math.sin(t);
        pts.push(new THREE.Vector3(a * Math.cos(t), -z * sinI, z * cosI));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x66b2ff, transparent: true, opacity: 0.28 })
      );
      this.orbitLines.add(line);
    }
    this.orbitLines.visible = false;
    this.root.add(this.orbitLines);
  }

  _buildTransitDecal() {
    this.transitDecals = new Map();
    for (const cfg of this.system.bodies) {
      if (cfg.radiusKm < 500) continue;
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(cfg.radiusKm * K * 1.05, 32),
        new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0.75,
          depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        })
      );
      decal.visible = false;
      decal.renderOrder = 3;
      this.root.add(decal);
      this.transitDecals.set(cfg.name, decal);
    }
  }

  _buildResonanceLines() {
    // 1:2:4 Laplace resonance visualizer (3e): connecting lines between the
    // three resonant moons. Each line pulses Primary Blue when its pair
    // approaches conjunction (< 15°); the UI reads resonanceInfo for the
    // "Resonance: N% aligned" HUD readout.
    this.resonance = new THREE.Group();
    this.resonanceTargets = this.system.bodies.filter((b) => b.physics === 'nbody').slice(0, 3);
    this.resonancePairs = [[0, 1], [1, 2], [0, 2]];
    this.resonanceLines = this.resonancePairs.map(() => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x66b2ff, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.resonance.add(line);
      return line;
    });
    this.resonanceInfo = { pct: 0, aligned: false };
    this.resonance.visible = false;
    this.root.add(this.resonance);
  }

  // -- Per-frame sync -------------------------------------------------------------------

  /** Sync scene graph to physics state. */
  update(physics, dt, elapsed) {
    // Catch missed/late resize events (mobile rotation, devtools, fullscreen):
    // a stale aspect ratio renders every sphere as an oval.
    const aspect = window.innerWidth / window.innerHeight;
    if (Math.abs(this.camera.aspect - aspect) > 0.001) this.onResize();

    this._syncSunDirection(physics);

    const p = this.system.primary;
    this.primaryMesh.rotation.y = physics.primaryRotation;
    this._updateDetailShaders(physics);

    // Sun materials (V9): shared uniforms across photosphere/chromosphere/
    // corona. uTime wraps at 1e6 (house rule — drifts must loop); uDays is
    // unwrapped for slow secular drifts (differential rotation).
    if (this.sunShared) {
      this.sunShared.uTime.value = physics.simSeconds % 1e6;
      this.sunShared.uDays.value = physics.simSeconds / 86400;
      this.sunShared.uCamPos.value.copy(this.camera.position);
      this._lastMult = physics.timeMultiplier;
      this._updateSunspots(physics, dt);
    }

    for (const b of physics.bodies) {
      const entry = this.bodyMeshes.get(b.name);
      if (!entry || entry.isPrimary) continue;
      entry.group.position.set(b.pos.x * K, b.pos.y * K, b.pos.z * K);

      // Tidal lock: keep the same face toward the primary.
      if (b.cfg.tidallyLocked) {
        entry.mesh.rotation.y = Math.atan2(-b.pos.z, b.pos.x) + Math.PI;
      } else if (b.cfg.chaoticRotation) {
        // Hyperion (V7 3d): deterministic tumble — three incommensurate
        // sim-time frequencies, so the tumbling scales with the time
        // multiplier, freezes on pause, and replays after date jumps.
        const s = physics.simSeconds;
        entry.mesh.rotation.set(
          Math.sin(s * 1.7e-4) * 1.2 + s * 3.1e-5,
          s * 7.7e-5 + Math.cos(s * 1.1e-4) * 0.8,
          Math.sin(s * 0.9e-4 + 1.3) * 0.9);
      } else if (b.cfg.rotationPeriodHours) {
        // Non-locked moons with a measured spin (V7: Phoebe, 9.27 h).
        entry.mesh.rotation.y =
          (Math.PI * 2) * (physics.simSeconds / (b.cfg.rotationPeriodHours * 3600));
      }

      // Eclipse darkening — dramatic but smooth.
      const f = b.eclipseFactor;
      const litScale = 1 - 0.94 * f;
      entry.mat.color.setRGB(
        entry.baseColor.r * litScale,
        entry.baseColor.g * litScale,
        entry.baseColor.b * litScale
      );

      // Transit shadow dot on the primary's cloud tops.
      const decal = this.transitDecals?.get(b.name);
      if (decal) {
        if (b.inTransit && b.transitPoint) {
          const tp = new THREE.Vector3(b.transitPoint.x * K, b.transitPoint.y * K, b.transitPoint.z * K);
          decal.position.copy(tp).multiplyScalar(1.012);
          decal.lookAt(tp.clone().multiplyScalar(2));
          decal.visible = true;
        } else {
          decal.visible = false;
        }
      }

      for (const plume of entry.plumes) plume.update(dt, elapsed);

      // Altitude-driven detail: surface feature labels (<~500 km) and
      // Apollo site labels (<~50 km).
      if (entry.featureSprites || entry.apolloSprites) {
        const altKm = (entry.group.getWorldPosition(this._tmpV ??= new THREE.Vector3())
          .distanceTo(this.camera.position) - entry.radiusUnits) * KM_PER_UNIT;
        if (entry.featureSprites) {
          const op = THREE.MathUtils.clamp((800 - altKm) / 300, 0, 1);
          for (const s of entry.featureSprites) {
            s.material.opacity = op;
            s.visible = op > 0.02;
          }
        }
        if (entry.apolloSprites) {
          const op = THREE.MathUtils.clamp((70 - altKm) / 20, 0, 1);
          for (const s of entry.apolloSprites) {
            s.material.opacity = op;
            s.visible = op > 0.02;
          }
        }
      }
    }

    // Ring shader uniforms. Jupiter's per-band materials take root-local
    // camera + equatorial sun; the V7 textured ring disc works in world
    // space (userData.worldUniforms) and has no uSunDir.
    const camLocal = this.root.worldToLocal(this.camera.position.clone());
    for (const mesh of this.ringMeshes) {
      const u = mesh.material.uniforms;
      if (!u?.uCamPos) continue;
      if (mesh.material.userData.worldUniforms) {
        u.uCamPos.value.copy(this.camera.position);
        if (u.uTime) u.uTime.value = physics.simSeconds % 1e6;
      } else {
        u.uCamPos.value.copy(camLocal);
        u.uSunDir.value.copy(this.sunDir);
      }
    }

    if (this.atmosphereMesh) {
      // Limb/Rayleigh shaders work in world space (varyings from modelMatrix).
      const u = this.atmosphereMesh.material.uniforms;
      u.uCamPos.value.copy(this.camera.position);
      const sw = this.sunDir.clone().applyQuaternion(this.root.quaternion);
      if (u.uSunDir) u.uSunDir.value.copy(sw);
      if (u.uSunW) u.uSunW.value.copy(sw);
      if (u.uAltitude) {
        u.uAltitude.value = (this.camera.position
          .distanceTo(this.primaryMesh.getWorldPosition(this._tmpV ??= new THREE.Vector3()))
          - this.bodyRadius(this.system.primary.name)) * KM_PER_UNIT;
      }
    }
    for (const [, entry] of this.bodyMeshes) {
      for (const child of entry.group?.children || []) {
        const u = child.material?.uniforms;
        if (!u?.uCamPos) continue;
        if (child.material.userData.worldUniforms) {
          // Shells with world-space varyings (modelMatrix): limb-scatter
          // exospheres (uSunDir) and the V7 Titan haze (uSunW + uAltitude).
          u.uCamPos.value.copy(this.camera.position);
          const sw = (this._tmpSw ??= new THREE.Vector3())
            .copy(this.sunDir).applyQuaternion(this.root.quaternion);
          if (u.uSunDir) u.uSunDir.value.copy(sw);
          if (u.uSunW) u.uSunW.value.copy(sw);
          if (u.uAltitude && child.material.userData.altitudeBody) {
            u.uAltitude.value = (entry.group.getWorldPosition(this._tmpV ??= new THREE.Vector3())
              .distanceTo(this.camera.position) - entry.radiusUnits) * KM_PER_UNIT;
          }
        } else {
          u.uCamPos.value.copy(entry.group.worldToLocal(this.camera.position.clone()));
          u.uSunDir.value.copy(this.sunDir);
        }
      }
    }

    // Resonance visualizer: line endpoints track the moons; pairs within
    // 15° of conjunction pulse in Primary Blue.
    if (this.resonance.visible && this.resonanceTargets.length >= 3) {
      const moons = this.resonanceTargets.map((cfg) => physics.getBody(cfg.name));
      const theta = moons.map((b) => Math.atan2(-b.pos.z, b.pos.x));
      const sep = (i, j) => {
        const d = theta[i] - theta[j];
        return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
      };
      // Alignment across the two resonant pairs (Io–Europa, Europa–Ganymede).
      const a = sep(0, 1), b = sep(1, 2);
      this.resonanceInfo.pct = Math.max(0, Math.round(100 * (1 - (a + b) / (2 * Math.PI))));
      this.resonanceInfo.aligned = a < 0.2618 && b < 0.2618; // both < 15°
      this.resonancePairs.forEach(([i, j], k) => {
        const line = this.resonanceLines[k];
        const pa = line.geometry.attributes.position;
        pa.setXYZ(0, moons[i].pos.x * K, moons[i].pos.y * K, moons[i].pos.z * K);
        pa.setXYZ(1, moons[j].pos.x * K, moons[j].pos.y * K, moons[j].pos.z * K);
        pa.needsUpdate = true;
        const pairAligned = sep(i, j) < 0.2618;
        line.material.color.setHex(pairAligned ? 0x0077cc : 0x66b2ff);
        line.material.opacity = pairAligned
          ? 0.65 + 0.3 * Math.sin(elapsed * 6.0) // conjunction pulse
          : 0.25;
      });
    }
  }

  /** Ephemeris (V5): follow physics.sunDir when the date moves the sun —
   *  light, sun sprite, lens flare and the ring-shadow uniforms all track. */
  _syncSunDirection(physics) {
    // Star systems have no external sun to track (no sunLight/sunAnchor).
    if (this.system.isStar) return;
    const d = physics.sunDir;
    if (Math.abs(d.x - this.sunDir.x) < 1e-5
      && Math.abs(d.y - this.sunDir.y) < 1e-5
      && Math.abs(d.z - this.sunDir.z) < 1e-5) return;
    this.sunDir.set(d.x, d.y, d.z);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(1000);
    const sunDist = this.system.star.distanceAU * AU_KM * K;
    this.sunAnchor.position.copy(this.sunDir).multiplyScalar(sunDist);
    this.flareLight.position.copy(this.sunAnchor.position);
    const sunWorld = this.sunDir.clone().applyQuaternion(this.root.quaternion);
    for (const mesh of this.ringMeshes) {
      mesh.material.uniforms.uSunW?.value.copy(sunWorld);
    }
  }

  /** World-space position of a body (scene units). */
  bodyWorldPos(name, out = new THREE.Vector3()) {
    const entry = this.bodyMeshes.get(name);
    if (!entry) return out.set(0, 0, 0);
    return entry.group.getWorldPosition(out);
  }

  bodyRadius(name) {
    return this.bodyMeshes.get(name)?.radiusUnits ?? 1;
  }

  /** Nearest body and altitude above its surface, in km. */
  nearestAltitudeKm(pos) {
    let best = null;
    const v = new THREE.Vector3();
    for (const [name, entry] of this.bodyMeshes) {
      const altKm = (entry.group.getWorldPosition(v).distanceTo(pos) - entry.radiusUnits) * KM_PER_UNIT;
      if (!best || altKm < best.altKm) best = { name, altKm };
    }
    return best;
  }

  setOrbitLinesVisible(v) { this.orbitLines.visible = v; }
  setRingsVisible(v) { this.ringMeshes.forEach((m) => (m.visible = v)); }
  setResonanceVisible(v) { this.resonance.visible = v; }

  raycastBody(ndcX, ndcY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = ray.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object.userData.bodyName : null;
  }
}

// ---------------------------------------------------------------------------
// Materials & helpers
// ---------------------------------------------------------------------------

/**
 * Rayleigh scattering atmosphere (V5, Worker 2's earth-atmosphere.glsl):
 * Earth's vivid blue limb with terminator sunset band and ISS-altitude
 * horizon line. Same shell geometry/blending as the limb scatter material.
 */
function makeRayleighMaterial(atm) {
  return makeShellAtmosphereMaterial(EARTH_ATMOSPHERE_GLSL, atm);
}

/**
 * Dust-scattering atmosphere (V6, Worker 1's mars-atmosphere.glsl): Mars's
 * thin salmon-pink limb. Same shell contract as the Rayleigh material —
 * uSunW / uCamPos / uAltitude are updated by the same per-frame code.
 */
function makeDustMaterial(atm) {
  return makeShellAtmosphereMaterial(MARS_ATMOSPHERE_GLSL, atm);
}

/**
 * Sun shader material (V9): splits a sun .glsl file on the house
 * VERTEX/FRAGMENT markers, optionally prepending shared GLSL libraries
 * (simplex noise, the sunspot library) to the fragment stage. The sun
 * shaders carry their own logdepthbuf chunks (V7 Titan lesson).
 */
function makeSunShaderMaterial(glslSource, uniforms, opts = {}) {
  const [, rest] = glslSource.split('// === VERTEX ===');
  const [vertexShader, fragmentShader] = rest.split('// === FRAGMENT ===');
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: (opts.fragmentPrelude || '') + '\n' + fragmentShader,
    ...(opts.shell ? {
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    } : {}),
  });
  return mat;
}

function makeShellAtmosphereMaterial(glslSource, atm) {
  const [, rest] = glslSource.split('// === VERTEX ===');
  const [vertexShader, fragmentShader] = rest.split('// === FRAGMENT ===');
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunW: { value: new THREE.Vector3(1, 0, 0) },
      uCamPos: { value: new THREE.Vector3() },
      uAltitude: { value: 1e9 },
      uIntensity: { value: atm.intensity ?? 1.0 },
      // Shell thickness as a fraction of body radius — the gradient shaders
      // derive per-sightline height in the shell from it (impact parameter).
      uThickness: { value: atm.thickness ?? 0.02 },
      // ISS-style low-altitude horizon arc — config opt-in (Earth only).
      uHorizonGlow: { value: atm.horizonGlow ? 1 : 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/**
 * Atmospheric limb scattering (4b): a thin, feathered haze at the very edge
 * of the disk — grazing-angle fresnel, lit-side only, brightest where the
 * atmosphere catches sunlight edge-on at the terminator. Rendered on a
 * slightly larger BackSide sphere behind the body.
 */
function makeLimbScatterMaterial(atm) {
  return new THREE.ShaderMaterial({
    // 3-stop vertical gradient (v10.0.3): opt-in when the config supplies
    // colorLow/Mid/High — the legacy two-color path is compiled out so the
    // moon exosphere slivers (atmosphereLimb) are bit-identical.
    defines: atm.colorLow ? { GRADIENT3: 1 } : {},
    uniforms: {
      uEdgeColor: { value: new THREE.Color(atm.limbEdge ?? 0xc8824a) },
      uMidColor: { value: atm.colorMid
        ? new THREE.Color(...atm.colorMid)
        : new THREE.Color(atm.limbMid ?? 0xe8d4a0) },
      uColorLow: { value: new THREE.Color(...(atm.colorLow ?? [1, 1, 1])) },
      uColorHigh: { value: new THREE.Color(...(atm.colorHigh ?? [0, 0, 0])) },
      uThickness: { value: atm.thickness ?? 0.025 },
      uOpacity: { value: atm.opacity ?? 0.55 },
      uIntensity: { value: atm.intensity ?? 1.0 },
      // Defaults preserve the gas-giant look (Jupiter). Thin-exosphere
      // shells pass sharper values (post-v7 hardware fix).
      uFresnelPow: { value: atm.fresnelPower ?? 3.0 },
      uLit0: { value: atm.lit0 ?? -0.12 },
      uLit1: { value: atm.lit1 ?? 0.25 },
      uCamPos: { value: new THREE.Vector3() },      // world space
      uSunDir: { value: new THREE.Vector3(1, 0, 0) }, // world space
    },
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      varying vec3 vWNormal;
      void main() {
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uEdgeColor;
      uniform vec3 uMidColor;
      uniform vec3 uColorLow;
      uniform vec3 uColorHigh;
      uniform float uThickness;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uFresnelPow;
      uniform float uLit0;
      uniform float uLit1;
      uniform vec3 uCamPos;
      uniform vec3 uSunDir;
      varying vec3 vWPos;
      varying vec3 vWNormal;
      void main() {
        vec3 n = normalize(vWNormal);
        vec3 viewDir = normalize(uCamPos - vWPos);
        // Grazing-angle fresnel — per-body sharpness (3 = gas giant,
        // 6-7 = trace exosphere sliver).
        float f = pow(1.0 - abs(dot(viewDir, n)), uFresnelPow);
        // Lit side only, cutoff per body config.
        float sunDot = dot(n, normalize(uSunDir));
        float lit = smoothstep(uLit0, uLit1, sunDot);
        // Brightest where the atmosphere catches sunlight at the terminator.
        float term = 1.0 + 0.5 * pow(1.0 - abs(sunDot), 4.0);
      #ifdef GRADIENT3
        // Height of this sightline's closest approach inside the shell —
        // impact parameter (house rule: never fragment radius). 0 = cloud
        // tops at the disc edge, 1 = top of the atmosphere at the outer
        // limb. Raw fresnel only spans ~0.7-1.0 across the visible annulus,
        // so a fresnel-derived height would never reach the low band.
        float dv = dot(viewDir, n);
        float sinv = sqrt(max(0.0, 1.0 - dv * dv));
        float atmHeight = clamp(((1.0 + uThickness) * sinv - 1.0) / uThickness, 0.0, 1.0);
        vec3 col = atmHeight < 0.45
          ? mix(uColorLow, uMidColor, atmHeight / 0.45)
          : mix(uMidColor, uColorHigh, (atmHeight - 0.45) / 0.55);
        float alpha = f * lit * term * uOpacity;
      #else
        // Warm orange-tan at the limb edge -> pale yellow-white -> nothing.
        float edge = smoothstep(0.35, 0.9, f);
        vec3 col = mix(uMidColor, uEdgeColor, edge);
        float alpha = f * lit * term * mix(0.3, 0.6, edge) * uIntensity;
      #endif
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/**
 * Diffuse dust-cloud look for the halo torus: brightest where the surface
 * faces the camera, fading to nothing at the silhouette — no hard edges.
 */
function makeHaloMaterial(color, opacity, sunDirWorld, planetR) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uSunW: { value: sunDirWorld },
      uPlanetR: { value: planetR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec3 uSunW;
      uniform float uPlanetR;
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vWorld;
      void main() {
        float facing = abs(dot(normalize(-vPos), normalize(vNormal)));
        // Planet shadow (2a): the primary sits at the world origin — ring
        // material inside its anti-sun shadow cylinder is eclipsed.
        float along = dot(vWorld, uSunW);
        float perp = length(vWorld - along * uSunW);
        float lit = along > 0.0 ? 1.0 : smoothstep(uPlanetR * 0.98, uPlanetR * 1.08, perp);
        gl_FragColor = vec4(uColor, uOpacity * pow(facing, 2.0) * lit);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  });
}

function makeRingMaterial(color, opacity, inner, outer, sunDirWorld, planetR) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uInner: { value: inner },
      uOuter: { value: outer },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uSunW: { value: sunDirWorld },
      uPlanetR: { value: planetR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vR;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vR = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uInner;
      uniform float uOuter;
      uniform vec3 uCamPos;
      uniform vec3 uSunDir;
      uniform vec3 uSunW;
      uniform float uPlanetR;
      varying vec3 vWorld;
      varying float vR;
      void main() {
        float t = clamp((vR - uInner) / (uOuter - uInner), 0.0, 1.0);
        // Soft radial falloff at both edges.
        float band = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.75, 1.0, t));
        // Forward scattering: rings light up dramatically when the camera
        // looks through them toward the sun (backlit).
        vec3 toCam = normalize(uCamPos - vWorld);
        float back = pow(max(dot(-toCam, uSunDir), 0.0), 6.0);
        float bright = uOpacity * band * (1.0 + back * 10.0);
        // Planet shadow (2a): ring material inside the primary's anti-sun
        // shadow cylinder is eclipsed — the lit band no longer appears to
        // cut across the night-side disc.
        float along = dot(vWorld, uSunW);
        float perp = length(vWorld - along * uSunW);
        float lit = along > 0.0 ? 1.0 : smoothstep(uPlanetR * 0.98, uPlanetR * 1.08, perp);
        gl_FragColor = vec4(uColor * (1.0 + back * 2.0), bright * lit);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/**
 * Textured ring-system material (V7 Saturn): Worker 2's saturn-rings.glsl
 * on one RingGeometry disc. NORMAL blending — the B ring is dense enough to
 * occlude what's behind it, which additive blending cannot express.
 * uCamPos here is WORLD-space (userData.worldUniforms routes the per-frame
 * update); uSunW follows _syncSunDirection like the Jupiter rings.
 */
function makeTexturedRingMaterial(inner, outer, sunDirWorld, planetR) {
  const [, rest] = SATURN_RINGS_GLSL.split('// === VERTEX ===');
  const [vertexShader, fragmentShader] = rest.split('// === FRAGMENT ===');
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRingTex: { value: new THREE.Texture() },
      uHasTex: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uSunW: { value: sunDirWorld.clone() },
      uPlanetR: { value: planetR },
      uInner: { value: inner },
      uOuter: { value: outer },
      uOpacityScale: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mat.userData.worldUniforms = true;
  return mat;
}

/** Umbrella-shaped particle plume + glowing hotspot at a surface vent.
 *  Default palette is Io's volcanic orange; V7's Enceladus geysers reuse it
 *  through `opts` (white ice, 2-radii jets, narrow spread). */
function makeVolcanicPlume(moonRadius, volcano, tier, opts = {}) {
  const COUNT = tier === 'mobile' ? 120 : 320;
  const lat = THREE.MathUtils.degToRad(volcano.latDeg);
  const lon = THREE.MathUtils.degToRad(volcano.lonDeg);
  const base = new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon)
  );
  const up = base.clone();
  const plumeHeight = moonRadius * (opts.heightFrac ?? 0.165); // ~300 km on Io
  const spreadFrac = opts.spreadFrac ?? 0.85;

  const pos = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) seeds[i] = Math.random();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Soft circular sprite: raw points render as squares up close (bug #8).
  const mat = new THREE.PointsMaterial({
    map: makeFlareTexture(64, opts.spriteColor ?? 'rgba(255,225,150,1)'),
    color: opts.pointColor ?? 0xffc878, size: moonRadius * 0.02,
    transparent: true, opacity: opts.opacity ?? 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // Hotspot: small additive sprite that glows on the night side (bloom feeds on it).
  const hotspot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeFlareTexture(64, opts.hotspotSprite ?? 'rgba(255,120,40,1)'),
    color: opts.hotspotColor ?? 0xff7733,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hotspot.position.copy(base).multiplyScalar(moonRadius * 1.005);
  hotspot.scale.setScalar(moonRadius * (opts.hotspotScale ?? 0.12));

  // Local tangent frame for the umbrella spread.
  const tanA = new THREE.Vector3(0, 1, 0).cross(up);
  if (tanA.lengthSq() < 1e-6) tanA.set(1, 0, 0);
  tanA.normalize();
  const tanB = up.clone().cross(tanA);

  function update(dt, elapsed) {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      // Each particle loops up and falls back on its own phase — umbrella arc.
      const t = (seeds[i] + elapsed * 0.07) % 1;
      const h = Math.sin(t * Math.PI) * plumeHeight;          // rise then fall
      const spread = t * plumeHeight * spreadFrac;             // widen with time
      const ang = seeds[i] * 977.0;
      const px = Math.cos(ang) * spread, py = Math.sin(ang) * spread;
      const p = up.clone().multiplyScalar(moonRadius + h)
        .addScaledVector(tanA, px)
        .addScaledVector(tanB, py);
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { points, hotspot, update };
}

/** Billboard label sprite for named surface features. */
function makeTextSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '600 44px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(5,5,16,0.95)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#66b2ff';
  ctx.fillText(text.toUpperCase(), 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false,
  }));
}

function makeFlareTexture(size, color, ring = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (ring) {
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    g.addColorStop(0, color);
    g.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.55)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Approximate spectral color from the B-V color index (HYG `ci` column):
 *  blue-white O/B stars (ci < 0) through white, yellow, to orange-red M. */
function bvToColor(bv) {
  const t = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (t < 0.4) { r = 0.62 + 0.6 * (t + 0.4) / 0.8; g = 0.72 + 0.3 * (t + 0.4) / 0.8; b = 1.0; }
  else if (t < 0.8) { r = 1.0; g = 0.94 - 0.15 * (t - 0.4) / 0.4; b = 1.0 - 0.4 * (t - 0.4) / 0.4; }
  else { r = 1.0; g = 0.79 - 0.35 * (t - 0.8) / 1.2; b = 0.6 - 0.45 * (t - 0.8) / 1.2; }
  return { r: Math.min(1, r), g: Math.max(0, g), b: Math.max(0, b) };
}

/** Unit direction from lat/lon radians — house convention (matches the
 *  feature-sprite and plume placement formulas). */
function latLonDir(lat, lon) {
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  return (rand() + rand() + rand() + rand() - 2) * 1.2;
}
