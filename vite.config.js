import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// GitHub Pages serves the site from /Bloom-Pilates/; Vercel and a custom
// domain serve it from the root. The gh-pages script sets GITHUB_PAGES=1,
// so both targets keep working from one config.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/Bloom-Pilates/' : '/',
  build: {
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'index.html'),
        paketi:     resolve(__dirname, 'paketi.html'),
        rezervacija: resolve(__dirname, 'rezervacija.html'),
        uvjeti:     resolve(__dirname, 'uvjeti.html'),
        privatnost: resolve(__dirname, 'privatnost.html'),
        odricanje:  resolve(__dirname, 'odricanje.html'),
      },
    },
  },
})
