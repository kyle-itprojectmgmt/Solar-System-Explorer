import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  root: '.',
  base: '/',
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