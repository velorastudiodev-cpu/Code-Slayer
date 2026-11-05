#!/bin/sh
# Pasang paket bahasa di Piston (sekali; tersimpan di volume piston_packages).
URL=${PISTON_URL:-http://127.0.0.1:2000}
until curl -sf "$URL/api/v2/runtimes" > /dev/null; do echo "menunggu Piston..."; sleep 2; done
for pkg in "gcc 10.2.0" "java 15.0.2" "go 1.16.2" "rust 1.68.2" "mono 6.12.0" "kotlin 1.8.20"; do
  set -- $pkg
  echo "pasang $1 $2"
  curl -s -X POST "$URL/api/v2/packages" -H 'content-type: application/json' -d "{\"language\":\"$1\",\"version\":\"$2\"}"
  echo
done
curl -s "$URL/api/v2/runtimes"
echo
