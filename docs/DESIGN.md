# Design system — PinkPonk

Arah visual: **arena neon malam**. Latar gelap pekat, aksen neon pink sebagai
identitas, lime neon sebagai sorotan, coretan tangan bercahaya sebagai motif,
tipografi display tinggi dan padat. Tema terang tetap terasa "neon": versi kertas
putih kemerahmudaan dengan tinta pink pekat.

Referensi (hanya untuk gaya; jangan disalin aset, nama, atau logonya):
- Karakter flat garis hitam, anggota badan lentur, baju merah, headband.
- Landing page olahraga: foto monokrom + coretan neon, huruf condensed besar,
  kartu kaca, hitung mundur besar.

Gambar referensi tidak disimpan di repo karena hak ciptanya milik pihak lain.

## 1. Prinsip

1. **Bola selalu paling terang di layar.** Neon dipakai seperlunya agar bola, bat,
   dan penanda timing tidak tenggelam.
2. **Satu sorotan per layar.** Hanya satu elemen boleh memakai glow terkuat.
3. **Coretan = momen.** Motif coretan neon muncul saat ada kejadian (smash, Fever,
   menang), bukan sebagai hiasan permanen.
4. **Cepat dibaca di HP.** Angka skor besar, teks UI singkat.

## 2. Warna

### 2.1 Token (CSS custom properties)

| Token | Gelap | Terang | Pemakaian |
|-------|-------|--------|-----------|
| `--bg` | `#0B0710` | `#FFF5FA` | Latar halaman |
| `--surface` | `#160F1D` | `#FFFFFF` | Kartu, panel |
| `--surface-glass` | `rgb(30 20 40 / 0.55)` | `rgb(255 255 255 / 0.65)` | Kartu kaca (+ `backdrop-filter: blur(16px)`) |
| `--border` | `#2C2036` | `#F1D3E3` | Garis kartu |
| `--text` | `#F7F0FA` | `#1A0F1F` | Teks utama |
| `--text-muted` | `#B7A8C2` | `#6B5873` | Teks sekunder |
| `--pink` | `#FF2E9A` | `#D6006F` | Aksen utama, tombol primer |
| `--on-pink` | `#1A0F1F` | `#FFFFFF` | Teks di atas `--pink` |
| `--pink-glow` | `rgb(255 46 154 / 0.55)` | `rgb(214 0 111 / 0.25)` | Glow/shadow |
| `--lime` | `#C6FF3D` | `#C6FF3D` (latar) / `#4A7A00` (teks) | Sorotan, PERFECT, Fever |
| `--cyan` | `#3DE8FF` | `#007C91` | Info, ping hijau-netral, pemain 2 |
| `--danger` | `#FF5A5A` | `#C62828` | MISS, error, kemampuan "Sial!" |
| `--gold` | `#FFD23D` | `#8A5F00` | JACKPOT, pencapaian, peringkat 1 (kontras terang ≈ 5,3 : 1) |
| `--table` | `#1B2A6B` | `#2747C9` | Permukaan meja |
| `--table-line` | `#FFFFFF` | `#FFFFFF` | Garis meja |
| `--ball` | `#FFF8E7` | `#FF8A00` | Bola (di tema terang oranye agar kontras) |

Kontras teks yang sudah dihitung:
- `--pink` gelap `#FF2E9A` di atas `#0B0710` ≈ 5,8 : 1 (AA).
- `--pink` terang `#D6006F` di atas `#FFF5FA` ≈ 4,8 : 1 (AA untuk teks normal).
- Teks di atas tombol pink: tema gelap `#1A0F1F` di atas `#FF2E9A` ≈ 5,4 : 1;
  tema terang `#FFFFFF` di atas `#D6006F` ≈ 5,1 : 1. Teks putih di atas `#FF2E9A`
  hanya ≈ 3,4 : 1, jadi tidak dipakai.
- Semua token teks lain lolos AA di temanya masing-masing (terendah: `--cyan`
  terang ≈ 4,6 : 1).
- `--lime` hanya dipakai sebagai latar dengan teks `#1A0F1F`, atau sebagai teks
  di tema gelap; tidak pernah teks lime di atas putih.

### 2.2 Glow neon

```css
--glow-sm: 0 0 6px var(--pink-glow);
--glow-md: 0 0 12px var(--pink-glow), 0 0 28px var(--pink-glow);
```

Glow pada teks hanya untuk judul display dan label PERFECT. Di tema terang,
glow diganti bayangan tipis + garis luar 2 px.

### 2.3 Mode tema

- Atribut `data-theme="dark|light"` di `<html>`; tanpa atribut → ikuti
  `prefers-color-scheme`.
- Pilihan disimpan di `localStorage` (`pp.theme`), dibaca oleh skrip kecil
  inline di `<head>` sebelum render agar tidak berkedip.
- Warna di dalam game (meja, bola, garis) dibaca dari token yang sama.

## 3. Tipografi

| Peran | Font (OFL, self-host, subset Latin) | Contoh |
|-------|-------------------------------------|--------|
| Display | **Anton** (atau Big Shoulders Display) | Judul, skor, PERFECT |
| UI / teks | **Inter** (variable, subset) | Menu, tombol, pengaturan |

- Maksimal 2 keluarga font, total ≤ 80 kB woff2 (Anton ±20 kB + Inter 2 bobot
  statis ±45 kB). Wordmark logo tidak memakai Anton; hurufnya digambar sendiri.
- Skala: 12 / 14 / 16 / 20 / 28 / 40 / 64 / 96 px. Skor di dalam game memakai 64–96 px.
- Display selalu huruf kapital, `letter-spacing: 0.02em`, `line-height: 0.9`.
- Angka skor dan hitung mundur memakai `font-variant-numeric: tabular-nums`.

## 4. Spasi, radius, layout

- Spasi basis 4 px: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: tombol 999 px (pil), kartu 20 px, input 12 px.
- Gutter samping HP 16 px; konten menu maksimal 480 px di tengah.
- HUD game di tepi aman (`env(safe-area-inset-*)`).

## 5. Komponen

| Komponen | Catatan |
|----------|---------|
| Tombol primer | Latar `--pink`, teks `--on-pink`, pil, `--glow-sm`; hover → `--glow-md` |
| Tombol sekunder | Garis 1,5 px `--border`, latar transparan |
| Kartu kaca | `--surface-glass`, blur 16 px, garis `--border`; fallback solid bila `backdrop-filter` tidak didukung atau grafis Rendah |
| Kartu mode | Ilustrasi karakter + nama mode display + deskripsi 1 baris |
| Input nickname | Besar (56 px), penghitung karakter, pesan error di bawah |
| Chip pilihan | Untuk tingkat AI, best of, POV |
| Toggle tema | Ikon bulan/matahari/otomatis, 3 posisi |
| HUD skor | Dua angka display besar, nickname kecil, titik servis |
| Label timing | PERFECT (lime + glow), GREAT (pink), GOOD (cyan), EARLY/LATE (muted), MISS (danger) |
| Indikator ping | Titik + angka ms |
| Hitung mundur | Angka display 96 px, gaya kartu kaca seperti referensi |

## 6. Motif coretan neon

- Dibuat sebagai beberapa path SVG coretan tangan (6–8 varian, total < 8 kB).
- Animasi `stroke-dashoffset` (digambar cepat 250 ms, pudar 400 ms).
- Dipakai pada: jejak bola saat smash/Fever, latar layar judul (statis),
  kemenangan, kartu hasil.
- Dalam game: jejak bola berupa garis lime/pink dengan blending additive di
  tema gelap, normal di tema terang.

## 7. Karakter (robot maskot)

- Siluet: kepala bulat bertelinga runcing dengan layar wajah gelap, mata bulat
  menyala dan senyum kecil; badan berbentuk telur; lengan bersegmen yang melayang
  terpisah dari badan; tangan gelap tiga jari; melayang tanpa kaki di atas cahaya
  lembut (siluet bulat dan sederhana terbaca jelas dari semua kamera).
- Gaya mainan plastik mengilap: gradasi lembut (terang kiri-atas → gelap kanan-bawah),
  satu kilau putih, tepi tipis 3 px senada warna badan; tanpa garis tinta tebal.
- Warna yang bisa diatur: **badan** (kepala, badan, lengan), **aksen** (garis, telinga
  dalam, emblem), **mata** (mata, senyum, inti dada, cahaya bawah), **bat**.
- Tampak belakang: garis V dan garis tengah di kepala, garis kerah di badan.
- Ekspresi lewat mata di layar wajah: fokus, melirik ke arah pukulan, garang saat smash,
  mengedip saat servis, ^ ^ saat menang, sedih saat kalah.
- **Tanpa logo merek apa pun.** Emblem dada = bola menyala (dari logo PinkPonk).
- Digambar prosedural dengan Canvas 2D saat game dimuat (0 byte aset), 8 pose × 2
  arah pandang per robot, disiapkan sekaligus agar tidak tersendat.
- Lengan pemegang bat tidak ada di gambar badan: digerakkan per frame dengan pegas
  (sedikit melewati target lalu kembali) plus sapuan bat saat memukul, sehingga bat
  bergerak halus antarpose. Goyangan kecil saat menunggu.
- Umpan balik pukulan: kilatan di titik pukul (lebih besar dan pink saat smash), riak
  di titik pantul meja, skor "membal" saat bertambah. Semua dimatikan bila
  `prefers-reduced-motion`.

## 7b. Penempatan teks HUD

- Status yang bertahan lama (Deuce, Game point, Match point, FEVER!) berupa label kecil
  di atas, di bawah tombol kamera/jeda, agar tidak menutupi meja dan bola.
- Hanya teks sesaat (hitung mundur, alasan poin, roulette) yang boleh muncul di tengah.

## 7a. HUD mode Gamble dan layar peringkat

- **Meter stack**: 6 kotak kecil (pip) di kiri bawah bersama tombol **GAMBLE**. Pip
  terisi = pink + glow. Stack lawan ditampilkan kecil di bawah kartu skornya.
- **Tombol GAMBLE** aktif hanya saat stack penuh; denyutnya lewat cahaya, bukan skala,
  supaya tombol tidak bergeser saat disentuh. Petunjuk keyboard `Tekan E` disembunyikan
  di layar sentuh.
- **Roulette**: panel kaca di tengah; nama kemampuan berputar ±0,9 detik (melambat)
  lalu berhenti di hasil server. Warna hasil: menguntungkan = lime, JACKPOT = gold,
  "Sial!" = danger + getar kecil. *Reduced motion*: langsung tampil hasil.
- **Aura** berdenyut di kaki robot selama kemampuan aktif (lime/gold/merah/cyan untuk
  perisai); bat membesar/mengecil; robot yang dibekukan diberi tint biru es; bola hantu
  memudar di tengah meja (pemiliknya tetap melihat samar).
- **Efek pukulan**: kilatan di titik pukul (pink saat smash), riak di titik pantul, angka
  skor "membal".
- **Peringkat**: baris dengan nomor (1 gold, 2 cyan, 3 pink), nama, M/K, rating; baris
  sendiri bergaris pink. Tab Pribadi: bar level, kartu statistik, daftar pencapaian (★).

## 8. Gerak (motion)

| Kejadian | Durasi | Easing |
|----------|--------|--------|
| Transisi menu | 180 ms | `cubic-bezier(.2,.8,.2,1)` |
| Muncul label timing | 120 ms naik + 300 ms pudar | ease-out |
| Hit-stop smash | 60 ms | — |
| Slow-mo smash | 350 ms pada 0,35× | ease-in-out |
| Screen shake smash | 150 ms, amplitudo 4 px | — |

`prefers-reduced-motion: reduce` atau sakelar di Pengaturan → hit-stop tetap,
shake/slow-mo/kamera bergerak dimatikan.

## 9. Suara

Hanya efek suara; tidak ada musik latar.

- Efek pendek (pantul meja, pukul, smash, PERFECT, menang); Opus/WebM + AAC
  fallback; total ≤ 80 kB.
- Diputar dengan Web Audio API (latensi rendah); dimuat setelah interaksi pertama.

## 10. Logo

File di `docs/brand/` (SVG, tanpa font eksternal; huruf wordmark digambar sebagai path):

| File | Pemakaian |
|------|-----------|
| `logo-mark-dark.svg` | Ikon aplikasi/PWA, favicon, avatar sosial (tema gelap) |
| `logo-mark-light.svg` | Ikon di latar terang |
| `logo-wordmark-dark.svg` | Header dan OG image tema gelap |
| `logo-wordmark-light.svg` | Header tema terang |

- Konsep: huruf **P** = bat ping pong. Batang = gagang, mangkuk = muka bat,
  lubang huruf = bola lime. Dua coretan = jejak bola (motif coretan neon).
- Wordmark: huruf monoline condensed dengan ujung bulat (senada dengan gaya
  rubber-hose karakter); "PINK" berwarna pink, "PONK" warna teks.
- Ruang kosong minimal di sekitar logo = diameter bola. Ukuran mark minimal 16 px.
- Jangan: memutar logo, mengganti warna di luar token, memberi glow di tema terang,
  menempatkan versi gelap di atas foto ramai.

## 11. Larangan

- Gradien ungu-biru generik, ilustrasi stok, ikon emoji sebagai ikon UI.
- Logo atau elemen merek pihak lain (termasuk dari gambar referensi).
- Lebih dari satu warna glow kuat dalam satu layar.
- Teks putih tipis di atas kartu kaca tanpa cek kontras.
