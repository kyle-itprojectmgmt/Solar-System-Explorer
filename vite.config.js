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
        manualChunks: {
          three: ['three'],
          postprocessing: ['postprocessing']
        }
      }
    }
  },
  server: {
    port: 5173
  }
})