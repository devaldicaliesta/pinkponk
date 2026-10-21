import type { Plugin } from "vite";

declare const process: { env: Record<string, string | undefined> };

// Target situs ditentukan saat build: `PP_SITE=production|dev`. Build lokal dan E2E
// memakai "local" (tanpa header CSP host tertentu).
type Site = "production" | "dev" | "local";

const HOSTS: Record<Site, string | null> = {
  production: "pinkponk.panduarah.my.id",
  dev: "pinkponk-dev.panduarah.my.id",
  local: null,
};

const csp = (host: string | null): string =>
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${host ? ` wss://${host}` : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");

const headersFile = (site: Site): string => {
  const lines = [
    "/*",
    `  Content-Security-Policy: ${csp(HOSTS[site])}`,
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), gamepad=(self)",
    "  Cross-Origin-Opener-Policy: same-origin",
    "  X-Frame-Options: DENY",
  ];
  if (site !== "local")
    lines.push("  Strict-Transport-Security: max-age=31536000; includeSubDomains");
  if (site === "dev") lines.push("  X-Robots-Tag: noindex, nofollow");
  lines.push("", "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", "");
  lines.push("/sw.js", "  Cache-Control: no-cache", "");
  return lines.join("\n");
};

const robots = (site: Site): string =>
  site === "production"
    ? "User-agent: *\nAllow: /\nSitemap: https://pinkponk.panduarah.my.id/sitemap.xml\n"
    : "User-agent: *\nDisallow: /\n";

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://pinkponk.panduarah.my.id/</loc></url>\n</urlset>\n';

// Service worker kecil buatan sendiri (tanpa Workbox): aset ber-hash di-cache
// permanen, halaman memakai network-first agar versi baru cepat terambil.
const serviceWorker = (assets: string[], version: string): string => `
const CACHE = "pp-${version}";
const PRECACHE = ${JSON.stringify(["/", ...assets])};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
`;

export const siteFiles = (): Plugin => {
  const site = (process.env.PP_SITE ?? "local") as Site;
  return {
    name: "pinkponk-site-files",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        // Browser modern hanya memakai .woff2; .woff tidak perlu di-precache.
        .filter((f) => !f.endsWith(".html") && !f.endsWith(".map") && !f.endsWith(".woff"))
        .map((f) => `/${f}`);
      const publicFiles = ["/theme.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
      const version = Date.now().toString(36);
      const emit = (fileName: string, source: string) =>
        this.emitFile({ type: "asset", fileName, source });
      emit("sw.js", serviceWorker([...assets, ...publicFiles], version));
      emit("_headers", headersFile(site));
      emit("robots.txt", robots(site));
      if (site === "production") emit("sitemap.xml", sitemap);
    },
  };
};
