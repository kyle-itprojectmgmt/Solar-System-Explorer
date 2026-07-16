# Solar System Explorer

A photorealistic, first-person 3D explorer of the solar system — **10 systems live**: all 8 planets, the Sun, and Pluto, each with procedural shaders, real orbital mechanics, and NASA mission textures. Opens LIVE at the current UTC instant with physically calibrated sun geometry; historic-mission presets (Voyager 1979, Apollo 11, Viking 1) jump back to the epochs. Built with Three.js + Vite, deployed on Cloudflare Workers.

**Live demo:** https://app.solarexplorer.co
**Landing page + build story:** https://solarexplorer.co

## How It Was Built

Built entirely using **Claude** and **Fable** (Anthropic's agentic coding tool) over a single weekend by a non-developer IT program director. No prior WebGL experience. ~12 hours of keyboard time. 29,000 lines of Git-tracked code across 10 versions.

Full build story: https://solarexplorer.co/story.html

## Features

- **10 planetary systems** — the Sun, Mercury, Venus, Earth + Moon, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto + Charon, each accessible from the NAV panel
- **N-body physics** — velocity-Verlet integration with mutual perturbations (the 1:2:4 Laplace resonance emerges naturally); smaller moons ride inclined Keplerian orbits — Phoebe genuinely orbits Saturn backwards, Hyperion tumbles chaotically
- **Saturn's rings** — Cassini-derived radial color/opacity with the Cassini Division and Encke gap, ring shadows cast both ways (rings on cloud tops, Saturn on rings), and a fly-through ice-particle layer when you dip into the ring plane
- **Six camera modes** — Tour (`T`), Free Fly (`F`, WASD + mouse), Cinematic Orbit (`C` + click), Chase (`H` + click), Orbit Simulation (`O`, physically accurate orbits incl. GeoSync), System View (`G`)
- **Telephoto optics** — 🔭 toggle and a 5–90° FOV slider; Earthrise finally looks like Apollo 8
- **Procedural surface detail** — per-body GLSL layers that stage in with altitude: volcanic Io, cracked Europa, Titan's opaque orange haze, Enceladus tiger stripes + geysers, Iapetus's two-tone ridge line, Pluto's nitrogen plains and Mordor Macula
- **Time control** — pause to 10,000× (`Space`, `,`, `.`), date picker (1950–2050), 🔴 LIVE mode tracking the real clock
- **Eclipses & transits** — shadow cones, transit shadow dots, upcoming-event toasts with a Watch button
- **Generative audio** — procedural Web Audio soundscapes plus Spotify/YouTube embeds
- **Post-processing** — bloom, lens flare, depth of field, film grain, vignette (auto-tiered for desktop / tablet / mobile)
- **Hardened** — strict Content-Security-Policy and security headers, sanitized embed URLs, security.txt

## Architecture

The engine is fully data-driven. Each system lives in [`src/data/systems/`](src/data/systems/); nothing body-specific exists in [`src/engine/`](src/engine/). Adding a system means adding a config with the same schema — the engine renders it unchanged.

```
/src
  /engine        renderer, physics, camera, audio, ui, postfx  (system-agnostic)
  /data/systems  jupiter.js, earth.js, mars.js, saturn.js  (+ all others)
  config.js      TEXTURE_BASE_URL + AVAILABLE_SYSTEMS
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
npm run deploy           # build + deploy to Cloudflare Workers
npm run deploy:preview   # deploy to a preview branch
```

Production textures can be served from Cloudflare R2 by changing `TEXTURE_BASE_URL` in `src/config.js`.

## Texture Credits

- Jupiter, Saturn + ring strip, Earth 8K, Mars, Moon: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0, based on NASA data)
- Earth base: NASA Blue Marble Next Generation (public domain)
- Io, Europa, Ganymede, Titan, Enceladus, Iapetus, Mimas, Tethys, Dione, Rhea: NASA/Cassini maps via [Steve Albers](https://stevealbers.net/albers/sos/sos.html) (non-commercial use by permission)
- Callisto: [Björn Jónsson](https://bjj.mmedia.is/) planetary maps
- Pluto + Charon: NASA/New Horizons mission imagery (public domain)
- Milky Way panorama: ESO/S. Brunier (CC BY 4.0); bright stars: HYG database
- Orbital and physical data: NASA JPL

## Links

- **Landing page:** [solarexplorer.co](https://solarexplorer.co)
- **Build story:** [solarexplorer.co/story.html](https://solarexplorer.co/story.html)
- **The Doodle Principle** (book): [theaidoodle.com](https://theaidoodle.com)
- **LinkedIn:** [linkedin.com/in/kyle-s-ewing](https://linkedin.com/in/kyle-s-ewing)
- **Support this project:** [solarexplorer.co/support.html](https://solarexplorer.co/support.html)

## License

See [LICENSE](LICENSE).
