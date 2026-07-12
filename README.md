# Solar System Explorer

A photorealistic, first-person 3D explorer of the solar system — **four systems** live: Jupiter, Earth + Moon, Mars, and Saturn. Opens LIVE at the current UTC instant with physically calibrated sun geometry; historic-mission presets (Voyager 1979, Apollo 11, Viking 1) jump back to the epochs. Built with Three.js + Vite, deployed as a Cloudflare Worker.

**Live demo:** https://solar-system-explorer.kyle-d06.workers.dev

## Features

- **Four planetary systems** — travel between Jupiter (Galilean moons, GRS), Earth (city lights, auroras, Apollo sites), Mars (Olympus Mons, dust storms, polar caps), and Saturn (the full ring system) from the NAV panel
- **N-body physics** — velocity-Verlet integration with mutual perturbations (the 1:2:4 Laplace resonance emerges naturally); smaller moons ride inclined Keplerian orbits — Phoebe genuinely orbits Saturn backwards, Hyperion tumbles chaotically
- **Saturn's rings** — Cassini-derived radial color/opacity with the Cassini Division and Encke gap, ring shadows cast both ways (rings on cloud tops, Saturn on rings), and a fly-through ice-particle layer when you dip into the ring plane
- **Six camera modes** — Cinematic (`C`), Free Fly (`F`, WASD + mouse), Orbit (`O` + click), Chase (`H` + click), Orbit Insertion (`I`, physically accurate orbits incl. GeoSync), System View (`G`)
- **Telephoto optics** — 🔭 toggle and a 5–90° FOV slider; Earthrise finally looks like Apollo 8
- **Procedural surface detail** — per-body GLSL layers that stage in with altitude: volcanic Io, cracked Europa, Titan's opaque orange haze, Enceladus tiger stripes + geysers, Iapetus's two-tone ridge line
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
  /data/systems  jupiter.js, earth.js, mars.js, saturn.js
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
npm run deploy           # build + deploy to Cloudflare Pages
npm run deploy:preview   # deploy to a preview branch
```

Production textures can be served from Cloudflare R2 by changing `TEXTURE_BASE_URL` in `src/config.js`.

## Texture credits

- Jupiter, Saturn + ring strip, Earth 8K, Mars, Moon: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0, based on NASA data)
- Earth base: NASA Blue Marble Next Generation (public domain)
- Io, Europa, Ganymede, Titan, Enceladus, Iapetus, Mimas, Tethys, Dione, Rhea: NASA/Cassini maps via [Steve Albers](https://stevealbers.net/albers/sos/sos.html) (non-commercial use by permission)
- Callisto: [Björn Jónsson](https://bjj.mmedia.is/) planetary maps
- Milky Way panorama: ESO/S. Brunier (CC BY 4.0); bright stars: HYG database
- Orbital and physical data: NASA JPL

## Links

- LinkedIn: _placeholder_
- Substack: _placeholder_
- Support: [Ko-fi](https://ko-fi.com/YOUR_HANDLE)

## License

See [LICENSE](LICENSE).
