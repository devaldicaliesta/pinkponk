import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { siteFiles } from "./build/site-files";

export default defineConfig(({ mode }) => ({
  plugins: [preact(), siteFiles()],
  define: {
    // Hook test hanya ada di build E2E; build produksi menghapusnya lewat tree-shaking.
    __E2E__: JSON.stringify(mode === "e2e"),
  },
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 0,
    // Chunk game (Three.js) memang besar dan dimuat terpisah; budget dicek scripts/check-size.mjs.
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
}));
