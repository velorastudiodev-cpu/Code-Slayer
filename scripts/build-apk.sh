#!/usr/bin/env bash
# Build APK debug yang memakai server eksekusi milikmu untuk C/C++/Java/Go/Rust/C#/Kotlin.
#   npm run apk -- https://slayer.domainmu.com
# Butuh: JDK 21 + Android SDK (platform 36, build-tools 36) dengan ANDROID_HOME terpasang.
set -euo pipefail
url="${1:-}"
if [ -z "$url" ]; then
  echo "Pakai: npm run apk -- https://domain-server-kamu   (tanpa /api; tanpa URL = APK offline tanpa bahasa compiled)" >&2
  api=""
else
  url="${url%/}"; url="${url%/api}"
  case "$url" in
    https://*) ;;
    *) echo "URL harus https:// (Android memblokir http biasa dari aplikasi)." >&2; exit 1 ;;
  esac
  api="$url/api"
  echo "Cek server: $api/health"
  if ! curl -fsS --max-time 15 "$api/health" | grep -q '"ok":true'; then
    echo "Server tidak menjawab /api/health dengan benar. Pastikan sudah di-deploy (lihat DEPLOY.md)." >&2; exit 1
  fi
  if ! curl -fsS --max-time 15 -o /dev/null -D - -H 'Origin: https://localhost' "$api/health" | grep -qi '^access-control-allow-origin: https://localhost'; then
    echo "Server belum mengizinkan origin APK (CORS). Deploy ulang dengan versi server terbaru." >&2; exit 1
  fi
fi
VITE_API_URL="$api" npm run build
npx cap sync android
(cd android && ./gradlew assembleDebug)
echo "APK siap: android/app/build/outputs/apk/debug/app-debug.apk (server: ${api:-tidak ada})"
