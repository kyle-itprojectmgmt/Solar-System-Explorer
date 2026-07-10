// ---------------------------------------------------------------------------
// Post-processing pipeline (postprocessing library).
// Bloom (limb glow, hotspots, sun) + subtle DoF + film grain + vignette.
// Quality tiers strip effects progressively for tablet / mobile.
// ---------------------------------------------------------------------------

import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, VignetteEffect, NoiseEffect, DepthOfFieldEffect,
  BlendFunction, KernelSize,
} from 'postprocessing';
import * as THREE from 'three';

export function createPostFX(renderer, scene, camera, quality) {
  if (!quality.postfx) return null;

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  });
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    intensity: 0.85,
    luminanceThreshold: 0.72,
    luminanceSmoothing: 0.25,
    kernelSize: KernelSize.LARGE,
    mipmapBlur: true,
  });

  const effects = [bloom];
  let dof = null;

  if (quality.tier === 'desktop') {
    dof = new DepthOfFieldEffect(camera, {
      focusDistance: 0.02,
      focalLength: 0.28,
      bokehScale: 1.4,
    });
    effects.push(dof);
    effects.push(new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true }));
  }
  effects.push(new VignetteEffect({ darkness: 0.42, offset: 0.28 }));

  const pass = new EffectPass(camera, ...effects);
  composer.addPass(pass);

  // Keep the noise very subtle.
  const noise = effects.find((e) => e instanceof NoiseEffect);
  if (noise) noise.blendMode.opacity.value = 0.22;

  return {
    composer,
    /** Nudge DoF focus toward whatever the camera is looking at. */
    setFocusDistanceWorld(dist) {
      if (!dof) return;
      const ndc = Math.min(0.5, dist / camera.far);
      dof.circleOfConfusionMaterial.uniforms.focusDistance.value = ndc;
    },
    setSize(w, h) { composer.setSize(w, h); },
    render(dt) { composer.render(dt); },
  };
}
