# CLAUDE.md

PinkPonk: game ping pong web (Vs AI, lokal 2 pemain, online 1v1, Timing Smash, Gamble),
tanpa database aplikasi, di Cloudflare (`pinkponk.panduarah.my.id`).

## Baca dulu

- `docs/PRD.md` — apa yang dibangun dan prioritasnya (§17 urutan rilis, §18 keputusan).
- Dokumen lain hanya bila task menyentuhnya: `DESIGN.md` (UI), `ARCHITECTURE.md`
  (struktur/netcode), `QA.md` (test), `SECURITY.md` (worker, protokol, header),
  `DEPLOY.md` (CI/CD, domain).

## Aturan

- Kerja di `development` atau branch fitur dari `development`. `production` hanya
  lewat PR dari `development`.
- Tidak ada database aplikasi. Satu-satunya penyimpanan server permanen adalah papan
  peringkat (DO `Leaderboard`: ID hash, nickname, rating, M/K); jangan menambah data lain.
- `packages/sim` dan `packages/protocol` TypeScript murni (tanpa DOM); setiap
  perubahan di sana wajib disertai unit test.
- Client hanya mengirim input; hasil pertandingan dan penilaian timing ditentukan server.
- Patuhi budget ukuran di `QA.md` §4; dependency baru wajib dijelaskan di PR.
- Warna dan font hanya dari token di `DESIGN.md`; dukung tema gelap dan terang.
- Tidak boleh ada logo/merek pihak lain di aset mana pun.
- Teks UI lewat i18n (ID/EN), tidak di-hardcode.
- Rahasia (API token Cloudflare) hanya di GitHub Secrets, tidak pernah di repo.
- Sebelum PR: `pnpm check` hijau; bila menyentuh frontend juga `pnpm build && pnpm size`;
  bila menyentuh alur utama juga `pnpm test:e2e`; bila menyentuh sim/worker/protokol juga
  `pnpm test:stress`. Format pesan berubah = naikkan `PROTOCOL_VERSION`.
- Hook test (`window.__pp`) hanya boleh ada di build E2E (`__E2E__`).
