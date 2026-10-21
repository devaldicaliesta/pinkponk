# PRD — PinkPonk

Status: draf v0.1 untuk disetujui · Domain: `pinkponk.my.id`

## 1. Ringkasan

PinkPonk adalah game ping pong berbasis web yang langsung bisa dimainkan di
browser HP maupun desktop, tanpa instal dan tanpa akun. Identitasnya: karakter
flat bergaya rubber-hose, warna neon pink, serta tema gelap dan terang. Semua
berjalan di Cloudflare tanpa database.

## 2. Tujuan

| # | Tujuan | Ukuran |
|---|--------|--------|
| G1 | Bisa langsung main dalam < 10 detik sejak halaman dibuka | Waktu dari load sampai servis pertama (diukur di E2E) |
| G2 | Terasa responsif di HP kelas menengah | 60 fps, latensi input→visual < 50 ms |
| G3 | Multiplayer online tanpa daftar akun | Room bisa dibuat dan diikuti lewat link dalam ≤ 2 langkah |
| G4 | Ringan | JS awal ≤ 150 kB gzip, Lighthouse mobile ≥ 90 |

## 3. Pengguna

- **Pemain kasual (HP):** main sebentar sambil menunggu; tap/swipe.
- **Teman yang menantang teman:** kirim link room lewat chat, main 1v1.
- **Pemain kompetitif ringan:** mengejar akurasi PERFECT di mode Timing Smash.

## 4. Non-goal (tidak dikerjakan)

- Akun, login, leaderboard global, dan penyimpanan server permanen (tidak ada DB).
- Matchmaking acak dengan orang asing (hanya lewat kode/link room).
- Chat teks bebas (hanya reaksi emoji yang sudah ditentukan, untuk mencegah pelecehan).
- Pembelian dalam aplikasi atau iklan.
- Aplikasi native; cukup PWA.

## 5. Alur utama

1. Buka `pinkponk.my.id` → layar judul.
2. Isi nickname saat pertama kali masuk (tersimpan di perangkat).
3. Pilih mode → pilih opsi (tingkat AI, best of, POV) → hitung mundur 3-2-1.
4. Bermain → layar hasil → Rematch / Menu / Bagikan kartu hasil.

## 6. Mekanik inti (mode Vs AI, Lokal, Online)

### 6.1 Fisika

- Simulasi fixed-timestep 120 Hz, terpisah dari render (render mengikuti refresh layar).
- Satuan meter. Meja 2,74 × 1,525 m, net 15,25 cm, bola 40 mm (dimensi resmi,
  supaya rasa permainan wajar).
- Gaya: gravitasi, hambatan udara sederhana, efek Magnus dari spin.
- Pantulan meja dan bat memakai koefisien restitusi + gesekan yang mengubah spin.
- Bola menyentuh net: jika lewat dan sah → lanjut; saat servis → *let* (diulang).
- Simulasi deterministik: input yang sama menghasilkan hasil yang sama
  (dibutuhkan untuk netcode, replay, dan test).

### 6.2 Memukul (ayunan)

- Posisi bat mengikuti pointer/jari di bidang pemain.
- Kecepatan dan arah gerakan sesaat sebelum kontak menentukan:
  - kecepatan bola (dibatasi maksimum),
  - spin: gerakan ke atas → topspin, ke bawah → backspin, menyamping → sidespin.
- Sudut bat otomatis (assist) supaya pemain HP tidak perlu mengatur kemiringan.
- Keyboard: panah/WASD untuk posisi, Spasi untuk ayunan, Shift + arah untuk spin.
- Gamepad (opsional): stik kiri posisi, tombol untuk ayunan + spin.

### 6.3 Servis

- Lempar: tahan → bola naik; lepas/ayun → pukul.
- Servis harus memantul sekali di sisi sendiri, lalu sekali di sisi lawan.
- Bot dan pemain sama-sama mengikuti aturan ini.

### 6.4 Aturan skor (disederhanakan dari ITTF)

- Game sampai 11 poin; pada 10–10 (deuce) wajib unggul 2 poin.
- Servis bergantian setiap 2 poin, dan setiap 1 poin saat deuce.
- Pertandingan best of 1 / 3 / 5 (default 3).
- Pemain bertukar sisi di antara game (secara visual kamera tetap dari sisi pemain).
- Poin hilang jika: bola tidak masuk meja lawan, memantul dua kali di sisi sendiri,
  menyentuh sisi sendiri sebelum dikembalikan (volley tidak sah), atau servis gagal.

## 7. Mode main

| # | Mode | Ringkasan | Prioritas |
|---|------|-----------|-----------|
| 1 | **Vs AI** | Mudah / Sedang / Sulit. Bisa offline (PWA). | MVP |
| 2 | **Lokal 2 pemain** | Satu perangkat, di browser desktop: keyboard dibagi (WASD vs panah). Versi layar sentuh HP/tablet ada di backlog. | MVP |
| 3 | **Online 1v1** | Buat room → kode 6 karakter + link. Server-authoritative di Durable Object. | MVP |
| 4 | **Timing Smash** | Hanya klik/tap; hasil pukulan ditentukan ketepatan timing (lihat §8). Vs AI dan online. | MVP |

### 7.1 Tingkat AI

AI memakai fisika yang sama dengan pemain (tidak curang). Tingkat kesulitan diatur oleh:

| Parameter | Mudah | Sedang | Sulit |
|-----------|-------|--------|-------|
| Waktu reaksi | 350 ms | 220 ms | 140 ms |
| Galat prediksi titik jatuh | ± 25 cm | ± 12 cm | ± 5 cm |
| Kecepatan gerak maks | 2,5 m/s | 3,5 m/s | 4,5 m/s |
| Pemakaian spin/smash | jarang | sedang | sering |

Nilai di atas adalah angka awal untuk di-tuning lewat playtest.

### 7.2 Online 1v1

- Room: kode acak 6 karakter (alfabet tanpa huruf ambigu, misalnya tanpa O/0/I/1)
  + link `pinkponk.my.id/r/KODE`.
- Server (Durable Object per room) menjalankan simulasi resmi; client mengirim input saja.
- Client memakai prediksi untuk bat sendiri dan interpolasi untuk bola/lawan.
- Indikator ping (hijau < 80 ms, kuning < 150 ms, merah ≥ 150 ms).
- Putus koneksi: pertandingan dijeda hingga 30 detik dan client mencoba menyambung
  ulang otomatis; lewat dari itu lawan menang walkover.
- Room hilang otomatis saat kosong; tidak ada data yang disimpan permanen.
- Penonton (v1.1): maksimal 8 per room, hanya menerima state.

## 8. Mode Timing Smash

Pemain tidak mengayun; cukup klik/tap saat bola masuk zona pukul. Bat bergerak
otomatis ke jalur bola.

### 8.1 Penilaian timing

Selisih = waktu tap − waktu ideal (bola tepat di titik pukul).

| Hasil | Jendela awal | Efek |
|-------|--------------|------|
| **PERFECT** | ≤ ±50 ms | **SMASH**: bola sangat cepat dan menukik, hit-stop 60 ms + slow-mo singkat |
| **GREAT** | ≤ ±100 ms | Drive kuat; arah ditentukan posisi tap (kiri/tengah/kanan) |
| **GOOD** | ≤ ±160 ms | Pukulan aman (lob), mudah diserang balik |
| **EARLY / LATE** | ≤ ±250 ms | Pukulan lemah; peluang 40% nyangkut net atau out |
| **MISS** | tidak tap / di luar ±250 ms | Kehilangan poin |

- Tap lebih dari satu kali dalam satu jendela: hanya tap pertama yang dihitung.
- **Hold → lepas** (v1.1): menahan lalu melepas di jendela PERFECT/GREAT
  menambahkan spin.
- **Combo:** 3 PERFECT beruntun → **Fever** selama 8 detik: smash lebih kuat
  dan jejak bola berupa coretan neon.
- Kecepatan bola naik 4% setiap pukulan dalam satu reli (maks +60%); lebar
  jendela timing tetap, sehingga tantangannya ada pada kecepatan baca.

### 8.2 Penanda visual dan audio

- Cincin neon menyusut di titik pukul; tepat menyentuh lingkaran dalam = PERFECT.
- Label hasil (PERFECT/GREAT/...) muncul sesaat di dekat bat.
- Bunyi "tik" metronom saat bola memantul di meja, sebagai penanda alternatif
  bagi pemain yang tidak bisa mengandalkan visual.

### 8.3 Kalibrasi latensi

- Di Pengaturan: tap mengikuti ketukan 8 kali → rata-rata selisih menjadi offset
  (−150…+150 ms), disimpan di perangkat.
- Online: server menilai timing berdasarkan waktu server; waktu tap client
  dikonversi dengan offset jam (sinkronisasi gaya NTP) dan dibatasi oleh RTT
  terukur. Client tidak pernah mengirim hasil "PERFECT".

## 9. Nickname

- Diminta saat pertama kali masuk; bisa diganti di Pengaturan.
- 3–16 karakter; huruf, angka, spasi tunggal, `_` dan `-`; spasi di awal/akhir dipangkas.
- Filter kata kasar (daftar ID + EN) di client dan server.
- Selalu dirender sebagai teks, tidak pernah sebagai HTML.
- Tidak unik secara global (tidak ada DB); di room online, nickname kembar diberi
  akhiran `#2`.

## 10. Tampilan POV (bisa diganti saat bermain, tombol `V`/ikon kamera)

1. **Klasik** — kamera tinggi di belakang pemain, meja terlihat utuh (default HP).
2. **Orang pertama** — kamera di belakang bat; yang terlihat hanya tangan + bat
   bergaya karakter.
3. **Siaran TV** — kamera dari samping meja, mengikuti reli dengan gerakan halus;
   kedua karakter terlihat penuh (default desktop).

Pilihan terakhir disimpan di perangkat. Saat *reduced motion* aktif, POV Siaran
TV tidak bergerak mengikuti bola.

## 11. Karakter

- Ilustrasi flat 2D orisinal: garis hitam tebal, anggota badan lentur
  (rubber-hose), wajah sederhana, warna terbatas.
- **Dilarang** memakai logo atau merek nyata (Nike, Adidas, Butterfly, dll.) atau
  bentuk yang menyerupainya. Baju memakai emblem PinkPonk orisinal atau polos.
- Kustomisasi (MVP): warna baju, warna headband, warna kulit (6 pilihan beragam),
  warna bat.
- Animasi: idle, siap, pukul forehand, pukul backhand, smash, menang, kalah
  (dengan squash & stretch).
- Dirender sebagai sprite 2D (billboard) di dalam scene 2.5D.

## 12. Tampilan dan tema

- Tema **Gelap**, **Terang**, dan **Ikuti sistem**; default ikut sistem.
- Aksen neon pink + lime; detail di `docs/DESIGN.md`.

## 13. Fitur pendukung

| Fitur | Prioritas |
|-------|-----------|
| Tutorial singkat (ayunan + timing), bisa dilewati | MVP |
| Hitung mundur 3-2-1 sebelum servis pertama | MVP |
| Pause (offline), Rematch, kembali ke menu | MVP |
| Suara + getaran (haptic) dengan sakelar masing-masing | MVP |
| Pengaturan grafis: Otomatis / Tinggi / Rendah | MVP |
| PWA: bisa dipasang ke layar utama, Vs AI dan Timing Smash bisa offline | MVP |
| Bahasa Indonesia + Inggris | MVP |
| Reaksi emoji cepat (6 pilihan tetap) di online | v1.1 |
| Mode penonton | v1.1 |
| Replay smash terakhir (slow-mo) | v1.1 |
| Statistik lokal: menang/kalah, reli terpanjang, akurasi PERFECT | v1.1 |
| Tantangan harian (seed dari tanggal, tanpa server) | v1.1 |
| Kartu hasil yang bisa dibagikan (gambar dibuat di browser) | v1.1 |
| Turnamen bracket lokal (4/8 pemain bergiliran) | Backlog |
| Skin meja/bat/baju yang terbuka lewat pencapaian lokal | Backlog |
| Mode latihan (mesin pelontar bola) | Backlog |
| Lokal 2 pemain di HP/tablet (layar dibagi, multi-touch) | Backlog |

## 14. Aksesibilitas

- Kontras teks UI minimal WCAG AA di kedua tema.
- Mode buta warna: penanda timing juga dibedakan dengan bentuk, bukan hanya warna.
- *Reduced motion*: matikan screen shake, slow-mo, dan kamera bergerak.
- Target sentuh ≥ 44 × 44 px; semua menu bisa dioperasikan dengan keyboard.

## 15. Kebutuhan non-fungsional

| Area | Target |
|------|--------|
| Ukuran | JS awal ≤ 150 kB gzip; total sebelum bisa main ≤ 400 kB |
| Frame rate | 60 fps di HP kelas menengah (acuan: Android ~Rp2–3 juta, 2023) |
| Latensi input | Input → perubahan visual < 50 ms |
| Lighthouse mobile | Performance ≥ 90, Accessibility ≥ 95 |
| Jaringan | Online tetap bisa dimainkan pada RTT 150 ms dan packet loss 2% |
| Browser | Chrome/Edge/Firefox/Safari dua versi terakhir; iOS Safari 16+ |

## 16. Metrik sukses (tanpa DB)

Diukur lewat Cloudflare Web Analytics (tanpa cookie) dan log Worker yang diagregasi:

- Persentase kunjungan yang memulai pertandingan (target ≥ 60%).
- Persentase room online yang berakhir dengan pertandingan selesai (target ≥ 70%).
- Error JavaScript per sesi (target < 1%).

## 17. Rilis bertahap

1. **Fondasi:** scaffold, CI/CD, tema, deploy kosong ke `dev.pinkponk.my.id`.
2. **Vs AI:** fisika, aturan skor, AI, POV Klasik.
3. **Timing Smash** vs AI + kalibrasi.
4. **Karakter + 3 POV** + kustomisasi.
5. **Lokal 2 pemain.**
6. **Online 1v1** (ayunan dan timing).
7. **PWA, i18n, aksesibilitas, polish** → rilis produksi.
8. v1.1 sesuai tabel §13.

## 18. Keputusan

| Tanggal | Keputusan |
|---------|-----------|
| 2026-10-21 | Satu Worker + Static Assets (bukan Pages + Worker terpisah) |
| 2026-10-21 | Subdomain development: `dev.pinkponk.my.id` |
| 2026-10-21 | Lokal 2 pemain di MVP hanya untuk browser desktop; versi HP ke backlog |
| 2026-10-21 | Audio hanya efek suara, tanpa musik latar |
| 2026-10-21 | Logo dibuat sendiri: `docs/brand/` (lihat `DESIGN.md` §10) |
