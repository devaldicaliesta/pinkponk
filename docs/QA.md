# QA — PinkPonk

## 1. Lapisan test

| Lapisan | Alat | Cakupan |
|---------|------|---------|
| Unit | Vitest | `packages/sim` (fisika, skor, AI, timing), `packages/protocol` (encode/decode, validasi) |
| Integrasi worker | Vitest + `@cloudflare/vitest-pool-workers` | Buat room, join, pesan tidak valid ditolak, rate limit, room dihapus saat kosong |
| E2E | Playwright | Alur utama di browser (§3) |
| Visual | Playwright screenshot | Layar judul, menu, HUD, hasil — tema gelap dan terang, HP dan desktop |
| Performa | Lighthouse CI + skrip FPS | Budget di §4 |
| Jaringan | Playwright + throttling / proxy latensi | RTT 150 ms, loss 2%, putus-sambung |

CI (`pnpm check`) wajib hijau sebelum merge: typecheck, lint (Biome), unit,
integrasi worker, budget ukuran bundle. E2E (frontend + `wrangler dev` lokal)
jalan di setiap PR ke `production` dan setiap malam di `development`.

## 2. Unit test wajib (`packages/sim`)

- Skor: 11 poin, deuce 10–10 sampai selisih 2, rotasi servis tiap 2 poin dan
  tiap 1 poin saat deuce, best of 1/3/5, volley dan pantulan ganda = poin lawan.
- Servis: harus memantul di sisi sendiri lalu sisi lawan; let saat menyentuh net.
- Fisika: pantulan meja mengubah spin sesuai arah; bola out terdeteksi; determinisme
  (dua simulasi dengan input sama → state identik setelah 10.000 tick).
- Timing: batas tepat tiap jendela (±50/±100/±160/±250 ms), hanya tap pertama
  yang dihitung, tap > 250 ms terlalu awal = MISS, offset kalibrasi diterapkan,
  combo → Fever.
- AI: parameter tiap tingkat dipakai; AI tidak pernah bergerak melebihi kecepatan maks.
- Nickname: panjang, karakter yang diizinkan, filter kata kasar, akhiran `#2`.

## 3. Skenario E2E (Playwright)

| # | Skenario | Catatan teknis |
|---|----------|----------------|
| E1 | Pertama kali masuk → isi nickname → tersimpan setelah reload | Cek `localStorage` |
| E2 | Vs AI Mudah sampai game selesai | Hook test (`?seed=`, percepat waktu) hanya ada di build test, tidak ikut build produksi |
| E3 | Ganti 3 POV saat bermain | Screenshot per POV |
| E4 | Lokal 2 pemain: input keyboard dua sisi | Viewport desktop saja |
| E5 | Online 1v1: dua browser context, buat room → join lewat link → main 1 poin | Worker lokal (`wrangler dev`) |
| E6 | Online: putuskan satu context → sambung ulang < 30 detik → lanjut | `context.setOffline` |
| E7 | Timing Smash: tap tepat pada waktu ideal → PERFECT; telat 200 ms → LATE; tidak tap → MISS | Waktu disimulasikan lewat jam test, bukan `sleep` |
| E8 | Toggle tema gelap/terang/otomatis tersimpan dan tanpa kedipan saat reload | |
| E9 | PWA: setelah kunjungan pertama, Vs AI bisa dimulai saat offline | |
| E10 | Nickname berisi `<script>` ditolak/di-escape di UI dan di layar lawan | |

Viewport: 390×844 (HP), 1440×900 (desktop). Browser: Chromium, WebKit, Firefox.

## 4. Budget performa (gagal CI jika dilanggar)

- JS awal (menu) ≤ 150 kB gzip; chunk game ≤ 200 kB gzip.
- Font ≤ 80 kB, sprite karakter ≤ 120 kB (satu atlas, warna lewat recolor).
- Total unduhan sampai servis pertama ≤ 550 kB (JS + font + sprite). Efek suara
  (≤ 80 kB) dimuat setelah interaksi pertama dan tidak dihitung di sini.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95.
- FPS rata-rata ≥ 55 di emulasi CPU 4× lebih lambat selama 30 detik reli bot vs bot.

## 5. Uji manual sebelum rilis produksi

Matriks perangkat minimal:
- Android kelas menengah (Chrome), iPhone (Safari), laptop (Chrome + Firefox),
  desktop dengan gamepad (opsional).

Checklist:
- [ ] Semua E2E hijau di commit yang akan dirilis.
- [ ] Main 3 pertandingan online antar dua perangkat berbeda jaringan (Wi-Fi vs 4G).
- [ ] Kalibrasi latensi dengan headset Bluetooth terasa memperbaiki timing.
- [ ] Tema gelap dan terang dicek di layar luar ruangan (kecerahan tinggi).
- [ ] Reduced motion mematikan shake/slow-mo.
- [ ] Tidak ada logo merek di aset mana pun.
- [ ] Header keamanan terpasang (cek securityheaders.com).
- [ ] `dev.pinkponk.my.id` tidak terindeks, `pinkponk.my.id` punya OG image.

## 6. Pelaporan bug

Issue GitHub dengan template: langkah, hasil yang diharapkan, hasil aktual,
perangkat/browser, tema, mode, POV, dan (untuk online) ping yang terlihat.
