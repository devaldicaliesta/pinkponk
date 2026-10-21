// Render ikon PWA dan gambar Open Graph dari logo SVG. Jalankan ulang bila logo berubah:
//   node scripts/generate-images.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const pub = resolve(root, "apps/web/public");
const mark = readFileSync(resolve(root, "docs/brand/logo-mark-dark.svg"), "utf8");
const wordmark = readFileSync(resolve(root, "docs/brand/logo-wordmark-dark.svg"), "utf8");
const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage();

for (const [file, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:#0B0710"><img src="${dataUrl(mark)}" style="width:${size - pad * 2}px;height:${size - pad * 2}px;margin:${pad}px;display:block"></body>`,
  );
  await page.screenshot({ path: resolve(pub, file) });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:#0B0710;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;overflow:hidden;position:relative">
  <svg style="position:absolute;right:60px;top:60px" width="360" height="180" viewBox="0 0 120 60"><path d="M6 40c30-30 70-36 106-18M20 52c28-18 60-22 92-8" fill="none" stroke="#C6FF3D" stroke-width="4" stroke-linecap="round"/></svg>
  <svg style="position:absolute;left:40px;bottom:30px" width="300" height="150" viewBox="0 0 120 60"><path d="M6 20c30 30 70 36 106 18" fill="none" stroke="#FF2E9A" stroke-width="4" stroke-linecap="round" opacity=".7"/></svg>
  <img src="${dataUrl(wordmark)}" style="width:900px">
  <p style="color:#F7F0FA;font-size:40px;margin:24px 0 0;font-weight:700">Ping pong neon, langsung di browser.</p>
</body>`);
await page.screenshot({ path: resolve(pub, "og.png") });
await browser.close();
console.log("ok");
