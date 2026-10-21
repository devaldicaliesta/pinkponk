# Arsitektur — PinkPonk

## 1. Gambaran

```
Browser (HP/desktop)
  ├─ UI menu (DOM ringan)          ┐
  ├─ Renderer game (WebGL)         │  satu bundle Vite, game di-lazy-load
  ├─ Simulasi (TS murni)           │
  └─ Klien jaringan (WebSocket)    ┘
          │  wss://pinkponk.panduarah.my.id/ws/room/KODE
          ▼
Cloudflare Worker (satu Worker)
  ├─ Static Assets (hasil build frontend)
  ├─ GET /ws/room/:code      → upgrade ke Durable Object Room
  ├─ GET /ws/queue           → antrean cari lawan acak (DO Matchmaker)
  ├─ POST /api/room          → buat kode room
  ├─ GET /api/leaderboard    → top 50 (cache edge 30 detik)
  ├─ GET /api/leaderboard/me → peringkat sendiri (?id=hash)
  └─ POST /api/event         → hitungan anonim ke Workers Analytics Engine (metrik)
          ▼
Durable Object "Room" (satu instance per room, wilayah apac)
  ├─ menjalankan paket `sim` yang sama dengan client (server-authoritative)
  └─ akhir pertandingan → RPC report() ke DO "Leaderboard"
Durable Object "Matchmaker" (satu instance global, antrean di memori, hibernasi)
Durable Object "Leaderboard" (satu instance global, SQLite: players + pairs)
```

Tidak ada database aplikasi. State room dan antrean hanya hidup di memori Durable
Object. Satu-satunya data permanen adalah papan peringkat (lihat `SECURITY.md` §1).
Data pemain lain (nickname, pengaturan, XP, pencapaian) ada di `localStorage`.

## 2. Keputusan utama

### 2.1 Satu Worker + Static Assets (bukan Pages + Worker terpisah)

- Frontend, API, dan WebSocket satu origin → CSP sederhana, tanpa CORS.
- Satu kali deploy per environment; Durable Object harus di Worker juga.
- Konfigurasi assets: `run_worker_first = ["/ws/*", "/api/*"]` agar rute itu tidak
  dilayani sebagai file statis, dan `not_found_handling = "single-page-application"`
  agar link `/r/KODE` membuka aplikasi.
- Konsekuensi: Cloudflare tidak membuat preview URL untuk Worker yang memiliki
  Durable Object. Karena itu tidak ada deploy per PR; PR diuji dengan `wrangler dev`
  di CI, dan `pinkponk-dev.panduarah.my.id` berperan sebagai staging.
- Alternatif Pages + Worker dipertimbangkan, ditolak karena menambah konfigurasi
  route dan dua pipeline deploy.

### 2.2 Simulasi sebagai paket TypeScript murni

- `packages/sim` tanpa dependensi DOM/WebGL; dipakai client, Durable Object, dan test.
- Fixed-timestep 120 Hz, matematika deterministik (hindari `Math.random`
  langsung; pakai PRNG ber-seed).
- Ini yang membuat netcode, replay, tantangan harian, dan unit test bisa jalan.

### 2.3 Renderer: Three.js modular

- Dibutuhkan untuk 3 POV kamera dan meja 3D sederhana.
- Impor per modul (tree-shaking) → perkiraan 120–140 kB gzip untuk bagian Three.js
  (WebGLRenderer menarik sebagian besar inti). Diukur di tahap Fondasi; bila melebihi
  budget chunk game, pertimbangkan renderer WebGL ringan (misalnya OGL).
- Karakter sebagai sprite billboard (bukan model 3D) → ringan dan sesuai gaya flat.
- Alternatif: renderer Canvas 2D buatan sendiri (lebih kecil) — ditolak karena
  POV orang pertama dan Siaran TV butuh proyeksi 3D yang benar.
- Bundle game dimuat setelah menu tampil, sehingga JS awal tetap ≤ 150 kB.

### 2.4 UI menu tanpa framework berat

- Preact (≈ 4 kB) dengan hooks untuk menu, pengaturan, HUD. React ditolak karena
  ukurannya untuk kebutuhan menu yang sederhana; signals tidak diperlukan.
- HUD di-render ulang hanya saat nilainya berubah (kunci ringkas per frame), bukan
  tiap frame.
- Tema dipasang oleh `/theme.js` (file kecil sinkron di `<head>`) sehingga CSP tidak
  butuh `unsafe-inline` maupun hash.
- Styling: CSS biasa dengan token (`DESIGN.md`), tanpa Tailwind runtime.

### 2.5 Netcode

- Client mengirim **input terbaru** (posisi bat, arah, spin, tenaga, servis, waktu tap)
  30 kali/detik dalam pesan biner 21 byte, bersama `viewTick` = tick server yang
  sedang ia lihat.
- Server mensimulasikan 120 Hz dan mengirim snapshot 30 Hz (keadaan penuh, ±64 byte +
  event pertandingan).
- Client: jam disinkronkan gaya NTP (sampel RTT terkecil), tampilan 100 ms di belakang
  server dengan interpolasi linier, bat sendiri diprediksi lokal dengan batas
  kecepatan yang sama dengan server.
- **Kompensasi lag:** saat bola tiba di titik pukul seorang pemain, server menunggu
  (maks 300 ms) input pemain itu yang `viewTick`-nya sudah melewati tick tersebut,
  menilai pukulan dengan posisi bat yang dilihat pemain (dibatasi kecepatan bat
  maksimum), lalu memundurkan bola ke tick pukulan dan memajukannya kembali ke saat
  ini. Mode lokal memakai jalur kode yang sama tanpa jeda.
- Mode Timing Smash: waktu tap dalam ms simulasi menurut tampilan pemain; server
  menolak tap di masa depan atau lebih tua dari 600 ms dan menentukan
  PERFECT/GREAT/... sendiri.
- Koneksi mati diam-diam ditangani dua sisi: server memutus pemain yang diam > 5 detik,
  client menyambung ulang bila tidak menerima apa pun > 4,5 detik.
- WebSocket Hibernation API supaya biaya Durable Object tetap rendah saat room diam.

## 3. Struktur folder

```
apps/web            frontend (Vite + Preact + Three.js)
  src/ui            menu, pengaturan, HUD
  src/game          renderer, kamera POV, input, audio
  src/net           klien WebSocket, prediksi, interpolasi
  src/i18n          id.ts, en.ts (kunci dicek sama oleh test)
  src/state         pengaturan & statistik di localStorage
  build/            plugin Vite: service worker, _headers, robots.txt per situs
  public/           manifest PWA, ikon, theme.js
worker/             Cloudflare Worker + Durable Object Room, Matchmaker, Leaderboard
  src/*-core.ts     logika murni (RoomCore, MatchmakerCore, LeaderboardCore), dites tanpa runtime
  stress/           uji beban server (pnpm test:stress)
scripts/            budget ukuran, uji beban jaringan (stress-online.mjs)
packages/sim        fisika, aturan skor, AI, penilaian timing, Gamble (TS murni)
  stress/           uji beban simulasi (ribuan pertandingan acak)
packages/protocol   skema pesan + encoder/decoder biner (dipakai client & worker)
e2e/                test Playwright
docs/               PRD, desain, arsitektur, QA, security, deploy
```

## 4. Dependensi (rencana)

| Paket | Alasan | Perkiraan ukuran |
|-------|--------|------------------|
| `three` | Render 3D + kamera POV | ~120–140 kB gzip (modular, lazy) |
| `preact` | UI menu ringan | ~4 kB |
| `@fontsource/anton`, `@fontsource/inter` | Font OFL self-host (subset Latin) | ±65 kB woff2 |
| `vite`, `@preact/preset-vite`, `typescript`, `vitest`, `@playwright/test`, `@biomejs/biome` | Build, test, lint | dev saja |
| `wrangler`, `@cloudflare/workers-types` | Dev lokal & deploy Cloudflare | dev saja |

Yang sengaja **tidak** dipakai: `zod` (validasi pesan ditulis manual di
`packages/protocol`, lebih kecil dan dites), `vite-plugin-pwa`/Workbox (service worker
±40 baris dibuat plugin sendiri), file audio dan sprite (efek suara disintesis Web
Audio, robot digambar Canvas 2D).

Ukuran build saat ini: JS awal ±23 kB gzip, chunk game ±141 kB, font 65 kB, Worker
±21 kB (cek: `pnpm build && pnpm size`).

Setiap dependency baru di luar daftar ini wajib dijelaskan di PR.

## 5. Environment

| Environment | Branch | URL |
|-------------|--------|-----|
| Lokal | — | `localhost:5173` (frontend), `wrangler dev` (worker) |
| Development | `development` | `https://pinkponk-dev.panduarah.my.id` |
| Produksi | `production` | `https://pinkponk.panduarah.my.id` |
| PR | PR ke `development` | tidak di-deploy; diuji dengan `wrangler dev` di CI |

## 6. Batas dan biaya Cloudflare (perkiraan)

Angka di bawah perlu dicek ulang di halaman pricing Cloudflare saat implementasi.

- Workers Free: ±100.000 request/hari. Durable Object (SQLite-backed) tersedia di
  paket Free dengan kuota request dan durasi (GB-detik) harian.
- Pesan WebSocket **masuk** ditagih sebagai request dengan rasio 20 pesan = 1 request;
  pesan keluar (snapshot) tidak ditagih per pesan.
- Perkiraan satu pertandingan online 10 menit: 2 pemain × 30 pesan/detik × 600 detik
  = 36.000 pesan ≈ 1.800 request, ditambah durasi Durable Object selama room aktif
  (room tidak bisa hibernate selama simulasi berjalan).
- Artinya paket Free cukup untuk pengembangan dan uji coba (puluhan pertandingan
  online per hari), tetapi untuk publik perlu Workers Paid ($5/bulan) — keputusan
  pemilik. Mode offline (Vs AI, Timing vs AI, Lokal) tidak memakai kuota ini.
- Hibernation dipakai saat room menunggu pemain atau sedang di layar hasil.
