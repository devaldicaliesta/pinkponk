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
11. Setelah situs stabil: aktifkan HSTS di Cloudflare.

## 2. Alur otomatis (GitHub Actions)

| Pemicu | Job |
|--------|-----|
| PR ke `development` | `pnpm check` + build (tanpa deploy: Cloudflare tidak membuat preview URL untuk Worker dengan Durable Object) |
| Push ke `development` | `pnpm check` → `wrangler deploy --env dev` → `dev.pinkponk.my.id` |
| PR `development` → `production` | `pnpm check` + E2E + Lighthouse CI |
| Push ke `production` | `wrangler deploy --env production` → `pinkponk.my.id` |

Custom domain (`pinkponk.my.id`, `www`, `dev`) didefinisikan di `wrangler.toml`
(`routes` dengan `custom_domain = true`), bukan diklik manual.

## 3. Rollback

`wrangler rollback --env production` ke versi sebelumnya, lalu revert commit di
`production` lewat PR.
