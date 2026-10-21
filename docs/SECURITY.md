# Security — PinkPonk

## 1. Aset yang dilindungi

- Ketersediaan layanan dan kuota Cloudflare (biaya).
- Keadilan pertandingan online.
- Pemain dari konten berbahaya (XSS lewat nickname, pelecehan).
- Kredensial deploy (API token Cloudflare) dan domain `pinkponk.panduarah.my.id`.

Satu-satunya data permanen di server adalah papan peringkat (Durable Object
`Leaderboard`, SQLite): ID pemain (128 bit pertama SHA-256 dari rahasia di perangkat),
nickname, rating, menang/kalah, waktu terakhir main. Rahasia pemain tidak pernah
disimpan; IP hanya dipakai di memori room selama pertandingan (aturan anti-curang) dan
tidak pernah ditulis. Pemain tidak aktif 180 hari dihapus otomatis. Log Worker dan
Analytics Engine tidak boleh memuat nickname, IP, rahasia, atau isi pesan.

## 2. Threat model dan mitigasi

| Ancaman | Mitigasi |
|---------|----------|
| XSS lewat nickname | Whitelist karakter di client **dan** server; selalu dirender sebagai teks (`textContent`); CSP tanpa `unsafe-inline` untuk skrip |
| Cheat: client mengirim posisi/hasil palsu | Server-authoritative: client hanya mengirim input; server membatasi kecepatan bat dan ayunan, menilai timing sendiri |
| Cheat: memalsukan cap waktu tap | Cap waktu dibatasi oleh RTT terukur dan offset jam; tap di luar ±RTT/2 dari waktu terima ditolak |
| Menebak kode room | Kode 6 karakter dari 31 simbol (~887 juta kombinasi) + rate limit pembuatan/join per IP |
| Spam pesan / DoS ke room | Batas ukuran pesan (256 B), maks 60 pesan/detik per koneksi (normalnya 30 + ping), koneksi diputus bila melanggar; maks 2 pemain per room (penonton: v1.1) |
| Koneksi menggantung (kuota DO terbuang) | Server memutus pemain yang diam > 5 detik saat bermain; room tanpa pemain tidak berdetak |
| Jeda online disalahgunakan untuk mengulur | Maks 2 jeda per pemain per pertandingan, masing-masing ≤ 60 detik, lalu lanjut otomatis |
| Pembuatan room massal | Rate limit `POST /api/room` dan join per IP (binding Workers Rate Limiting; paket Free hanya punya 1 rule WAF) + room tanpa pemain dihapus setelah 60 detik |
| Spam `POST /api/event` | Rate limit per IP, hanya menerima daftar jenis kejadian tetap, ukuran ≤ 512 B |
| Hook test bocor ke produksi | `?seed=` dan percepat waktu hanya dikompilasi di build test; dicek di CI |
| WebSocket dari situs lain | Cek header `Origin`: hanya `pinkponk.panduarah.my.id`, `pinkponk-dev.panduarah.my.id`, localhost saat dev |
| Pesan cacat | Decoder biner dengan validasi panjang/rentang; pesan JSON (kontrol) divalidasi parser buatan sendiri yang menolak semua kunci/nilai tak dikenal; tolak dan tutup koneksi bila tidak valid. Diuji fuzz 100.000 pesan acak (`pnpm test:stress`) |
| Bocornya API token | Token hanya di GitHub Secrets; izin minimum dan dibatasi ke satu zone; rotasi tiap 90 hari; tidak pernah di repo atau log |
| Supply chain | Lockfile wajib (`--frozen-lockfile`), Dependabot (npm + Actions), `pnpm audit` di CI. Actions masih dipin ke tag mayor; pin ke SHA = tindak lanjut |
| Spoofing email domain | SPF `v=spf1 -all` + DMARC `p=reject` di `panduarah.my.id` **hanya bila** domain tidak dipakai untuk email (berlaku ke seluruh domain) |
| Pelecehan di online | Tanpa chat teks bebas; hanya 6 emoji tetap; tombol bisukan reaksi lawan |
| Clickjacking | `frame-ancestors 'none'` |
| Hasil pertandingan palsu ke leaderboard | Tidak ada endpoint untuk mengirim skor. Hasil hanya dilaporkan oleh `RoomCore` (simulasi server) lewat RPC Durable Object, bukan HTTP publik |
| Mencuri identitas/peringkat orang lain | ID = hash rahasia 32 byte acak; rahasia hanya dikirim lewat WSS di pesan hello dan tidak pernah ditampilkan atau disimpan server |
| Farming rating (akun ganda, main lawan teman berulang) | Pasangan sama maks 3 kali/24 jam; dua kursi dari IP sama tidak dihitung; minimal 6 poin dimainkan (WO minimal 3); rahasia sama di dua kursi ditolak |
| Nickname jahat di papan peringkat | Nickname sudah divalidasi server (whitelist + filter) sebelum masuk room; dirender sebagai teks |
| Banjir baca leaderboard | Respons top-50 di-cache edge 30 detik; `RL_LB` 60 permintaan/menit per IP; query terindeks |
| Banjir antrean cari lawan | `RL_JOIN` per IP; antrean maks 2.000 (selebihnya "busy"), socket maks 2.200 (503); socket yang tidak mengirim permintaan dalam 10 detik ditutup; maks 3 pesan per socket (objek global dipakai bersama); tiket kedaluwarsa 60 detik |
| Socket menganggur menumpuk di room | Maks 6 koneksi per room (selebihnya ditolak "busy"); koneksi tanpa hello ditutup setelah 10 detik |
| Room ditinggal tetap berjalan (biaya CPU) | Kedua pemain tidak menyentuh kontrol 3 menit → pertandingan dihentikan tanpa peringkat; golden point mencegah game tanpa akhir |
| Client lama/rusak dari cache | Versi protokol di hello dan antrean; beda versi ditolak "outdated" dengan ajakan memuat ulang |

## 3. Header HTTP (diset oleh Worker)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://pinkponk.panduarah.my.id wss://pinkponk-dev.panduarah.my.id;
  worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), gamepad=(self)
Cross-Origin-Opener-Policy: same-origin
```

Header untuk aset statis ditulis ke file `_headers` saat build (beda per situs: CSP
`connect-src` ke host masing-masing, `X-Robots-Tag: noindex` di dev). Skrip anti-kedip
tema adalah file `/theme.js`, bukan skrip inline, sehingga CSP tidak butuh
`unsafe-inline` maupun hash. Respons Worker (`/api/*`) memakai header ketat sendiri.

## 4. Domain dan zone

- SSL/TLS mode **Full (strict)**, Always Use HTTPS, HSTS aktif setelah situs stabil.
- `pinkponk-dev.panduarah.my.id` dilindungi Cloudflare Access (email pemilik) atau minimal
  `X-Robots-Tag: noindex`.
- DNSSEC diaktifkan di Cloudflare dan record DS dipasang di registrar (jika
  registrar `.my.id` mendukung).

## 5. Proses

- Branch `production` diproteksi: hanya lewat PR dari `development`, CI hijau,
  tanpa force-push.
- Setiap PR yang menyentuh `worker/` atau `packages/protocol` ditinjau khusus
  untuk validasi input dan rate limit.
- Laporan kerentanan: lewat GitHub Private Vulnerability Reporting (aktifkan di
  Settings → Security). GitHub juga membaca file ini dari folder `docs/`.
