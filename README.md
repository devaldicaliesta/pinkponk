<p align="center"><img src="docs/brand/logo-wordmark-dark.svg" alt="PinkPonk" width="420"></p>

# PinkPonk

Game ping pong web: Vs AI, lokal 2 pemain, online 1v1, dan mode Timing Smash.
Tema neon pink gelap/terang, tanpa database, berjalan di Cloudflare
(`pinkponk.my.id`).

Status: fase dokumen — menunggu persetujuan sebelum menulis kode.

## Dokumen

- [PRD](docs/PRD.md) — mekanik, mode, POV, fitur, prioritas
- [Design system](docs/DESIGN.md) — warna neon, tipografi, karakter, motion
- [Arsitektur](docs/ARCHITECTURE.md) — stack, netcode, struktur folder
- [QA](docs/QA.md) — strategi test dan checklist rilis
- [Security](docs/SECURITY.md) — threat model dan mitigasi
- [Deploy](docs/DEPLOY.md) — domain, Cloudflare, CI/CD

## Branch

- `development` — branch kerja, deploy otomatis ke `dev.pinkponk.my.id`
- `production` — hanya lewat PR dari `development`, deploy ke `pinkponk.my.id`
