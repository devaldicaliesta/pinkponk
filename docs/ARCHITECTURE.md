# Arsitektur — PinkPonk

## 1. Gambaran

```
Browser (HP/desktop)
  ├─ UI menu (DOM ringan)          ┐
  ├─ Renderer game (WebGL)         │  satu bundle Vite, game di-lazy-load
  ├─ Simulasi (TS murni)           │
  └─ Klien jaringan (WebSocket)    ┘
          │  wss://pinkponk.my.id/ws/room/KODE
          ▼
Cloudflare Worker (satu Worker)
  ├─ Static Assets (hasil build frontend)
  ├─ GET /ws/room/:code  → upgrade ke Durable Object
  └─ POST /api/room      → buat kode room
          ▼
Durable Object "Room" (satu instance per room)
  └─ menjalankan paket `sim` yang sama dengan client (server-authoritative)
```

Tidak ada database. State room hanya hidup di memori Durable Object dan hilang
saat room kosong. Data pemain (nickname, pengaturan, statistik) ada di
`localStorage`.

## 2. Keputusan utama

### 2.1 Satu Worker + Static Assets (bukan Pages + Worker terpisah)

- Frontend, API, dan WebSocket satu origin → CSP sederhana, tanpa CORS.
- Satu kali deploy per environment; Durable Object harus di Worker juga.
- Preview per branch tetap bisa lewat Worker versions/preview URL.
- Alternatif Pages + Worker dipertimbangkan, ditolak karena menambah konfigurasi
  route dan dua pipeline deploy.

### 2.2 Simulasi sebagai paket TypeScript murni

- `packages/sim` tanpa dependensi DOM/WebGL; dipakai client, Durable Object, dan test.
- Fixed-timestep 120 Hz, matematika deterministik (hindari `Math.random`
  langsung; pakai PRNG ber-seed).
- Ini yang membuat netcode, replay, tantangan harian, dan unit test bisa jalan.

### 2.3 Renderer: Three.js modular

- Dibutuhkan untuk 3 POV kamera dan meja 3D sederhana.
- Impor per modul (tree-shaking) → target ≤ 110 kB gzip untuk bagian Three.js.
- Karakter sebagai sprite billboard (bukan model 3D) → ringan dan sesuai gaya flat.
- Alternatif: renderer Canvas 2D buatan sendiri (lebih kecil) — ditolak karena
  POV orang pertama dan Siaran TV butuh proyeksi 3D yang benar.
- Bundle game dimuat setelah menu tampil, sehingga JS awal tetap ≤ 150 kB.

### 2.4 UI menu tanpa framework berat

- Preact (≈ 4 kB) + signals untuk menu, pengaturan, HUD. React ditolak karena
  ukurannya untuk kebutuhan menu yang sederhana.
- Styling: CSS biasa dengan token (`DESIGN.md`), tanpa Tailwind runtime.

### 2.5 Netcode

- Client mengirim **input** (posisi bat, ayunan, tap) dengan nomor tick.
- Server mensimulasikan 120 Hz, mengirim snapshot 30 Hz (delta + kuantisasi,
  format biner kecil).
- Client: prediksi bat sendiri, interpolasi bola/lawan dengan buffer ~100 ms,
  rekonsiliasi saat snapshot berbeda.
- Mode Timing Smash: server mencatat waktu ideal kontak; tap client diberi
  cap waktu yang dikonversi lewat offset jam (ping/pong gaya NTP), lalu dibatasi
  ±RTT/2. Server yang menentukan PERFECT/GREAT/....
- WebSocket Hibernation API supaya biaya Durable Object tetap rendah saat room diam.

## 3. Struktur folder

```
apps/web            frontend (Vite + Preact + Three.js)
  src/ui            menu, pengaturan, HUD
  src/game          renderer, kamera POV, input, audio
  src/net           klien WebSocket, prediksi, interpolasi
  src/i18n          id.json, en.json
  public/           manifest PWA, ikon, font, sprite
worker/             Cloudflare Worker + Durable Object Room
packages/sim        fisika, aturan skor, AI, penilaian timing (TS murni)
packages/protocol   skema pesan + encoder/decoder biner (dipakai client & worker)
e2e/                test Playwright
docs/               PRD, desain, arsitektur, QA, security, deploy
```

## 4. Dependensi (rencana)

| Paket | Alasan | Perkiraan ukuran |
|-------|--------|------------------|
| `three` | Render 3D + kamera POV | ≤ 110 kB gzip (modular) |
| `preact`, `@preact/signals` | UI menu ringan | ~6 kB |
| `zod` (hanya di worker) | Validasi pesan masuk | tidak masuk bundle client |
| `vite`, `typescript`, `vitest`, `@playwright/test`, `@biomejs/biome` | Build, test, lint | dev saja |
| `wrangler` | Deploy Cloudflare | dev saja |
| `vite-plugin-pwa` | Service worker PWA | dev, output ~5 kB |

Setiap dependency baru di luar daftar ini wajib dijelaskan di PR.

## 5. Environment

| Environment | Branch | URL |
|-------------|--------|-----|
| Lokal | — | `localhost:5173` (frontend), `wrangler dev` (worker) |
| Development | `development` | `https://dev.pinkponk.my.id` |
| Produksi | `production` | `https://pinkponk.my.id` |
| Preview PR | PR ke `development` | URL preview Workers |

## 6. Batas dan biaya Cloudflare (perkiraan)

- Workers Free: 100.000 request/hari; Durable Object (SQLite-backed) tersedia di
  paket Free dengan kuota harian. Cukup untuk tahap awal; dipantau lewat dashboard.
- Pesan WebSocket dihitung sebagai request oleh Durable Object → snapshot 30 Hz
  dikirim dalam satu pesan per tick untuk kedua pemain, dan Hibernation dipakai
  saat room diam.
- Jika kuota mendekati batas: naikkan ke Workers Paid ($5/bulan) — keputusan pemilik.
