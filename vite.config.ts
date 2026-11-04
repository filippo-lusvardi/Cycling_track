import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env["npm_package_version"] ?? "dev") },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "icon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Cirmolo — Endurance Training",
        short_name: "Cirmolo",
        id: "/",
        description: "Personal cycling and running training, form and body tracker.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell and self-hosted fonts only; intervals.icu data is cached by React Query in IndexedDB.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
        // Map tiles you've looked at stay available offline (30 days, ~3000 tiles).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(server\.arcgisonline\.com|tile\.opentopomap\.org|tile\.openstreetmap\.org)$/.test(url.hostname),
            handler: "CacheFirst",
            options: {
              // v2: CORS tiles only. Opaque (status 0) responses are padded to ~7 MB each in Chrome's quota.
              cacheName: "map-tiles-v2",
              expiration: { maxEntries: 3000, maxAgeSeconds: 30 * 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
