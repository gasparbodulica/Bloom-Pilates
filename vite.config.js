import { defineConfig } from 'vite'

// GitHub Pages serves the site from /Bloom-Pilates/; Vercel and a custom
// domain serve it from the root. The gh-pages script sets GITHUB_PAGES=1,
// so both targets keep working from one config.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/Bloom-Pilates/' : '/',
})
