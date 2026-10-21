# Deploy — PinkPonk

## 1. Langkah manual pemilik (sekali saja)

1. Beli domain `pinkponk.my.id` di registrar Indonesia (verifikasi KTP mungkin diminta).
2. Cloudflare → **Add a domain** → paket Free → catat 2 nameserver.
3. Ganti nameserver di panel registrar → tunggu status zone **Active** (hingga 24 jam).
4. SSL/TLS: mode **Full (strict)**, aktifkan **Always Use HTTPS**.
5. DNS: tambah record TXT `v=spf1 -all` dan `_dmarc` → `v=DMARC1; p=reject`.
6. DNSSEC: aktifkan, salin record DS ke registrar (jika registrar mendukung).
7. Buat API Token (My Profile → API Tokens → Create Custom Token):
   - Account → Workers Scripts: Edit
   - Account → Account Settings: Read
   - Zone (hanya `pinkponk.my.id`) → Zone: Read, DNS: Edit, Workers Routes: Edit
   (Cloudflare Pages: Edit tidak dibutuhkan karena memakai Worker + Static Assets.)
8. GitHub repo → Settings → Secrets and variables → Actions:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
9. Buat branch `production` dari `development` (GitHub → Branches → New branch).
10. GitHub → Settings → Branches: proteksi `production` (PR wajib, status check wajib,
   tanpa force-push) dan `development` (status check wajib).
11. GitHub → Settings → Environments: buat `development` dan `production` (opsional:
    reviewer wajib untuk `production`). Secret boleh disimpan per environment.
12. Cloudflare → Rules → Redirect Rules: `www.pinkponk.my.id/*` → `https://pinkponk.my.id/$1`
    (301). Tambahkan juga record DNS `www` (proxied) agar aturan berlaku.
13. Workers & Pages → Analytics Engine: pastikan fitur aktif untuk akun (dataset
    `pinkponk_events` dibuat otomatis saat data pertama ditulis).
14. Setelah situs stabil: aktifkan HSTS di Cloudflare.

Deploy pertama terjadi otomatis saat ada push ke `development` setelah secret diisi.
Tanpa secret, workflow Deploy melewati langkah deploy dengan pemberitahuan (tidak gagal).

## 2. Alur otomatis (GitHub Actions)

| Pemicu | Job |
|--------|-----|
| PR ke `development` | `pnpm check` + build (tanpa deploy: Cloudflare tidak membuat preview URL untuk Worker dengan Durable Object) |
| Push ke `development` | `pnpm check` → build (`PP_SITE=dev`) → `wrangler deploy --env dev` → `dev.pinkponk.my.id` |
| PR `development` → `production` | `pnpm check` + build + budget + dry-run + audit + E2E |
| Push ke `production` | `pnpm check` → build (`PP_SITE=production`) → `wrangler deploy --env production` → `pinkponk.my.id` |
| Tiap malam (02.00 WIB) | E2E di `development` |

Custom domain (`pinkponk.my.id`, `dev.pinkponk.my.id`) didefinisikan di
`worker/wrangler.jsonc` (`routes` dengan `custom_domain: true`), bukan diklik manual.
Build web memakai `PP_SITE=dev|production` untuk menulis `_headers`, `robots.txt`, dan
`sitemap.xml` yang sesuai situsnya.

## 2a. Deploy manual (darurat)

```
PP_SITE=dev pnpm build && pnpm deploy:dev
PP_SITE=production pnpm build && pnpm deploy:production
```

Butuh `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` di environment.

## 3. Rollback

`wrangler rollback --env production` ke versi sebelumnya, lalu revert commit di
`production` lewat PR.
