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
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.05, 4e6);
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

  // -- Lighting ---------------------------------------------------------------

  _buildLights() {
    const star = this.system.star;
    const d = new THREE.Vector3(...star.direction).normalize();
    this.sunDir = d.clone(); // in root (equatorial) frame

    this.sunLight = new THREE.DirectionalLight(star.color, star.intensity);
    this.sunLight.position.copy(d).multiplyScalar(1000);
    this.root.add(this.sunLight);
    this.root.add(this.sunLight.target);

    // Faint fill so night sides aren't pure black on screens.
    this.scene.add(new THREE.AmbientLight(0x223344, 0.06));

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
    const mat = new THREE.MeshPhongMaterial({
      map: this.texLoader.load(this.texUrl(p.slug, p.textures.diffuse)),
      shininess: 4,
      specular: new THREE.Color(0x111111),
    });
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.minFilter = THREE.LinearMipmapLinearFilter; // trilinear
    mat.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.primaryMesh = new THREE.Mesh(geo, mat);
    this.primaryMesh.scale.set(rEq, rPol, rEq);
    this.primaryMesh.name = p.name;
    this.root.add(this.primaryMesh);
    this.pickables.push(this._makePicker(p.name, this.primaryMesh, rEq));

    if (p.detail) this._registerDetail(p.name, this.primaryMesh, mat, p.detail, rEq);

    // Progressive high-res swap (outside the loading manager on purpose —
    // the app starts on the low-res map and upgrades silently).
    if (this.quality.highResPrimary && p.textures.diffuseHigh) {
      new THREE.TextureLoader().load(this.texUrl(p.slug, p.textures.diffuseHigh), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
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
      const atm = p.atmosphere;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        makeAtmosphereMaterial(new THREE.Color(atm.glowColor), atm.intensity)
      );
      const s = 1 + (atm.thickness || 0.04);
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
    for (const ring of this.system.rings || []) {
      const inner = ring.innerKm * K, outer = ring.outerKm * K;
      let mesh;
      if (ring.type === 'torus') {
        const mid = (inner + outer) / 2;
        const tube = (outer - inner) / 2;
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(mid, tube, 24, 128),
          makeHaloMaterial(new THREE.Color(ring.color), ring.opacity)
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.scale.z = (ring.thicknessKm * K) / tube; // squash torus vertically
      } else {
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(inner, outer, 192, 4),
          makeRingMaterial(new THREE.Color(ring.color), ring.opacity, inner, outer)
        );
        mesh.rotation.x = -Math.PI / 2;
      }
      mesh.name = ring.name;
      mesh.renderOrder = 2;
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

      const detail = cfg.textures ? 96 : 24;
      const matOpts = { shininess: 6, specular: new THREE.Color(0x0a0a0a) };
      if (cfg.textures?.diffuse) {
        const tex = this.texLoader.load(this.texUrl(cfg.slug, cfg.textures.diffuse));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        matOpts.map = tex;
      } else {
        matOpts.color = new THREE.Color(cfg.color || 0x888888);
      }
      const mat = new THREE.MeshPhongMaterial(matOpts);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, detail, detail / 2), mat);
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
      if (cfg.features?.magnetosphereGlow) {
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.06, 48, 32),
          makeAtmosphereMaterial(new THREE.Color(0x5588cc), 0.3)
        );
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
      if (cfg.features?.thinAtmosphere) {
        const ta = cfg.features.thinAtmosphere;
        const haze = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.035, 48, 32),
          makeAtmosphereMaterial(new THREE.Color(ta.color), 0)
        );
        group.add(haze);
        entry.haze = haze;
        entry.hazeIntensity = ta.intensity;
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

      if (cfg.detail) this._registerDetail(cfg.name, group, mat, cfg.detail, r);

      this.root.add(group);
      this.bodyMeshes.set(cfg.name, entry);
      this.pickables.push(this._makePicker(cfg.name, group, r));
    }
  }

  _registerDetail(name, anchor, material, detail, radiusUnits) {
    const uniforms = applyDetailShader(material, detail.style, detail.params, this.quality);
    if (!uniforms) return;
    this.detailEntries.push({ name, anchor, uniforms, detail, radiusUnits, blend: 0 });
  }

  /** Current procedural-detail blend (0..1) for a body — for the UI indicator. */
  getDetailBlend(name) {
    return this.detailEntries.find((e) => e.name === name)?.blend ?? 0;
  }

  _updateDetailShaders(physics) {
    const t = physics.simSeconds % 1e6; // keep float32-precision-friendly
    const v = this._tmpV ??= new THREE.Vector3();
    for (const e of this.detailEntries) {
      const altKm = (e.anchor.getWorldPosition(v).distanceTo(this.camera.position) - e.radiusUnits) * KM_PER_UNIT;
      e.blend = detailBlend(altKm, e.detail.activationKm, e.detail.fullKm);
      e.uniforms.uTime.value = t;
      e.uniforms.uAltitude.value = altKm;
      e.uniforms.uDetailBlend.value = e.blend;
    }
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
    // Subtle radius lines from the primary to the three resonant moons
    // (shown only in System View when enabled).
    this.resonance = new THREE.Group();
    this.resonanceTargets = this.system.bodies.filter((b) => b.physics === 'nbody').slice(0, 3);
    const colors = [0xffaa55, 0x66b2ff, 0xd9d9d9];
    this.resonanceLines = this.resonanceTargets.map((cfg, i) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: colors[i % 3], transparent: true, opacity: 0.4,
      }));
      this.resonance.add(line);
      return line;
    });
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

      // Altitude-driven detail: surface feature labels (<~500 km) and thin
      // atmospheric haze (<~1000 km).
      if (entry.featureSprites || entry.haze) {
        const altKm = (entry.group.getWorldPosition(this._tmpV ??= new THREE.Vector3())
          .distanceTo(this.camera.position) - entry.radiusUnits) * KM_PER_UNIT;
        if (entry.featureSprites) {
          const op = THREE.MathUtils.clamp((800 - altKm) / 300, 0, 1);
          for (const s of entry.featureSprites) {
            s.material.opacity = op;
            s.visible = op > 0.02;
          }
        }
        if (entry.haze) {
          const h = THREE.MathUtils.clamp((1500 - altKm) / 500, 0, 1);
          entry.haze.material.uniforms.uIntensity.value = h * entry.hazeIntensity;
          entry.haze.visible = h > 0.01;
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
      const u = this.atmosphereMesh.material.uniforms;
      u.uCamPos.value.copy(camLocal);
      u.uSunDir.value.copy(this.sunDir);
    }
    for (const [, entry] of this.bodyMeshes) {
      // moon atmosphere-style shells need camera in their local frame
      for (const child of entry.group?.children || []) {
        if (child.material?.uniforms?.uCamPos) {
          child.material.uniforms.uCamPos.value.copy(entry.group.worldToLocal(this.camera.position.clone()));
          child.material.uniforms.uSunDir.value.copy(this.sunDir);
        }
      }
    }

    // Resonance visualizer.
    if (this.resonance.visible) {
      this.resonanceTargets.forEach((cfg, i) => {
        const b = physics.getBody(cfg.name);
        const line = this.resonanceLines[i];
        const posAttr = line.geometry.attributes.position;
        posAttr.setXYZ(1, b.pos.x * K, b.pos.y * K, b.pos.z * K);
        posAttr.needsUpdate = true;
      });
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

function makeAtmosphereMaterial(color, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uIntensity: { value: intensity },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vec3 viewDir = normalize(-vPos);
        float rim = 1.0 - abs(dot(viewDir, normalize(vNormal)));
        float glow = pow(rim, 4.5) * uIntensity * 0.8;
        gl_FragColor = vec4(uColor, glow);
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
function makeHaloMaterial(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        float facing = abs(dot(normalize(-vPos), normalize(vNormal)));
        gl_FragColor = vec4(uColor, uOpacity * pow(facing, 2.0));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function makeRingMaterial(color, opacity, inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uInner: { value: inner },
      uOuter: { value: outer },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
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
        gl_FragColor = vec4(uColor * (1.0 + back * 2.0), bright);
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
  const mat = new THREE.PointsMaterial({
    color: 0xf5eec8, size: moonRadius * 0.02, transparent: true, opacity: 0.5,
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
