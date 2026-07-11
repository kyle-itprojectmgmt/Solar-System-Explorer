# Future Enhancements — Solar System Explorer

## Completed
- [x] Insert Viewer into Orbit (v2 — Orbit Insertion mode, Camera Mode 7)

## Planned

### High Priority
- [ ] Saturn System — drop in saturn.js config, rings as particle system,
      Titan with thick atmosphere shader, Enceladus geyser plumes
- [ ] Full Solar System view — zoom out to see all planets, click any to
      enter that system
- [ ] Historic mission trajectories — Voyager 1 & 2, Cassini, Juno, Galileo
      probe paths rendered as animated trajectory lines with mission facts

### Medium Priority
- [ ] WebGPU renderer upgrade — currently WebGL for postprocessing
      compatibility; migrate when postprocessing library adds WebGPU support
- [ ] KTX2 compressed textures — currently JPEG; add Basis encoder to
      build pipeline for faster mobile loading
- [ ] Polar orbit presets — one-click polar orbit over any body
- [ ] Time of day selector — jump to specific simulated date/time
- [ ] Multiplayer / shared view — share a URL that opens the exact same
      camera position and time for someone else

### Lower Priority
- [ ] VR support — WebXR for headset exploration
- [ ] Resonance visualizer — animated diagram showing 1:2:4 Io/Europa/
      Ganymede orbital resonance in System View
- [ ] Io volcanic event notifications — random eruption alerts when near Io
- [ ] Europa subsurface ocean flythrough — speculative interior cross-section
- [ ] Sound reactive visuals — audio waveform subtly modulates star brightness

### Notes
- All new planetary systems use the same data-driven engine config schema
- SYSTEM_CONFIG one-line switch in src/config.js
- TEXTURE_BASE_URL one-line switch for R2 vs local textures
