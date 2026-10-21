# PRD — PinkPonk

Status: v0.3 — MVP + Gamble, peringkat, cari lawan acak di branch `development` · Domain: `pinkponk.panduarah.my.id`

## 1. Ringkasan

PinkPonk adalah game ping pong berbasis web yang langsung bisa dimainkan di
browser HP maupun desktop, tanpa instal dan tanpa akun. Identitasnya: karakter
robot maskot, warna neon pink, serta tema gelap dan terang. Semua berjalan di
Cloudflare tanpa database aplikasi; satu-satunya data server permanen adalah papan
peringkat online (ID hash, nickname, rating, menang/kalah).

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

- Akun dan login. Identitas peringkat cukup rahasia acak di perangkat (lihat §7.5).
- Penyimpanan server permanen selain papan peringkat (tidak ada DB aplikasi).
- Chat teks bebas (hanya reaksi emoji yang sudah ditentukan, untuk mencegah pelecehan).
- Pembelian dalam aplikasi atau iklan.
- Aplikasi native; cukup PWA.

## 5. Alur utama

1. Buka `pinkponk.panduarah.my.id` → layar judul.
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
- Bola menyentuh net lalu masuk: saat reli → lanjut; saat servis → *let* (diulang).
- Bola sengaja diperlambat: waktu fisika bola berjalan 0,72× waktu nyata
  (`BALL_TIME_SCALE`). Bentuk lintasan tetap seperti fisika asli, hanya lebih lama
  di udara sehingga nyaman di layar HP; gerak bat tetap waktu nyata.
- Kecepatan bola naik 2% setiap pukulan dalam satu reli (maks +25%).
- Simulasi deterministik: input yang sama menghasilkan hasil yang sama
  (dibutuhkan untuk netcode, replay, dan test).

### 6.2 Memukul (ayunan)

- Posisi bat (kiri-kanan) mengikuti pointer/jari; tinggi bat menyesuaikan bola
  otomatis (assist), jadi pemain HP cukup menggeser satu arah.
- Kecepatan dan arah gerakan sesaat sebelum kontak menentukan:
  - kecepatan bola (dibatasi maksimum),
  - spin: gerakan ke atas → topspin, ke bawah → backspin, menyamping → sidespin.
- Sudut bat otomatis (assist) supaya pemain HP tidak perlu mengatur kemiringan.
- Pukulan keras, bersudut tajam, atau kena tepi bat punya sebaran lebih lebar
  (lebih berisiko keluar meja): risiko sebanding hadiah. Pukulan sangat keras sesekali
  terlalu rendah dan menyangkut net (berlaku sama untuk pemain dan AI).
- Jenis pukulan dari kombinasi tenaga + arah ayunan (nama pukulan muncul di layar dan
  tiap jenis punya bunyi sendiri):

  | Pukulan | Cara | Sifat |
  |---------|------|-------|
  | Smash | ayun sangat keras ke bola tinggi | tercepat, paling berisiko |
  | Loop | ayun ke atas, tenaga sedang/keras | topspin berat, menukik lalu melompat |
  | Chop | ayun ke bawah | backspin berat, bola tertahan dan rendah |
  | Drop | ayun pelan ke bawah | jatuh pendek dekat net |
  | Lob | ayun pelan ke atas | tinggi dan dalam, aman tetapi mengundang smash |
  | Drive/Block | lainnya | datar / sekadar mengembalikan |

- **Titik manis**: bola yang kena tengah bat (≤ 25% jangkauan) dengan ayunan cukup
  bertenaga dinilai **PERFECT** (dan mengisi stack Gamble).
- Momen dramatis dirayakan di layar: kena ujung meja, menyentuh net lalu masuk, smash
  yang berhasil dikembalikan, reli tiap 10 pukulan, dan comeback setelah tertinggal ≥ 4
  poin dalam satu game.
- Keyboard (1 pemain): ←/→ atau A/D gerak, ↑/↓ atau W/S topspin/backspin, Spasi
  pukulan keras + servis.
- Keyboard (Lokal 2 pemain): P1 A/D, W/S, Spasi; P2 ←/→, ↑/↓, Enter.
- Gamepad (opsional): stik kiri gerak, tombol A pukul/servis.
- `V` ganti kamera, `Esc`/`P` jeda.

### 6.3 Servis

- Tekan (klik/tap/Spasi) → bola dilempar; bola dipukul otomatis saat turun, dengan
  arah dan spin dari gerakan pointer/tombol saat itu. Lintasan servis selalu sah.
- Bila server tidak servis dalam 6 detik, servis dilakukan otomatis (anti-macet).
- Servis harus memantul sekali di sisi sendiri, lalu sekali di sisi lawan.
- Bot dan pemain sama-sama mengikuti aturan ini.

### 6.4 Aturan skor (disederhanakan dari ITTF)

- Game sampai 11 poin; pada 10–10 (deuce) wajib unggul 2 poin, dengan **golden
  point** di 14–14 (poin berikutnya menentukan). Aturan arkade ini mencegah game
  tanpa akhir (ditemukan uji beban: dua pemain diam selalu memenangkan servis).
- Servis bergantian setiap 2 poin, dan setiap 1 poin saat deuce.
- Pertandingan best of 1 / 3 / 5 (default 3).
- Pemain bertukar sisi di antara game (secara visual kamera tetap dari sisi pemain).
- Poin hilang jika: gagal mengembalikan bola, pukulan tidak masuk meja lawan, bola
  memantul dua kali di sisi sendiri, memukul bola sebelum memantul di sisi sendiri
  (volley), atau servis gagal.

## 7. Mode main

| # | Mode | Ringkasan | Prioritas |
|---|------|-----------|-----------|
| 1 | **Vs AI** | Mudah / Sedang / Sulit / Legenda, empat gaya lawan. Bisa offline (PWA). | MVP |
| 2 | **Lokal 2 pemain** | Satu perangkat, di browser desktop: keyboard dibagi (WASD vs panah). Versi layar sentuh HP/tablet ada di backlog. | MVP |
| 3 | **Online 1v1** | Buat room → kode 6 karakter + link. Server-authoritative di Durable Object. | MVP |
| 4 | **Timing Smash** | Hanya klik/tap; hasil pukulan ditentukan ketepatan timing (lihat §8). Vs AI dan online. | MVP |
| 5 | **Gamble** | Ayunan atau Timing Smash + stack dan roulette kemampuan (§7.3). Vs AI dan online. | v0.3 |

### 7.1 Tingkat AI

AI memakai fisika yang sama dengan pemain (tidak curang). Tingkat kesulitan diatur oleh:

| Parameter | Mudah | Sedang | Sulit | Legenda |
|-----------|-------|--------|-------|---------|
| Waktu reaksi | 350 ms | 220 ms | 150 ms | 95 ms |
| Galat posisi bat | ± 30 cm | ± 17 cm | ± 10 cm | ± 5 cm |
| Kecepatan gerak maks | 2,5 m/s | 3,5 m/s | 5 m/s | 6,5 m/s |
| Kontrol (pengali sebaran pukulan) | 1,4 | 1,05 | 0,72 | 0,47 |
| Taktik (sudut, loop/chop/drop, smash) | jarang | sedang | sering | hampir selalu |
| Simpangan tap (Timing Smash) | 120 ms | 65 ms | 42 ms | 37 ms |

AI juga punya kesalahan manusiawi: sesekali salah baca bola sama sekali, smash keras
bisa menyangkut net, makin panjang reli makin berani (dan berisiko), sedikit goyah setelah
kehilangan 2 poin beruntun, dan lebih fokus saat menghadapi game point. Legenda sengaja
punya kelemahan yang bisa dibaca: sabar dalam reli panjang memaksanya mengambil risiko.

**Gaya lawan** (dipilih terpisah dari tingkat): *Serba bisa*; *Tembok* (chop dan lob,
reli panjang, jarang menyerang); *Tukang smash* (agresif, sering pura-pura smash lalu
drop — ancang-ancang smash terlihat dari pose robot); *Pemutar* (loop/chop berat dan
sudut tajam).

Kalibrasi memakai `packages/sim/stress/tune.stress.ts` (AI vs AI dan "pemain tiruan"
secepat manusia). Hasil terakhir, pemain tiruan menang: vs Sulit ±55%, vs Legenda ±30%
(ayunan).

### 7.2 Online 1v1

- Room: kode acak 6 karakter dari 31 simbol (A–Z tanpa I, L, O + angka 2–9, supaya
  tidak tertukar saat diketik) + link `pinkponk.panduarah.my.id/r/KODE`.
- Server (Durable Object per room) menjalankan simulasi resmi; client mengirim input saja.
- Client memakai prediksi untuk bat sendiri dan interpolasi untuk bola/lawan.
- Indikator ping (hijau < 80 ms, kuning < 150 ms, merah ≥ 150 ms).
- Putus koneksi: pertandingan dijeda hingga 30 detik dan client mencoba menyambung
  ulang otomatis (token kursi di sessionStorage); lewat dari itu lawan menang walkover.
  Server menganggap pemain yang diam > 5 detik terputus, dan client yang tidak
  menerima apa pun > 4,5 detik menyambung ulang sendiri (mengatasi koneksi setengah
  mati saat HP berpindah jaringan).
- Jeda atas permintaan: tiap pemain 2× per pertandingan, maks 60 detik; menghentikan
  simulasi di server untuk kedua pemain, siapa pun boleh melanjutkan.
- Room hilang otomatis saat kosong. Bila kedua pemain tidak menyentuh kontrol selama
  3 menit, pertandingan dihentikan tanpa pemenang (room ditinggal tidak memakan server).
- Client lama (versi protokol berbeda, misalnya dari cache) ditolak dengan pesan
  "muat ulang", bukan error misterius.
- Opsi **Mode Gamble** untuk room dan antrean.
- Penonton (v1.1): maksimal 8 per room, hanya menerima state.

### 7.3 Mode Gamble

- **Stack**: hanya bertambah dari pukulan **PERFECT** (timing tepat di Timing Smash, kena
  titik manis bat di ayunan), maks 5. Kemampuan adalah hadiah untuk bermain bagus.
- Stack penuh → tombol **GAMBLE** (atau `E`/`Q`, gamepad Y) memutar roulette. Hasil
  diputuskan simulasi (server saat online), jadi tidak bisa dicurangi dari client.
- Kemampuan berlaku 1–2 poin berikutnya. Ditekan saat reli: aktif mulai poin berikutnya.
- Roulette tampil sebagai pil kecil di dekat pemiliknya (atas bar Gamble untuk kita, di
  bawah skor lawan untuk lawan), tidak di tengah layar, jadi permainan tetap terlihat.
- Gaya main bisa **Ayunan** atau **Timing Smash** (vs AI: pilihan "Gaya main" di layar
  atur; online: pilihan Mode + Mode Gamble di lobby/antrean). Di Timing Smash bat bergerak
  sendiri, jadi Bat Raksasa/JACKPOT melebarkan semua jendela timing ×1,5, Magnet ×1,25,
  Sial! menyempitkan ×0,65, dan Bekukan menyempitkan jendela lawan ×0,75; Perisai
  menyelamatkan satu MISS; Bola Kilat mempercepat pukulan; Bola Hantu membuat tap AI
  lebih meleset.

| Kemampuan | Efek | Peluang |
|-----------|------|---------|
| Bat Raksasa | Jangkauan bat ×1,6 | 11% |
| Bola Kilat | Pukulan ×1,25 lebih cepat | 10% |
| Poin Ganda | Poin yang dimenangkan bernilai 2 (tidak melewati akhir game) | 9% |
| Perisai | Satu bola yang lolos dikembalikan otomatis per poin | 9% |
| Magnet | Bat ×1,6 lebih gesit, pukulan lebih akurat | 9% |
| Bekukan | Bat lawan ×0,55 | 8% |
| Bola Hantu | Bola menghilang di tengah meja bagi lawan (AI bereaksi lebih lambat) | 8% |
| Bola Melengkung | Pukulan (selain smash) melengkung dengan sidespin penuh | 9% |
| Zona Lambat | Bola yang menyeberang net ke arah kita melambat ×0,7 | 8% |
| Mode Smash | Smash lebih mudah dipicu; di Timing Smash GREAT pun jadi smash | 6% |
| Curi! | Mengambil hingga 3 stack lawan (1 poin) | 3% |
| **Sial!** | Bat sendiri mengecil ×0,65, kurang akurat — risiko gamble | 7% |
| **JACKPOT** | Bat raksasa + poin ganda | 3% |

### 7.4 Cari lawan acak

- Tombol "Cari lawan acak" di Online: antrean per kombinasi mode (ayunan/timing ×
  normal/gamble), best of 3, dipasangkan urut kedatangan. Batas tunggu 60 detik.
- Antrean hanya di memori (Durable Object `Matchmaker`), tidak disimpan.

### 7.5 Peringkat dan progres

- **Global**: rating Elo (awal 1000, K = 32) hanya dari pertandingan online yang
  hasilnya dihitung server. Syarat dihitung: minimal 6 poin dimainkan (3 bila menang
  WO), kedua pemain punya ID, bukan dari jaringan (IP) yang sama, dan pasangan yang
  sama maksimal 3 kali per 24 jam. Top 50 + peringkat sendiri.
- Identitas: rahasia acak 32 byte di perangkat; server hanya menyimpan hash-nya.
  Hapus data situs = identitas baru. Pemain tidak aktif 180 hari dihapus.
- **Pribadi** (di perangkat): XP dan level, statistik, dan 9 pencapaian.

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
| **EARLY / LATE** | ≤ ±250 ms | Pukulan lemah; peluang 40% nyangkut net atau out (diundi dengan PRNG ber-seed agar tetap deterministik) |
| **MISS** | tidak tap / di luar ±250 ms | Kehilangan poin |

- Penilaian dimulai saat bola melewati net ke sisi pemain; hanya tap pertama
  setelah itu yang dihitung, termasuk tap yang terlalu awal (> 250 ms sebelum
  waktu ideal → MISS). Ini mencegah strategi tap berulang-ulang.
- **Hold → lepas** (v1.1): menahan lalu melepas di jendela PERFECT/GREAT
  menambahkan spin.
- **Combo:** 3 PERFECT beruntun → **Fever** selama 8 detik: smash lebih kuat
  dan jejak bola berupa coretan neon.
- Kecepatan bola naik 3% setiap pukulan dalam satu reli (maks +35%); lebar
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
3. **Siaran TV** — kamera tinggi dari belakang-samping pemain, mengikuti reli dengan
   gerakan halus; kedua karakter terlihat penuh (default desktop).
4. **Isometrik** — kamera jauh dan tinggi dari sudut meja dengan lensa sempit;
   seluruh meja dan kedua robot terlihat seperti diorama.

Pilihan terakhir disimpan di perangkat. Saat *reduced motion* aktif, POV Siaran
TV tidak bergerak mengikuti bola. Mode Lokal 2 pemain tidak memakai POV orang
pertama, karena POV itu hanya bisa untuk satu pemain.

## 11. Karakter

- **Robot maskot** orisinal bergaya mainan plastik mengilap: kepala bertelinga runcing
  dengan layar wajah gelap dan mata bulat menyala, badan telur, lengan bersegmen yang
  melayang, tangan gelap, garis aksen berwarna, melayang tanpa kaki.
- **Dilarang** memakai logo atau merek nyata (Nike, Adidas, Butterfly, dll.) atau
  bentuk yang menyerupainya. Panel dada memakai emblem PinkPonk (bola menyala).
- Kustomisasi (MVP): warna badan, aksen, mata, dan bat. Lawan otomatis
  memakai warna kontras.
- Pose: idle, siap, forehand, backhand, smash, servis, menang, kalah — masing-masing
  dengan ekspresi mata (fokus, melirik, garang, mengedip, ^ ^, sedih).
- Digambar prosedural (Canvas 2D, tanpa file sprite) lalu dirender sebagai billboard
  di scene 3D; tangan pemegang bat selalu sejajar posisi bat sebenarnya dan lengan bat
  dianimasikan halus (pegas + sapuan saat memukul).

## 12. Tampilan dan tema

- Tema **Gelap**, **Terang**, dan **Ikuti sistem**; default ikut sistem.
- Aksen neon pink + lime; detail di `docs/DESIGN.md`.

## 13. Fitur pendukung

| Fitur | Prioritas |
|-------|-----------|
| Tutorial singkat (ayunan + timing), bisa dilewati | MVP |
| Hitung mundur 3-2-1 sebelum servis pertama | MVP |
| Jeda (semua mode; online 2× per pemain, maks 60 detik), Rematch, kembali ke menu | MVP |
| Efek suara + getaran (haptic, hanya di perangkat yang mendukung; iOS Safari tidak) dengan sakelar masing-masing | MVP |
| Pengaturan grafis: Otomatis / Tinggi / Rendah | MVP |
| PWA: bisa dipasang ke layar utama; Vs AI, Timing Smash vs AI, dan Lokal bisa offline | MVP |
| Bahasa Indonesia + Inggris | MVP |
| Reaksi emoji cepat (6 pilihan tetap) di online | ✓ |
| Mode Gamble, cari lawan acak, peringkat global | v0.3 ✓ |
| Mode penonton | v1.1 |
| Replay smash terakhir (slow-mo) | v1.1 |
| Statistik lokal: menang/kalah, reli terpanjang, akurasi PERFECT | v0.3 (✓, plus XP/level/pencapaian) |
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
| Ukuran | JS awal (menu) ≤ 150 kB gzip; total unduhan sampai servis pertama ≤ 550 kB (rincian di `QA.md` §4) |
| Frame rate | 60 fps di HP kelas menengah (acuan: Android ~Rp2–3 juta, 2023) |
| Latensi input | Input → perubahan visual < 50 ms |
| Lighthouse mobile | Performance ≥ 90, Accessibility ≥ 95 |
| Jaringan | Online tetap bisa dimainkan pada RTT 150 ms dan packet loss 2% |
| Browser | Chrome/Edge/Firefox/Safari dua versi terakhir; iOS Safari 16+ |

## 16. Metrik sukses (tanpa DB aplikasi)

Kunjungan diukur dengan Cloudflare Web Analytics (tanpa cookie). Kejadian game
(mulai pertandingan, room selesai, error JS) dikirim lewat `POST /api/event` ke
Workers Analytics Engine: hanya hitungan anonim (jenis kejadian, mode, tanggal),
tanpa nickname atau IP. Ini data agregat untuk metrik, bukan database aplikasi.

- Persentase kunjungan yang memulai pertandingan (target ≥ 60%).
- Persentase room online yang berakhir dengan pertandingan selesai (target ≥ 70%).
- Error JavaScript per sesi (target < 1%).

## 17. Rilis bertahap

1. [x] **Fondasi:** scaffold, CI/CD, tema.
2. [x] **Vs AI:** fisika, aturan skor, AI.
3. [x] **Timing Smash** vs AI + kalibrasi.
4. [x] **Karakter robot + 4 POV** + kustomisasi.
5. [x] **Lokal 2 pemain.**
6. [x] **Online 1v1** (ayunan dan timing), jeda, sambung ulang.
7. [x] **PWA, i18n, aksesibilitas dasar.**
8. [ ] Deploy ke `pinkponk-dev.panduarah.my.id` (menunggu domain + secret Cloudflare), playtest
   di HP sungguhan, tuning angka (jendela timing, AI, fisika), lalu rilis produksi.
9. [x] **v0.3:** mode Gamble, cari lawan acak, peringkat global + progres pribadi,
   bola lebih lambat, uji beban (`QA.md` §6).
10. [ ] v1.1 sesuai tabel §13.

## 18. Keputusan

| Tanggal | Keputusan |
|---------|-----------|
| 2026-10-21 | Satu Worker + Static Assets (bukan Pages + Worker terpisah) |
| 2026-10-21 | Subdomain development: `pinkponk-dev.panduarah.my.id` |
| 2026-10-21 | Lokal 2 pemain di MVP hanya untuk browser desktop; versi HP ke backlog |
| 2026-10-21 | Audio hanya efek suara, tanpa musik latar |
| 2026-10-21 | Logo dibuat sendiri: `docs/brand/` (lihat `DESIGN.md` §10) |
| 2026-10-21 | Karakter berupa robot maskot (bukan manusia) |
| 2026-10-21 | POV ke-4: Isometrik |
| 2026-10-21 | Jeda juga tersedia di online (dibatasi agar tidak disalahgunakan) |
| 2026-10-21 | Server di wilayah Asia-Pasifik (`locationHint: "apac"`) |
| 2026-10-21 | Peringkat global disetujui pemilik produk: satu-satunya penyimpanan permanen (DO SQLite) |
| 2026-10-21 | Golden point di 14–14 (ditemukan lewat uji beban) |
