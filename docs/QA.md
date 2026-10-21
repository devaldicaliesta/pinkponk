# QA — PinkPonk

## 1. Lapisan test

| Lapisan | Alat | Cakupan |
|---------|------|---------|
| Unit | Vitest | `packages/sim` (fisika, skor, AI, timing), `packages/protocol` (encode/decode, validasi) |
| Room online | Vitest (koneksi dan jam palsu terhadap `RoomCore`) | Buat room, join, pesan rusak/terlalu besar ditolak, rate limit, jeda/sambung ulang/WO, jeda atas permintaan, koneksi diam, rematch |
| E2E | Playwright | Alur utama di browser (§3) |
| Visual | Playwright screenshot | Layar judul, menu, HUD, hasil — tema gelap dan terang, HP dan desktop |
| Ukuran | `scripts/check-size.mjs` (CI) | Budget di §4 |
| Performa | Lighthouse + FPS (manual sebelum rilis; otomatisasi = tindak lanjut) | §4 |
| Jaringan | Playwright + throttling / proxy latensi | RTT 150 ms, loss 2%, putus-sambung |
| Uji beban | `pnpm test:stress` + `pnpm test:load` | §6 |

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
- Gamble: stack maks 6, roulette hanya hasil sah dan semua irisan muncul, kemampuan
  habis tepat waktu, poin ganda tidak melewati akhir game, perisai menyelamatkan sekali,
  tombol diabaikan di mode biasa, AI vs AI gamble deterministik, bola hantu menyulitkan AI.
- Golden point di 14–14.
- Gamble di Timing Smash: jendela timing melebar/menyempit sesuai kemampuan, tap 140 ms
  terlambat GOOD biasa → GREAT dengan Bat Raksasa, AI vs AI timing gamble selesai.

## 3. Skenario E2E (Playwright)

| # | Skenario | Catatan teknis |
|---|----------|----------------|
| E1 | Pertama kali masuk → isi nickname → tersimpan setelah reload | Cek `localStorage` |
| E2 | Vs AI Mudah sampai game selesai | Hook test (`?seed=`, percepat waktu) hanya ada di build test, tidak ikut build produksi |
| E3 | Ganti 4 POV saat bermain | POV tersimpan di pengaturan |
| E4 | Lokal 2 pemain: input keyboard dua sisi | Viewport desktop saja |
| E5 | Online 1v1: dua browser context, buat room → join lewat link → main 1 poin | Worker lokal (`wrangler dev`) |
| E6 | Online: putuskan satu context → sambung ulang < 30 detik → lanjut | `context.setOffline` |
| E7 | Timing Smash: tap tepat pada waktu ideal → PERFECT; telat 200 ms → LATE; tidak tap → MISS | Waktu disimulasikan lewat jam test, bukan `sleep` |
| E8 | Toggle tema gelap/terang/otomatis tersimpan dan tanpa kedipan saat reload | |
| E9 | PWA: setelah kunjungan pertama, Vs AI bisa dimulai saat offline | Mode online nonaktif saat offline |
| E11 | Jeda online: kedua pemain berhenti bersamaan lalu lanjut | |
| E12 | Jeda di mode lokal menghentikan simulasi | Juga di viewport HP |
| E10 | Nickname berisi `<script>` ditolak/di-escape di UI dan di layar lawan | |
| G1 | Gamble: stack penuh → tombol GAMBLE → roulette → kemampuan aktif | Juga di viewport HP |
| G2 | Gamble vs AI sampai selesai → hadiah XP → level tampil di menu | |
| G3 | Peringkat: tab Global dan Pribadi | Server lokal boleh kosong |
| G4 | Cari lawan acak: dua pemain dipasangkan ke pertandingan gamble yang sama | |
| G5 | Cari lawan acak bisa dibatalkan | |
| G6 | Gamble dengan gaya Timing Smash: roulette lalu tap dinilai | Juga di viewport HP |
| H1 | Label match point di bagian atas layar, tidak menutupi tengah | Juga di viewport HP |

Status: 29 test E2E lulus (proyek `desktop` semua test, `mobile` test bertanda
`@mobile`). Browser di CI: Chromium dengan WebGL perangkat lunak (SwiftShader);
WebKit/Firefox ditambahkan setelah deploy pertama. Uji visual (screenshot) tema
gelap/terang dilakukan manual; otomatisasi = tindak lanjut.

## 4. Budget performa (gagal CI jika dilanggar)

- JS awal (menu) ≤ 150 kB gzip; chunk game ≤ 200 kB gzip.
- Font ≤ 80 kB, sprite karakter ≤ 120 kB (satu atlas, warna lewat recolor).
- Total unduhan sampai servis pertama ≤ 550 kB (JS + font + sprite). Efek suara
  (≤ 80 kB) dimuat setelah interaksi pertama dan tidak dihitung di sini.
- Saat ini: JS awal 28 kB, chunk game 141 kB, font 65 kB, total 239 kB.
- Lighthouse mobile (manual): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95.
- FPS (manual): rata-rata ≥ 55 di HP kelas menengah; game otomatis turun ke grafis
  rendah bila < 50 FPS selama 3 detik.

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
- [ ] `pinkponk-dev.panduarah.my.id` tidak terindeks, `pinkponk.panduarah.my.id` punya OG image.

## 6. Uji beban (stress test)

### 6.1 Tanpa jaringan — `pnpm test:stress` (±4 menit, CI: PR ke `production` + malam)

| Uji | Isi | Hasil terakhir |
|-----|-----|----------------|
| Simulasi | 200 pertandingan acak (mode, gamble, tingkat AI; 40% memakai input sampah: NaN, ±∞, 1e308, tick masa depan) — tiap tick dicek bola/bat/stack sah; semua harus selesai | 401 menit simulasi dalam 176 dtk CPU (137× waktu nyata), 1.153 kemampuan dipakai |
| Replay | 20 pertandingan diulang → hasil identik | lulus |
| Pemain diam | Kedua pemain tidak pernah memukul → pertandingan tetap selesai | lulus (setelah golden point) |
| Room | 200 room × 30 detik, input 30 Hz + ping, ±60 tick/detik | 4,1–4,4 ms CPU per room per detik, 30 snapshot/dtk per klien, 0 koneksi putus |
| Klien jahil | 5.000 ping beruntun → diputus `rate-limited`, lawan tidak terganggu (dijeda menunggu) | lulus |
| Serbuan koneksi | 1.000 koneksi ke satu room → maks 6 diterima | lulus |
| Antrean | 10.000 permintaan acak + keluar acak → pasangan selalu satu mode, tidak ada tiket ganda | 4.998 pasangan dalam ±0,5 dtk |
| Leaderboard | 20.000 hasil, 20% "farming" pasangan sama | 4.117 ditolak batas pasangan, urutan tetap benar |
| Fuzz protokol | 100.000 pesan biner/JSON acak ke semua parser | tidak ada exception |

Temuan uji beban yang sudah diperbaiki:
- **Game tanpa akhir**: dua pemain yang sama-sama selalu memenangkan servis (misalnya
  dua tab AFK) membuat deuce tak berujung (skor 59–60 setelah 20 menit) → golden point
  14–14 dan room dihentikan setelah 3 menit kedua pemain tidak aktif.
- **Bat keluar batas** di mode Timing saat bola melebar → posisi dijepit ke ±1,1 m.
- **Lonjakan pembaca leaderboard** (50 permintaan bersamaan masing-masing ke DO) →
  permintaan bersamaan digabung (satu panggilan DO per isolate) + cache edge 30 detik.
- **Koneksi gagal permanen** di tengah pertandingan menampilkan "Menyambung ulang…"
  selamanya → kini muncul pesan jelas + tombol Menu (atau Muat ulang bila versi lama).

### 6.2 Jaringan sungguhan — `pnpm test:load`

`scripts/stress-online.mjs` membuat N room lewat HTTP, 2 bot WebSocket per room (30 Hz
saat reli, 10 Hz di luar reli, ping tiap detik), bot antrean cari lawan, dan pembaca
leaderboard; melaporkan snapshot/detik, RTT p50/p95, kode penutupan, dan status HTTP.
Default ke `http://localhost:8787` (`wrangler dev`); server publik wajib `--yes` dan
rate limit per IP memang akan menolak sebagian besar bot (perlindungan bekerja).

Catatan pengukuran lokal: `wrangler dev` menjalankan **semua** room dalam satu proses
`workerd`, sedangkan di Cloudflare tiap room adalah Durable Object terpisah. Batas lokal
(lihat hasil di bawah) adalah batas satu thread mesin pengembang, bukan kapasitas
produksi. Untuk produksi, angka yang relevan adalah biaya per room (§6.1: ±4 ms CPU per
detik) dan jumlah pesan masuk per room (±60/detik saat reli).

Hasil lokal (mesin 4 core, satu `workerd`, 15 detik per putaran, + 10 bot antrean dan
50 pembaca leaderboard bersamaan):

| Room | Sebelum optimasi | Sesudah optimasi |
|------|------------------|------------------|
| 5 | 34,6 snapshot/dtk, RTT p50 6 ms | — |
| 10 | — | 34,5 snapshot/dtk, RTT p50 3,8 ms / p95 15 ms |
| 15 | **0,8 snapshot/dtk, RTT 1,6 dtk (ambruk)** | 34,6 snapshot/dtk, RTT p50 7,6 ms / p95 43 ms |
| 20 | — | 21,7 snapshot/dtk, RTT p95 3,5 dtk (mulai jenuh) |
| 15, tanpa input | 34,3 snapshot/dtk | — |

Dari baris terakhir terlihat bebannya adalah **jumlah pesan masuk**, bukan simulasi.
Optimasi yang diterapkan: client mengirim input 30 Hz hanya saat reli (di luar reli
10 Hz kecuali ada aksi/gerakan) dan Durable Object tidak lagi mendeserialisasi
attachment socket di setiap pesan. Ini juga memangkas biaya request Durable Object.
Semua bot antrean selalu dipasangkan dan semua baca leaderboard berstatus 200.

## 7. Pelaporan bug

Issue GitHub dengan template: langkah, hasil yang diharapkan, hasil aktual,
perangkat/browser, tema, mode, POV, dan (untuk online) ping yang terlihat.
