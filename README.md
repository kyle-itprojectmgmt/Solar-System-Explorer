# Solar System Explorer

A photorealistic, first-person 3D explorer of the solar system — v1 covers the **Jupiter system**, seen as Voyager saw it in March 1979. Built with Three.js + Vite, deployed on Cloudflare Pages.

**Live demo:** https://solar-system-explorer.kyle-d06.workers.dev

## Features

- **N-body physics** — velocity-Verlet integration of the Galilean moons with mutual perturbations (the 1:2:4 Io–Europa–Ganymede Laplace resonance emerges naturally); inner ring moons ride Keplerian orbits
- **Seven camera modes** — Cinematic auto-pilot (`C`), Free Fly (`F`, WASD + mouse), Orbit (`O` + click), Surface (`S` + click), Chase (`H` + click), Orbit Insertion (`I`, physically accurate orbits incl. Jupiter GeoSync), System View (`G`)
- **Altitude control** — scroll-wheel zoom with minimum safe altitude floors, ALT readout, one-click presets down to a 50 km skim, named surface-feature labels at low altitude
- **In-app help** — press `?` for the full controls reference
- **Time control** — pause to 10,000× (`Space`, `,`, `.`), simulation clock starts at the Voyager 1 flyby (March 5, 1979)
- **Eclipses & transits** — moons darken dramatically in Jupiter's shadow cone; transit shadows track across the cloud tops; upcoming events tick down in the side panel
- **Jupiter's four rings** — halo torus, main ring, and both gossamer rings, with forward-scattering shaders that light up when backlit
- **Io volcanic plumes** — umbrella-shaped particle plumes at Pele, Loki, and Prometheus, with night-glowing hotspots
- **Generative audio** — five procedural Web Audio soundscapes (Voyager plasma-wave radio, deep-space ambient, psychedelic journey, cosmic electronic) plus Spotify/YouTube embed drawers
- **Post-processing** — bloom, lens flare, subtle depth of field, film grain, vignette (auto-tiered for desktop / tablet / mobile)
- **Screenshot button**, Ko-fi support link, body info panels with NASA JPL data

## Architecture

The engine is fully data-driven. Jupiter lives in [`src/data/systems/jupiter.js`](src/data/systems/jupiter.js); nothing Jupiter-specific exists in [`src/engine/`](src/engine/). To render another system, drop in a config with the same schema (a Saturn stub is included) and change one line in [`src/config.js`](src/config.js).

```
/src
  /engine        renderer, physics, camera, audio, ui, postfx  (system-agnostic)
  /data/systems  jupiter.js (active), saturn.js (stub)
  config.js      TEXTURE_BASE_URL + SYSTEM_CONFIG
  main.js        entry point
```

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run preview   # test the production build locally
```

## Deployment

```bash
npm run deploy           # build + deploy to Cloudflare Pages
npm run deploy:preview   # deploy to a preview branch
```

Production textures can be served from Cloudflare R2 by changing `TEXTURE_BASE_URL` in `src/config.js`.

## Texture credits

- Jupiter: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0, based on NASA data)
- Io, Europa, Ganymede: USGS Astrogeology / NASA maps via [Steve Albers](https://stevealbers.net/albers/sos/sos.html)
- Callisto: [Björn Jónsson](https://bjj.mmedia.is/) planetary maps
- Orbital and physical data: NASA JPL

## Links

- LinkedIn: _placeholder_
- Substack: _placeholder_
- Support: [Ko-fi](https://ko-fi.com/YOUR_HANDLE)

## License

See [LICENSE](LICENSE).
