// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        // Registration happens only in src/lib/pwa.ts (guarded: never in dev, preview or iframes).
        injectRegister: null,
        registerType: "prompt",
        manifest: false, // public/manifest.webmanifest is hand-written
        devOptions: { enabled: false },
        // TanStack Start serves static client files from dist/client.
        outDir: "dist/client",
        workbox: {
          globDirectory: "dist/client",
          // Precache built static files only. No HTML, no navigation fallback, no runtime caching:
          // database, server-function and WebSocket traffic always goes to the network.
          globPatterns: ["**/*.{js,css,woff2,png,svg,ico,webmanifest}"],
          globIgnores: ["**/sw.js", "**/workbox-*.js"],
          navigateFallback: null,
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  },
});
