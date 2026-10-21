# Security — PinkPonk

## 1. Aset yang dilindungi

- Ketersediaan layanan dan kuota Cloudflare (biaya).
- Keadilan pertandingan online.
- Pemain dari konten berbahaya (XSS lewat nickname, pelecehan).
- Kredensial deploy (API token Cloudflare) dan domain `pinkponk.panduarah.my.id`.

Tidak ada data pribadi yang disimpan di server; nickname hanya hidup di memori
room selama pertandingan. Log Worker dan Analytics Engine tidak boleh memuat
nickname, IP, atau isi pesan.

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
| Pesan cacat | Decoder biner dengan validasi panjang/rentang; pesan JSON (kontrol) divalidasi zod; tolak dan tutup koneksi bila tidak valid |
| Bocornya API token | Token hanya di GitHub Secrets; izin minimum dan dibatasi ke satu zone; rotasi tiap 90 hari; tidak pernah di repo atau log |
| Supply chain | Lockfile wajib (`--frozen-lockfile`), Dependabot (npm + Actions), `pnpm audit` di CI. Actions masih dipin ke tag mayor; pin ke SHA = tindak lanjut |
| Spoofing email domain | SPF `v=spf1 -all` + DMARC `p=reject` di `panduarah.my.id` **hanya bila** domain tidak dipakai untuk email (berlaku ke seluruh domain) |
| Pelecehan di online | Tanpa chat teks bebas; hanya 6 emoji tetap; tombol bisukan reaksi lawan |
| Clickjacking | `frame-ancestors 'none'` |

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
