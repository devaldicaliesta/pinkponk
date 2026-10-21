// Cek budget ukuran build (docs/QA.md §4). Jalankan setelah `pnpm build`.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve(import.meta.dirname, "../apps/web/dist");
const assets = resolve(dist, "assets");
const gz = (file) => gzipSync(readFileSync(file)).length;
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

const html = readFileSync(resolve(dist, "index.html"), "utf8");
const entryName = html.match(/src="\/assets\/([^"]+\.js)"/)?.[1];
if (!entryName) throw new Error("entry JS tidak ditemukan di index.html");
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith(".js"));
const entry = gz(resolve(assets, entryName));
const game = Math.max(0, ...js.filter((f) => f !== entryName).map((f) => gz(resolve(assets, f))));
const css = files.filter((f) => f.endsWith(".css")).reduce((s, f) => s + gz(resolve(assets, f)), 0);
// File font sudah terkompresi (woff2), jadi dihitung ukuran aslinya.
const fonts = files
  .filter((f) => f.endsWith(".woff2"))
  .reduce((s, f) => s + readFileSync(resolve(assets, f)).length, 0);
const total = entry + game + css + fonts;

const budgets = [
  ["JS awal (menu)", entry, 150 * 1024],
  ["Chunk game", game, 200 * 1024],
  ["Font (woff2)", fonts, 80 * 1024],
  ["Total sampai servis pertama", total, 550 * 1024],
];
let failed = false;
for (const [name, size, max] of budgets) {
  const ok = size <= max;
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(30)} ${kb(size).padStart(10)} / ${kb(max)}`);
}
if (failed) {
  console.error("Budget ukuran terlampaui.");
  process.exit(1);
}
