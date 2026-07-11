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

    this._buildLights();
    this._buildStarfield();
    this._buildPrimary();
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
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false })
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
              gl_FragColor = vec4(vColor, a);
            }
          `,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
        });
        mat.toneMapped = false;
        const points = new THREE.Points(geo, mat);
        points.renderOrder = -1;
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
      transparent: true, opacity: 0.95, depthWrite: false,
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

    if (p.detail) this._registerDetail(p.name, this.primaryMesh, mat, p.detail, rEq, p.normalScale);

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
        atm.style === 'rayleigh' ? makeRayleighMaterial(atm) : makeLimbScatterMaterial(atm)
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

  // -- Rings ---------------------------------------------------------------------

  _buildRings() {
    this.ringMeshes = [];
    // Planet shadow inputs (2a): sun direction in world space and the
    // primary's radius — ring segments inside the shadow cylinder go dark,
    // so the lit band no longer "cuts across" the night-side disc.
    const sunWorld = new THREE.Vector3()
      .copy(this.sunDir).applyQuaternion(this.root.quaternion).normalize();
    const planetR = this.system.primary.radiusKm * K;
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
          new THREE.SphereGeometry(r * (1 + (al.thickness ?? 0.02)), 48, 32),
          makeLimbScatterMaterial({
            limbEdge: al.color, limbMid: al.color, intensity: al.intensity ?? 0.3,
          })
        );
        shell.material.userData.worldUniforms = true;
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

      if (cfg.detail) this._registerDetail(cfg.name, group, mat, cfg.detail, r, cfg.normalScale);

      this.root.add(group);
      this.bodyMeshes.set(cfg.name, entry);
      this.pickables.push(this._makePicker(cfg.name, group, r));
    }
  }

  _registerDetail(name, anchor, material, detail, radiusUnits, normalScale) {
    const uniforms = applyDetailShader(material, detail.style, detail.params, this.quality);
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
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const t = (i / 180) * Math.PI * 2;
        pts.push(new THREE.Vector3(a * Math.cos(t), 0, -a * Math.sin(t)));
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

    for (const b of physics.bodies) {
      const entry = this.bodyMeshes.get(b.name);
      if (!entry || entry.isPrimary) continue;
      entry.group.position.set(b.pos.x * K, b.pos.y * K, b.pos.z * K);

      // Tidal lock: keep the same face toward the primary.
      if (b.cfg.tidallyLocked) {
        entry.mesh.rotation.y = Math.atan2(-b.pos.z, b.pos.x) + Math.PI;
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

    // Ring shader uniforms (camera position in root-local space).
    const camLocal = this.root.worldToLocal(this.camera.position.clone());
    for (const mesh of this.ringMeshes) {
      const u = mesh.material.uniforms;
      if (u?.uCamPos) {
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
          // Limb-scatter shells: varyings come from modelMatrix (world).
          u.uCamPos.value.copy(this.camera.position);
          u.uSunDir.value.copy(this.sunDir).applyQuaternion(this.root.quaternion);
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
  const [, rest] = EARTH_ATMOSPHERE_GLSL.split('// === VERTEX ===');
  const [vertexShader, fragmentShader] = rest.split('// === FRAGMENT ===');
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunW: { value: new THREE.Vector3(1, 0, 0) },
      uCamPos: { value: new THREE.Vector3() },
      uAltitude: { value: 1e9 },
      uIntensity: { value: atm.intensity ?? 1.0 },
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
    uniforms: {
      uEdgeColor: { value: new THREE.Color(atm.limbEdge ?? 0xc8824a) },
      uMidColor: { value: new THREE.Color(atm.limbMid ?? 0xe8d4a0) },
      uIntensity: { value: atm.intensity ?? 1.0 },
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
      uniform float uIntensity;
      uniform vec3 uCamPos;
      uniform vec3 uSunDir;
      varying vec3 vWPos;
      varying vec3 vWNormal;
      void main() {
        vec3 n = normalize(vWNormal);
        vec3 viewDir = normalize(uCamPos - vWPos);
        // Grazing-angle fresnel, pow 3 for a sharp thin atmospheric edge.
        float f = pow(1.0 - abs(dot(viewDir, n)), 3.0);
        // Lit side only, with slight refraction bleed past the terminator.
        float sunDot = dot(n, normalize(uSunDir));
        float lit = smoothstep(-0.12, 0.25, sunDot);
        // Brightest where the atmosphere catches sunlight at the terminator.
        float term = 1.0 + 0.5 * pow(1.0 - abs(sunDot), 4.0);
        // Warm orange-tan at the limb edge -> pale yellow-white -> nothing.
        float edge = smoothstep(0.35, 0.9, f);
        vec3 col = mix(uMidColor, uEdgeColor, edge);
        float alpha = f * lit * term * mix(0.3, 0.6, edge) * uIntensity;
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

/** Umbrella-shaped SO2 plume + night-glowing hotspot at a volcano site. */
function makeVolcanicPlume(moonRadius, volcano, tier) {
  const COUNT = tier === 'mobile' ? 120 : 320;
  const lat = THREE.MathUtils.degToRad(volcano.latDeg);
  const lon = THREE.MathUtils.degToRad(volcano.lonDeg);
  const base = new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon)
  );
  const up = base.clone();
  const plumeHeight = moonRadius * 0.165; // ~300 km on Io

  const pos = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) seeds[i] = Math.random();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Soft circular sprite: raw points render as squares up close (bug #8).
  const mat = new THREE.PointsMaterial({
    map: makeFlareTexture(64, 'rgba(255,225,150,1)'),
    color: 0xffc878, size: moonRadius * 0.02, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // Hotspot: small additive sprite that glows on the night side (bloom feeds on it).
  const hotspot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeFlareTexture(64, 'rgba(255,120,40,1)'),
    color: 0xff7733, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hotspot.position.copy(base).multiplyScalar(moonRadius * 1.005);
  hotspot.scale.setScalar(moonRadius * 0.12);

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
      const spread = t * plumeHeight * 0.85;                   // widen with time
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
