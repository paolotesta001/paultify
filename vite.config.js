import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { helperPlugin } from './helper/vite-plugin.mjs';

// `base` controls the asset path. For root-level hosting (custom domain or
// user/org GitHub Pages site) leave it as `/`. For project-level GitHub Pages
// (`username.github.io/repo-name/`), set VITE_BASE=/repo-name/ when building
// — the GitHub Actions workflow does this automatically using the repo name.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    helperPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lyric Player',
        short_name: 'Lyric',
        description: 'Offline music player with synced karaoke lyrics. Import Spotify playlists, search Deezer, save songs locally.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        // start_url + scope must match `base` so the installed PWA opens to
        // the right path on project-level Pages deploys.
        start_url: base,
        scope: base,
        categories: ['music', 'entertainment'],
        lang: 'en',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/lrclib\.net\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lrclib-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true
  }
});
