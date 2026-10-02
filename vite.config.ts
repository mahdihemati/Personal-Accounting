// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Generates /sw.js after the client build, next to the real static output.
 * The output folder differs between hosts (dist/client here, .output/public elsewhere),
 * so it is read from the client environment instead of being hard-coded.
 * Precaches static built files only: no HTML, no navigation fallback, no runtime caching —
 * database, server-function and WebSocket traffic always goes to the network.
 */
function serviceWorker(): Plugin {
  let done = false;
  return {
    name: "app-service-worker",
    apply: "build",
    async closeBundle() {
      const env = (this as unknown as { environment?: { name: string; config: { build: { outDir: string } } } }).environment;
      // Runs after every environment; public/ files land in the client folder only after the
      // client step, so wait until the folder is complete (contains the manifest).
      if (done) return;
      const candidates = [env?.name === "client" ? env.config.build.outDir : undefined, "dist/client", ".output/public"]
        .filter((d): d is string => !!d)
        .map((d) => path.resolve(d));
      const dir = candidates.find((d) => existsSync(path.join(d, "manifest.webmanifest")));
      if (!dir) {
        if (env?.name !== "client") console.warn("[service-worker] static output folder not found; skipping sw.js");
        return;
      }
      done = true;
      const { generateSW } = await import("workbox-build");
      const { count, size } = await generateSW({
        globDirectory: dir,
        swDest: path.join(dir, "sw.js"),
        globPatterns: ["**/*.{js,css,woff2,png,svg,ico,webmanifest}"],
        globIgnores: ["**/sw.js", "**/workbox-*.js", "**/server/**"],
        navigateFallback: null,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        inlineWorkboxRuntime: true,
        mode: "production",
      });
      console.log(`[service-worker] ${dir}/sw.js — ${count} files, ${Math.round(size / 1024)} KiB`);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      serviceWorker(),
    ],
  },
});
