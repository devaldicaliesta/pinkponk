# Deploy — PinkPonk

## 1. Langkah manual pemilik (sekali saja)

Game dipasang di subdomain domain milik pemilik, `panduarah.my.id` (zone sudah aktif
di Cloudflare). Domain utama dan subdomain lain tidak disentuh.

| Situs | Alamat |
|-------|--------|
| Produksi | `pinkponk.panduarah.my.id` |
| Dev | `pinkponk-dev.panduarah.my.id` |

Subdomain dev sengaja satu tingkat (`pinkponk-dev.`), bukan `dev.pinkponk.`: sertifikat
Universal SSL gratis hanya mencakup `*.panduarah.my.id` (satu tingkat).

1. SSL/TLS zone `panduarah.my.id`: mode **Full (strict)**, aktifkan **Always Use HTTPS**.
2. Buat API Token (My Profile → API Tokens → Create Custom Token):
   - Account → Workers Scripts: Edit
   - Account → Account Settings: Read
   - Zone (hanya `panduarah.my.id`) → Zone: Read, DNS: Edit, Workers Routes: Edit
   (Cloudflare Pages: Edit tidak dibutuhkan karena memakai Worker + Static Assets.)
3. GitHub repo → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`.
   Account ID (`7629660f33279441e8cb1e786e2a56f7`) sudah tertulis di
   `worker/wrangler.jsonc` karena bukan rahasia.
4. Analytics Engine: buat dataset `pinkponk_events_dev` dan `pinkponk_events`
   (membuat dataset pertama sekaligus mengaktifkan fitur untuk akun).
5. GitHub → Settings → Branches: proteksi `production` (PR wajib, status check wajib,
   tanpa force-push).
6. Opsional: Redirect Rule `www.pinkponk.panduarah.my.id/*` →
   `https://pinkponk.panduarah.my.id/$1` (301) plus record DNS `www.pinkponk` (proxied).

Pengaturan berikut berlaku untuk **seluruh** `panduarah.my.id`, jadi hanya dilakukan bila
tidak mengganggu pemakaian domain yang lain:

- SPF `v=spf1 -all` dan DMARC `p=reject` hanya bila domain **tidak** dipakai untuk email.
- HSTS tingkat zone dengan `includeSubDomains` hanya bila semua subdomain sudah HTTPS.
  (Worker sendiri sudah mengirim HSTS untuk subdomain PinkPonk.)
- DNSSEC: aman diaktifkan; salin record DS ke registrar bila didukung.

Deploy pertama terjadi otomatis saat ada push ke `development` setelah secret diisi.
Tanpa secret, workflow Deploy melewati langkah deploy dengan pemberitahuan (tidak gagal).

## 2. Alur otomatis (GitHub Actions)

| Pemicu | Job |
|--------|-----|
| PR ke `development` | `pnpm check` + build (tanpa deploy: Cloudflare tidak membuat preview URL untuk Worker dengan Durable Object) |
| Push ke `development` | `pnpm check` → build (`PP_SITE=dev`) → `wrangler deploy --env dev` → `pinkponk-dev.panduarah.my.id` |
| PR `development` → `production` | `pnpm check` + build + budget + dry-run + audit + E2E |
| Push ke `production` | `pnpm check` → build (`PP_SITE=production`) → `wrangler deploy --env production` → `pinkponk.panduarah.my.id` |
| Tiap malam (02.00 WIB) | E2E di `development` |

Custom domain (`pinkponk.panduarah.my.id`, `pinkponk-dev.panduarah.my.id`) didefinisikan di
`worker/wrangler.jsonc` (`routes` dengan `custom_domain: true`), bukan diklik manual.
Build web memakai `PP_SITE=dev|production` untuk menulis `_headers`, `robots.txt`, dan
`sitemap.xml` yang sesuai situsnya.

## 2a. Deploy manual (darurat)

```
PP_SITE=dev pnpm build && pnpm deploy:dev
PP_SITE=production pnpm build && pnpm deploy:production
```

Butuh `CLOUDFLARE_API_TOKEN` di environment.

## 2b. Migrasi Durable Object

`worker/wrangler.jsonc` → `migrations`: `v1` membuat `Room`, `v2` membuat `Leaderboard`
dan `Matchmaker` (keduanya SQLite-backed, tersedia di paket Free). Migrasi dijalankan
otomatis oleh `wrangler deploy`; tidak ada langkah manual. Jangan mengubah atau
menghapus tag yang sudah dideploy; perubahan kelas berikutnya = tag baru (`v3`, …).

Rate limit baru `RL_LB` (namespace `2004` dev, `1004` produksi) juga dibuat otomatis.

## 3. Rollback

`wrangler rollback --env production` ke versi sebelumnya, lalu revert commit di
`production` lewat PR. Catatan: rollback kode tidak menghapus data leaderboard; skema
tabel dibuat dengan `CREATE TABLE IF NOT EXISTS` sehingga aman untuk versi lama/baru.
