# Deploy server eksekusi (supaya C/C++/Java/Go/Rust/C#/Kotlin jalan di APK)

Tanpa server, aplikasi tetap jalan penuh untuk Python, JS/TS, SQL, HTML/CSS, Bash, Git, materi, kuis, game, lab Cyber, dan CTF Arena. Hanya bahasa **compiled** yang perlu server, karena kodenya di-compile di sana (sandbox Piston: tanpa jaringan, ada batas waktu & memori).

**Tanpa server pun**, APK memakai layanan publik **wandbox.org** untuk C, C++, Java, Go, Rust, dan C#. Kode user dikirim ke sana, dan bisa dimatikan di Profil → Server eksekusi. Server sendiri tetap dibutuhkan untuk **Kotlin**, **juri Hashira Trial (C++)**, dan bila tidak ingin bergantung pada layanan pihak ketiga.

## 1. Siapkan VPS

- VPS Linux (Ubuntu/Debian) dengan **RAM minimal 2 GB**. Compiler Java & Kotlin cukup berat.
- **Docker + Docker Compose** terpasang, dengan akses root. Piston butuh container `privileged`, jadi hosting PaaS gratisan seperti Render/Railway/Vercel biasanya **tidak bisa**. Pakai VPS biasa.
- Sebuah domain atau subdomain, misalnya `slayer.domainmu.com`, dengan **A-record mengarah ke IP VPS**.
- Port **80 dan 443** terbuka (untuk HTTPS otomatis dari Let's Encrypt).

## 2. Jalankan di VPS

```bash
git clone https://github.com/velorastudiodev-cpu/Code-Slayer.git
```

```bash
cd Code-Slayer && cp .env.example .env
```

Edit `.env` dan isi `DOMAIN=slayer.domainmu.com`, lalu:

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

Sekali saja, pasang compiler di Piston (perlu beberapa menit):

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml run --rm piston-setup
```

Cek dari komputer mana pun:

```bash
curl https://slayer.domainmu.com/api/health
```

Hasilnya harus berisi `"ok":true`. Selain itu, `https://slayer.domainmu.com` juga menyajikan versi web aplikasi (bisa di-install sebagai PWA).

## 3. Build APK yang memakai server itu

Di komputer yang punya JDK 21 + Android SDK (platform 36, build-tools 36):

```bash
npm install
```

```bash
npm run apk -- https://slayer.domainmu.com
```

Skrip ini:
1. Mengecek `/api/health`.
2. Mengecek bahwa server mengizinkan origin APK (CORS).
3. Build web dengan alamat server itu.
4. `cap sync` dan membuat `android/app/build/outputs/apk/debug/app-debug.apk`.

## Catatan keamanan

- APK (origin `https://localhost` / `capacitor://localhost`) otomatis diizinkan memanggil `/api`. Origin web lain baru diizinkan kalau ditulis di `ALLOWED_ORIGINS` (dipisah koma) di `.env`.
- Server memakai rate limit 60 request/menit per IP. `TRUST_PROXY=1` (otomatis di compose VPS) membuat limit memakai IP asli user, bukan IP Caddy.
- Alamat server harus **https**. Android memblokir koneksi http biasa dari aplikasi.
- Kode user berjalan di sandbox Piston tanpa akses jaringan, dengan batas waktu dan memori.
