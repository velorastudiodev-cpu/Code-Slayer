# Code Slayer 鬼殺コード

Aplikasi belajar ngoding bertema Demon Slayer (penggunaan pribadi, non-komersial).

## Download APK Android

[**⬇ Download Code-Slayer.apk**](https://github.com/velorastudiodev-cpu/Code-Slayer/releases/latest/download/Code-Slayer.apk)

Klik tombol di atas untuk langsung mengunduh APK, lalu buka file di Android dan izinkan pemasangan dari browser jika diminta. Membutuhkan Android 7.0 atau lebih baru. APK ini adalah build debug yang sudah ditandatangani dan dapat dipasang langsung tanpa Android Studio.

[Lihat semua rilis](https://github.com/velorastudiodev-cpu/Code-Slayer/releases). Untuk C/C++/Java/Go/Rust/C#/Kotlin, diperlukan server eksekusi terpisah seperti dijelaskan di bawah. Rilis ini belum menyertakan alamat server tersebut.

```bash
npm install
npm run dev
```

C, C++, Java butuh server eksekusi:

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

  Supaya C/C++/Java/Go/Rust/C#/Kotlin jalan di APK, build web dengan `VITE_API_URL=https://server-kamu/api` (server eksekusi di-deploy terpisah). Tanpa itu, bahasa compiled berlabel "butuh koneksi" dan semua fitur offline tetap jalan.
- **Ikon**: `python3 scripts/make-icons.py` (pixel art 16×16 → favicon, ikon PWA, ikon launcher & splash Android).

## Test

```bash
npm test          # Vitest: logika, konten, simulator, juri
npm run e2e       # Playwright: alur utama + uji "maks 3 tap" (menyalakan server eksekusi & Vite otomatis)
```

