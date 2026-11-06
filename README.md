# Code Slayer 鬼殺コード

Aplikasi belajar ngoding bertema Demon Slayer (penggunaan pribadi, non-komersial).

## Download APK Android

[**⬇ Download Code-Slayer.apk terbaru**](https://github.com/velorastudiodev-cpu/Code-Slayer/releases/latest/download/Code-Slayer.apk)

Versi **1.1.0**, Android 7.0 atau lebih baru. Unduh APK lalu buka untuk memasang atau memperbarui aplikasi. Build debug ini ditandatangani dengan kunci yang sama seperti versi 1.0.

C/C++/Java/Go/Rust/C# dapat memakai layanan publik **wandbox.org** melalui internet bila belum ada server sendiri. Kode dikirim ke layanan itu; opsi ini bisa dimatikan di Profil. Kotlin dan juri olimpiade tetap memerlukan server sendiri. Alamat server dapat diatur di Profil → Server eksekusi.

[Lihat semua rilis](https://github.com/velorastudiodev-cpu/Code-Slayer/releases).

```bash
npm install
npm run dev
```

Server eksekusi sendiri untuk pengembangan:

```bash
npm run server    # backend lokal (gcc/g++/javac) di :8787, Vite mem-proxy /api
```

Produksi dengan Piston (sandbox Docker):

```bash
docker compose up -d --build
```

```bash
docker compose run --rm piston-setup
```

Konten:

```bash
npm run content   # build content/*.yaml → src/generated/*.json; hanya track yang berubah (--force: semua)
npm run content -- go rust   # track tertentu saja
npm run content -- projects  # project Swordsmith Village (content/projects → src/generated/meta/projects.json)
npm run ctf                  # lab Cyber & CTF Arena (content/ctf/labs.yaml → src/generated/meta/ctf.json; solusi tiap lab dibuktikan)
npm run olymp                # Hashira Trial (content/olymp → src/generated/meta/olymp.json; soal yang berubah saja, --force: semua)
# Validasi build butuh: python3, gcc/g++/javac, go, rustc, mono (mcs), kotlinc, bash & git asli
npm test          # unit test + cek konten tidak basi
node scripts/verify-runtime.cjs   # semua solusi di runtime browser (butuh npm run dev)
```

Lihat `CHANGELOG.md` untuk progres per milestone.

## PWA & Android (M12)

- **PWA offline**: `npm run build` menghasilkan service worker (vite-plugin-pwa). App shell, materi, kuis, dan soal di-precache; Pyodide di-cache saat pertama dipakai. Setelah sekali dibuka online, Python/JS/SQL/HTML/Bash/Git tetap jalan tanpa internet. Bahasa compiled berlabel "butuh koneksi".
- **APK Android (Capacitor)**. Butuh JDK 21 dan Android SDK (platform 36, build-tools 36):

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

  Supaya C/C++/Java/Go/Rust/C#/Kotlin jalan di APK: deploy server eksekusi ke VPS (lihat **[DEPLOY.md](DEPLOY.md)**, HTTPS otomatis), lalu `npm run apk -- https://domain-server-kamu`. Tanpa server sendiri, C/C++/Java/Go/Rust/C# dapat memakai Wandbox melalui internet; Kotlin dan juri olimpiade tetap memerlukan server sendiri. Semua fitur offline tetap jalan.
- **Ikon**: `python3 scripts/make-icons.py` (pixel art 16×16 → favicon, ikon PWA, ikon launcher & splash Android).

## Test

```bash
npm test          # Vitest: logika, konten, simulator, juri
npm run e2e       # Playwright: alur utama + uji "maks 3 tap" (menyalakan server eksekusi & Vite otomatis)
```

