import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

/**
 * Dev/preview mirror of worker.js (v10.0.14): bare "/" serves the solar map,
 * "/?system=X" stays on the simulator.
 *
 * Neither `vite dev` nor `vite preview` runs the Worker, so without this the
 * routing would only exist in production — `localhost:5173/` would serve the
 * simulator while the live site served the map, and the split would go
 * unverified until deploy. Keep this rule and worker.js in step.
 */
const solarMapRoot = () => {
  const middleware = (req, _res, next) => {
    const [path, query] = req.url.split('?');
    if (path === '/' && !new URLSearchParams(query || '').has('system')) {
      req.url = '/solar-map.html';
    }
    next();
  };
  // Block bodies on purpose: middlewares.use() returns the connect app, and an
  // arrow that returned it would be mistaken for a post-configure hook.
  return {
    name: 'solar-map-root',
    configureServer(s) { s.middlewares.use(middleware); },
    configurePreviewServer(s) { s.middlewares.use(middleware); },
  };
};

export default defineConfig({
  root: '.',
  base: '/',
  plugins: [solarMapRoot()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: { main: './index.html' },
      output: {
        // Function form (V4c 8a): each system config becomes its own lazy
        // chunk (system-jupiter, system-saturn, …) so only the active
        // system downloads on page load; three/postprocessing split as
        // before. NEVER remove manualChunks — without it the build drops
        // the app source (see .claude/instructions.md).
        manualChunks(id) {
          if (id.includes('/data/systems/')) {
            const name = id.split('/data/systems/')[1].replace('.js', '');
            return `system-${name}`;
          }
          if (id.includes('node_modules/postprocessing')) return 'postprocessing';
          if (id.includes('node_modules/three')) return 'three';
        }
      }
    }
  },
  server: {
    port: 5173
  }
})