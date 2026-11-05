# Changelog

## Pasca-M12 — Siap deploy: bahasa compiled di APK
Sebelumnya APK tidak bisa memakai server eksekusi jarak jauh: server belum mengizinkan CORS, dan compose hanya mendengarkan 127.0.0.1. Perbaikannya:
- **CORS dengan allowlist** (`@fastify/cors`):
  - Origin APK (`https://localhost`, `capacitor://localhost`, iOS) otomatis diizinkan. Origin lain lewat `ALLOWED_ORIGINS`; origin asing tetap ditolak.
  - Diuji di browser asli: frontend di origin lain memanggil `/api` lewat URL absolut. Origin asing diblokir (`Failed to fetch`), origin yang diizinkan mendapat 200 dan soal C dinilai server.
- **Deploy VPS**:
  - `docker-compose.vps.yml` + `deploy/Caddyfile` memasang HTTPS otomatis (Let's Encrypt) di depan aplikasi.
  - `TRUST_PROXY=1` membuat rate limit memakai IP asli user.
  - Ditambah `.env.example` dan panduan **DEPLOY.md**.
- **`npm run apk -- https://domain`**: mengecek `/api/health` & CORS server, build web dengan alamat server, `cap sync`, lalu `assembleDebug`. URL non-https ditolak (Android memblokir http biasa).
- `.dockerignore` mengecualikan hasil build Android.
- Test server 6/6 (termasuk CORS positif/negatif).

### Catatan jujur
- Deploy ke VPS belum dicoba di sesi ini: tidak ada daemon Docker di container dan tidak ada VPS. `docker compose config` untuk kedua file sudah valid, dan compose menolak jalan bila `DOMAIN` kosong.
- Caddyfile (3 baris `reverse_proxy` standar) belum divalidasi dengan binary Caddy. Pengunduhan binary-nya ditolak oleh pengaman sesi, jadi tidak saya paksa.

## M8 — Track Cyber (etika, lab sandbox, OWASP mini apps, CTF Arena) + terminal simulasi + track Bash/Linux
Acceptance: semua lab berjalan di sandbox internal; flag tervalidasi. (Dikerjakan setelah M9–M12, melanjutkan interpreter Bash yang sudah ada.)

- **Terminal Linux interaktif** (`/terminal`) di atas shell Bash buatan sendiri + filesystem virtual (differential test vs bash asli).
  - Prompt, riwayat ↑↓, Tab completion perintah & path, Ctrl+L / `clear`, Ctrl+C.
  - Tombol bantu untuk HP (Tab, ↑, ↓, |, >, ~, …).
  - Filesystem tersimpan otomatis di IndexedDB, bisa di-reset; daftar `man` 45 perintah.
- **36 lab sandbox** (`content/ctf/labs.yaml`), semuanya simulasi milik aplikasi, tanpa request ke jaringan asli:
  - **Web (server rentan disimulasikan di browser)**: robots.txt, SQLi login & UNION (sql.js), IDOR, cookie peran tanpa tanda tangan, JWT alg none, SSRF, path traversal, mass assignment, command injection (shell simulasi). Pakai request builder: metode, URL, cookie, header, body.
  - **XSS (reflected, stored dengan filter bocor, DOM) & CSRF**: halaman korban dirender di `iframe sandbox="allow-scripts"` (tanpa same-origin, tidak bisa menyentuh aplikasi). Harness melaporkan `alert()` / submit form lewat postMessage.
  - **Forensik/Linux di terminal lab**: file tersembunyi + base64, analisis auth.log, `strings`, izin berkas, proses penyusup (`ps aux`), hex dump (`xxd -r -p`), `grep -r`, persistensi crontab.
  - **Kriptografi**: Cipher Playground (base64, hex, ROT13, Caesar, Vigenère, XOR, balik, MD5, SHA-256), crack MD5 dengan wordlist kecil, brute force PIN SHA-256.
  - **Reverse engineering**: crackme JS, XOR, terjemahan assembly x86.
  - **Packet viewer** (rekaman simulasi, filter `http`/`dns`/`ip.src==`): Basic Auth di HTTP, eksfiltrasi DNS.
  - **OSINT dengan data fiktif**: EXIF GPS, pivot WHOIS.
- **Flag tervalidasi**:
  - Setiap lab dibuktikan saat build (`npm run ctf`): solusinya dijalankan terhadap mesin lab yang sama, termasuk payload XSS/CSRF di Chromium asli, dan harus menghasilkan flag lab itu. Lab XSS juga diuji kontrol negatif.
  - Bundel hanya menyimpan flag ter-obfuscate + hash SHA-256; flag di isi berkas lab diganti token dan baru diisi saat lab dibuka.
  - Input user dicocokkan dengan hash; format `SLAYER{...}`.
- **CTF Arena** (`/ctf`): jeopardy 5 kategori (web, crypto, forensics, rev, misc), 36 flag, 4.500 poin.
  - Papan skor pribadi: poin, gelar, riwayat flag.
  - Didahului **ikrar etika wajib** (izin tertulis, UU ITE, responsible disclosure).
  - Writeup + kode perbaikan setelah flag valid. Poin flag → XP & Koban; 4 pencapaian baru.
- **Track Bash & Linux: 56 soal** di 19 bab, mulai navigasi sampai project backup + rotasi.
  - Jenis soal: write, predict, bug hunt, Parsons, kuis, jawaban singkat.
  - Saat build setiap solusi dibandingkan dengan **bash asli** (kecuali yang memang khas simulasi: `ps`, `pwd`).
- **Track Cyber Security: 78 challenge** di 19 bab:
  - Dibuka dengan bab **Etika & Hukum** (UU ITE, scope, responsible disclosure).
  - CIA triad, jenis serangan, Linux & jaringan, kriptografi, password hashing (salt, bcrypt).
  - OWASP (SQLi, XSS, CSRF/IDOR, auth/SSRF), secure coding, forensik, rev, OSINT, analisis log, bab CTF.
  - Semua 36 lab tampil sebagai jenis latihan baru **Lab Sandbox**; solve di bab ikut tercatat di Arena.
  - **Patch the Bug** (6 soal JS/Python): kode rentan (SQL string, HTML mentah, IDOR, path traversal, shell injection, mass assignment) harus diperbaiki sampai tes keamanan lolos. Build memastikan kode rentan memang gagal.
- **Interpreter Bash diperbaiki** agar sama dengan bash asli (ditemukan oleh validasi konten):
  - `find -perm` bentuk simbolik (`-o=r`, `-u=s`).
  - `trap … EXIT` (top-level & subshell; subshell tidak mewarisi trap).
  - Status `set -u` di subshell (1, bukan 127).
  - Opsi `xargs` berhenti di nama perintah (`xargs rm -r`).
- **Test**:
  - Unit lab engine (validasi flag, tidak ada flag asli di bundel, SQLi/IDOR/traversal/SSRF/cmd/JWT positif & negatif, harness, crypto, crackme, packet filter).
  - E2E M8 29/29: terminal (pipeline, Tab, riwayat, persisten, clear); soal Bash; ikrar etika; SQLi; flag salah ditolak; XSS bypass filter di iframe sandbox; forensik terminal; Caesar; wordlist; skor; lab di bab Cyber; Patch the Bug.
  - Playwright 13/13 (+ terminal & CTF; Terminal dan CTF Arena ≤ 2 tap). Axe: 0 pelanggaran di 27 halaman × 2 tema.
  - Regresi E2E M9–M11 lolos.

### Catatan jujur M8
- **Improvisasi**: terminal memakai komponen DOM buatan sendiri, bukan xterm.js seperti di PRD. Alasannya keyboard HP, copy-paste, dan pembaca layar lebih andal di input DOM daripada kanvas. Fungsinya setara (prompt, riwayat, Tab, warna); escape code ANSI tidak didukung.
- Flag disimpan di perangkat (obfuscate + hash), jadi orang yang membedah kode aplikasi tetap bisa menemukannya. Papan skornya pribadi, bukan kompetisi, jadi ini wajar untuk aplikasi offline.
- Server web rentan adalah simulasi perilaku (fungsi TypeScript + sql.js + shell simulasi), bukan server HTTP sungguhan. Lab "pcap" memakai rekaman paket tiruan berformat tabel, bukan berkas .pcap biner.
- Target ≥ 60 challenge + 30 flag terpenuhi: 78 challenge track + 36 flag Arena. Lab yang sama muncul di bab dan di Arena (satu solve tercatat di keduanya).

## M12 — PWA offline, APK Android (Capacitor), polish, suite Playwright
Acceptance: APK terpasang di Android; alur utama lolos test E2E; uji "maks 3 tap" lolos.

- **PWA offline** (vite-plugin-pwa):
  - Manifest berisi nama, ikon pixel art 192/512 + maskable, dan tema.
  - Service worker meng-precache app shell + semua chunk materi/soal/kuis (59 file, 5,5 MB).
  - Pyodide di-cache saat pertama dipakai; `/api` selalu ke jaringan.
  - Uji offline di browser asli (10/10): materi, soal Python & JS dinilai tanpa internet, mode game terbuka, bahasa compiled berlabel "butuh koneksi".
- **APK Android** via Capacitor 8:
  - `id.codeslayer.app`, minSdk 24, target/compile SDK 36.
  - Build debug 13 MB dengan Gradle 8.14 + AGP 8.13 di container.
  - Ikon launcher (adaptive) & splash pixel art dari `scripts/make-icons.py`.
  - Bahasa compiled di APK memakai `VITE_API_URL` ke server eksekusi yang di-deploy.
- **Polish**:
  - Efek suara chiptune 8-bit disintesis WebAudio (tanpa file audio): menang, kalah, fanfare skor 100/pencapaian/rarity 5★, koin. Bisa dimatikan di Profil → Efek suara.
  - Animasi tebasan pixel saat iblis tertebas dan efek "pop" hasil tes. Keduanya mati dengan "Kurangi animasi" atau `prefers-reduced-motion`.
  - Fokus keyboard selalu terlihat.
- **Aksesibilitas**: audit axe-core (WCAG 2 A/AA + best practice) di 19 halaman × tema terang/gelap → 0 pelanggaran. Yang diperbaiki:
  - Kontras komentar/nomor baris & token koral editor One Dark (3,6:1 → ≥ 4,5:1).
  - Badge di atas warna aksen companion.
  - h1 di Beranda & kastil kosong.
  - Urutan heading halaman soal.
- **Performa** (build produksi, profil baru, tanpa cache):
  - UI siap dipakai 0,4 dtk (FCP 0,36 dtk).
  - Di 4G lambat (9 Mbps, RTT 170 ms) + CPU 4× lebih lambat: 1,6 dtk (target PRD < 3 dtk).
  - Runtime berat (Pyodide, sql.js, editor, SDK mentor) tetap lazy.
- **Suite Playwright di repo** (`npm run e2e`, server dinyalakan otomatis): 11/11 lolos.
  - 10 alur utama: onboarding, bab terkunci, soal dinilai salah→benar + XP, C di server eksekusi, Playground, mode game, ekonomi/pencapaian/gacha, Swordsmith Village, Butterfly Mansion, Hashira Trial.
  - **Uji "maks 3 tap"**: BFS atas tautan yang terlihat dari Beranda. Ke-20 fitur utama tercapai dalam ≤ 2 tap.
- **Pemasangan di Android**: APK dipasang ke emulator Android 11 (API 30, x86_64) lewat `adb install` → `Success`.
  - `pm list packages` memuat `id.codeslayer.app`.
  - `dumpsys package` mencatat versionName 1.0, targetSdk 36, waktu pasang.
- Regresi: Vitest 244/244, E2E M10 32/32, M11 26/26, Playwright 11/11.

### Catatan jujur M12
- **Membuka aplikasi di emulator belum terverifikasi.** Container tidak punya KVM, jadi emulator berjalan dengan emulasi CPU software. Boot butuh ±10 menit, dan saat WebView dijalankan system_server Android mati berulang kali (watchdog), sehingga launcher/activity tidak tersedia dan tangkapan layar hitam. Bundel web di dalam APK sama persis dengan yang lolos uji Playwright & offline, tetapi uji buka-aplikasi tetap perlu dilakukan di HP sungguhan (`adb install -r app-debug.apk`).
- APK yang dibuat adalah build **debug** (ditandatangani debug key). Untuk Play Store perlu keystore rilis & `./gradlew bundleRelease`.
- Mirror Maven Central Google dipakai lewat `~/.gradle/init.gradle` di container (Maven Central membalas 429). Tidak ada perubahan di proyek.
- Efek suara belum bisa diuji secara audio otomatis; yang diuji hanya bahwa pemanggilannya tidak memunculkan error.

## M11 — Hashira Trial: jalur olimpiade OSN-K → IOI + Menuju CS/STEI ITB
Acceptance: terkunci sampai rank Kinoe; soal asli beratribusi; simulasi ujian dengan timer dan skor subtask berjalan.

- **Gerbang** (`/olimpiade`): terbuka bila rank Kinoe di Python atau C++ DAN semua bab Fondasi DSA lulus. Sebelumnya tampil "terkunci" dengan progres tiap syarat; semua sub-halaman (termasuk URL langsung) ikut terkunci.
- **5 tahap resmi**: Kabupaten (OSN-K), Provinsi (OSN-P), Nasional (OSN), Pelatnas (TOKI), Internasional (IOI).
- **Soal asli beratribusi (159 + 9 paket objektif)**: OSN-P 2020–2026, OSN 2016–2026, IOI 2016–2024.
  - Metadata diambil dari API publik **TLX TOKI**: judul, kompetisi, tahun, tautan `tlx.toki.id/problems/<set>/<alias>`, batas waktu/memori.
  - Ringkasan ditulis ulang sendiri; soal tidak disalin.
  - Dikerjakan & dinilai di TLX (judge resmi), lalu ditandai *Accepted* di aplikasi (+30 XP/Koban sekali).
- **40 soal orisinal setara dengan subtask** (Kabupaten 4, Provinsi 9, Nasional 11, Pelatnas 9, gaya IOI 3, C++ untuk CP 4). Topik: prefix sum, greedy, binary search, two pointers, DP (knapsack, LIS, edit distance, bitmask TSP, DP pohon), BFS, Dijkstra, MST/DSU, sieve/φ, kombinatorika modular, Fenwick, segment tree, inversi, KMP, rolling hash, convex hull, LCA, query offline, eksponensiasi matriks.
  - Validasi build (`npm run olymp`):
    - Solusi referensi C++ lolos semua tes dalam time limit soal.
    - Solusi Python (tahap awal) memberi output sama.
    - **Solusi naive harus mendapat TEPAT skor parsial yang dirancang**, bukti bahwa subtask benar-benar membedakan O(N²)/eksponensial dari solusi efisien.
  - Input besar dibangkitkan generator JS deterministik (PRNG berbiji) yang sama di build & browser, jadi bundle tetap kecil (olymp.json 230 KB, dimuat lazy).
- **Juri subtask gaya IOI**:
  - C++ di server eksekusi dengan time limit per soal (server kini menerima `timeLimitMs` & input hingga 12 MB).
  - Python di Pyodide untuk tahap Kabupaten/Provinsi.
  - Verdict AC/WA/TLE/RE/CE.
  - Skor = terbaik per subtask lintas submisi.
  - Riwayat submisi.
- **Editorial bertingkat**: hint → ide kunci → solusi + kompleksitas → kode referensi. Kode baru terbuka setelah minimal satu submisi.
- **215 soal objektif orisinal**: logika, aritmetika, algoritmika (tracing pseudocode), kombinatorika, diskrit, penalaran. Kunci jawaban dihitung dengan eksekusi/brute force (`scratchpad/gen/objgen.py`), lengkap dengan pembahasan langkah demi langkah.
- **6 virtual contest** dengan timer:
  - OSN-K objektif: 90 menit, benar +4, salah −1.
  - OSN-P: 3 jam.
  - OSN Hari 1 & 2: 5 jam.
  - Pelatnas: 5 jam.
  - IOI: 5 jam.
  - Sesi tersimpan, bisa dilanjutkan, ditutup otomatis saat waktu habis.
  - Hasil: skor, medali, dan ranking pribadi antarpercobaan. Medali +100/200/300 XP/Koban.
  - Tautan ke kontes asli di TLX.
- **Topic Tracker** (23 topik, rekomendasi soal berikutnya), **C++ untuk CP** (template, operasi per detik, STL, jebakan klasik + 4 latihan).
- **Menuju CS/STEI ITB**:
  - Readiness Meter (objektif, problem solving, diskrit).
  - Latihan diskrit.
  - Penalaran ber-timer (15 menit).
  - Lab logika proposisi & segitiga Pascal interaktif.
  - Roadmap prestasi, dengan catatan wajib cek aturan terbaru di situs resmi ITB/SNPMB.
- 6 pencapaian baru (skor 100 ×1/10/30, arsip 10, medali, emas). Dexie v6 (`subs`, `runs`, `obj`).
- **Test**:
  - Unit 9: gerbang, skor subtask, medali, skor objektif ±, topic tracker, readiness, kesegaran hash, skala konten, atribusi, determinisme generator.
  - E2E M11 (26 cek): gerbang terkunci/terbuka, arsip TLX, naive 30 → referensi 100, Python, CE, objektif, kontes OSN-P (40 → 100/400, ranking), kontes OSN-K ditutup otomatis saat waktu habis, topic tracker, CP, STEI.

### Catatan jujur M11
- Soal asli TIDAK dinilai di aplikasi: pernyataan & data ujinya hak TOKI/IOI. Penilaiannya di TLX, lalu status *Accepted* ditandai sendiri oleh user (sistem kepercayaan).
- Ringkasan arsip berupa konteks singkat. Untuk sebagian soal OSN 2023–2026, ringkasan hanya menggambarkan latar soal, bukan tugas lengkapnya.
- Ambang medali virtual contest adalah aproksimasi (persentase skor maksimum), bukan batas medali resmi tahun tertentu.
- Soal objektif resmi OSN-K/OSN-P hanya ditautkan (9 paket di TLX), tidak disalin. Bank 215 soal di aplikasi adalah soal orisinal bergaya sama.
- Time limit diukur sebagai waktu dinding termasuk start proses. Solusi referensi dijalankan jauh di bawah batas, sehingga margin cukup.

## M10 — Swordsmith Village, Butterfly Mansion (SRS), Solution Gallery, AI Mentor opsional
Acceptance: project bertahap dinilai dengan tes otomatis; SRS menjadwalkan review.

- **Swordsmith Village** (`/desa`): 8 project dengan 4 tahap per project (total 32 tahap).

  | Project | Bahasa |
  |---|---|
  | To-do CLI | Python |
  | Kalkulator | C |
  | Router REST | Go |
  | Snake | JS |
  | Password manager | Rust |
  | Port scanner etis | Python |
  | Kasir | Java |
  | Toko | SQL |

  - Port scanner etis hanya berjalan di data simulasi dengan cek cakupan izin; tidak ada jaringan sungguhan.
  - Project terbuka setelah bab prasyarat di track-nya lulus.
  - Satu draf kode per project, disimpan otomatis dan terbawa dari tahap ke tahap.
  - Penilaian tahap k = tes tahap k + **tes regresi tahap 1..k−1**. Toko (SQL) memakai query pemeriksa per tahap.
  - Build memastikan:
    - Starter gagal di tahap 1.
    - Solusi tahap sebelumnya gagal di tahap baru.
    - Solusi tiap tahap tidak merusak tahap lama.
  - Hadiah: +40 XP/Koban per tahap (sekali), +100 tambahan saat project tuntas.
  - Pencapaian baru: tahap 1/10, project 1/4/8 (8 = Mark tier 4).
- **Butterfly Mansion** (`/mansion`): SRS FSRS (ts-fsrs).
  - Setiap soal yang pernah dicoba otomatis jadi kartu:
    - Pernah gagal → kartu *mistake*, langsung jatuh tempo.
    - Lulus tanpa gagal → kartu *learned*, dijadwalkan ke depan.
  - Rating review otomatis dari hasil:
    - Lulus langsung = Good (Easy untuk ★1).
    - Lulus setelah gagal atau hint = Hard.
    - Menyerah = Again.
  - **Mistake Journal**: soal yang gagal, jumlah gagal, jenis error, ringkasan pesan kegagalan, dan status sudah diperbaiki atau belum.
  - **Rehab Quest**: sesi khusus kartu kesalahan.
  - Tautan "N review jatuh tempo" di Beranda, kartu di hub Latihan, +5 XP/Koban per review per soal per hari, pencapaian review 1/50/200 dan rehab 10.
- **Solution Gallery**: muncul setelah lulus soal kode.
  - Membandingkan Solusimu vs Referensi vs alternatif (paling idiomatis / paling efisien / paling mudah dibaca).
  - Metrik baris & karakter, catatan kenapa pendekatannya berbeda, kode berdampingan.
  - 36 alternatif untuk 26 soal Python & JS (`content/<track>/_gallery.yaml`). Setiap alternatif divalidasi saat build: harus lolos semua tes soalnya.
- **AI Mentor (opsional, mati secara default)**: Profil → AI Mentor.
  - Isi API key Anthropic sendiri (disimpan hanya di IndexedDB perangkat). Setelah menjalankan tes muncul tombol "Jelaskan kodeku" / "Review kodeku".
  - Jawaban di-stream dari Claude lewat SDK resmi `@anthropic-ai/sdk`, langsung dari browser ke API Anthropic.
  - Mentor diinstruksikan tidak memberi solusi lengkap.
  - Tidak muncul di ujian.
  - Error key/rate limit/koneksi dijelaskan dalam bahasa Indonesia.
  - Semua fitur lain berjalan 100% tanpa mentor.
- **Test**:
  - Unit SRS (5).
  - Hash `projects.json`.
  - E2E M10 (32 cek): project 4 tahap dengan starter gagal, draf terbawa, tahap 1 gagal di tahap 2, sampai Project tuntas; Mansion (kartu kesalahan jatuh tempo → review → dijadwalkan ulang), Journal, Gallery.
  - Mentor diuji dengan API tiruan (respons stream dan key ditolak). Tidak ada panggilan API sungguhan.
  - Regresi E2E M7 & M9 tetap lolos.

### Catatan jujur M10
- Metrik Gallery hanya baris & karakter. Klaim "paling efisien" dijelaskan di catatan (kompleksitas), tidak diukur waktu nyata, karena waktu di browser terlalu berisik untuk dibandingkan secara adil.
- Gallery baru tersedia untuk 26 soal Python/JS. Soal lain tetap menampilkan perbandingan Solusimu vs Referensi.
- Kartu SRS dibuat saat Beranda/Latihan/Mansion dibuka (sinkron dari riwayat), bukan seketika di halaman soal.
- AI Mentor memanggil API dari browser. Ini aman hanya karena key milik user sendiri. Biaya ditanggung akun user, dan belum diuji dengan key sungguhan di sesi ini (hanya API tiruan).
- M8 masih belum selesai: UI terminal interaktif, lab cyber, CTF Arena, konten track Bash & Cyber.

## M9 — Track Go, Rust, C#, Kotlin, HTML/CSS, Git (simulasi), Networking, SQL lanjutan
Acceptance: semua track M9 punya ≥ 40 soal.

| Track | Soal |
|---|---|
| Go | 40 |
| Rust | 40 |
| C# | 40 |
| Kotlin (track mobile) | 40 |
| HTML/CSS | 40 |
| Git | 42 |
| Networking | 42 |
| SQL | 53 (sebelumnya 3) |

- **Go, Rust, C#, Kotlin**
  - Compiler asli di server eksekusi (go 1.24, rustc 1.97, mono `mcs`, kotlinc) dan mapping Piston.
  - Mode editor, template Playground, penjelas error per bahasa (variabel tak terpakai di Go, borrow/move di Rust, CS0103 di C#, `val` di Kotlin, dll.).
  - Isi bab: Fondasi (7 bab) + Koleksi + String. Solusinya idiomatik per bahasa: slice/map di Go, iterator/`match`/`BTreeMap` di Rust, LINQ di C#, `when`/`groupingBy` di Kotlin.
  - Semua soal dan 72 contoh pelajaran divalidasi dengan compiler asli.
- **SQL lanjutan**
  - Dataset korps (slayer, pangkat, misi, iblis, dompet, guru).
  - 16 bab: SELECT sampai window function, CTE rekursif, dan query plan.
  - Field `after` (query pemeriksa setelah kode user) membuat INSERT/UPDATE/DELETE, constraint (dicoba dengan data buruk lewat `INSERT OR IGNORE`), VIEW, INDEX (lewat EXPLAIN QUERY PLAN), dan transaksi dinilai otomatis.
  - EXPLAIN QUERY PLAN tampil sebagai pohon seperti CLI sqlite3.
- **Networking**: OSI/TCP-IP, IP & subnetting, port, TCP/UDP, DNS, HTTP, TLS, routing, NAT/firewall, REST/JSON, packet. Soal Python (CIDR, longest-prefix match, aturan firewall, resolver DNS + CNAME, parsing HTTP) divalidasi dengan python3.
- **Dua jenis latihan baru**: Kuis Skenario (`quiz`) dan Jawaban Singkat (`answer`, tidak peka huruf besar/kecil & spasi). Kuis ikut masuk Infinity Castle dan Time Attack.
- **Git (simulasi)**
  - `git` asli-rasa di terminal simulasi M8: init/add/commit/status/log/diff/branch/switch/merge (fast-forward + 3 arah per baris gaya diff3, penanda konflik, `--abort`), rebase, reset, revert, cherry-pick, stash, tag, remote/push/pull/clone (repo bare), `.gitignore`, reflog, `-q`.
  - Soal dinilai dari STATE repo tanpa hash: branch aktif, isi tiap branch, `status --short`.
  - **Graf commit visual** sebelum & sesudah perintah user.
  - 19 skenario diferensial dan semua 42 soal identik dengan git asli.
- **HTML/CSS**
  - Pemeriksa deklaratif (`src/run/htmlcheck.ts`): struktur, teks, atribut, CSS hasil cascade (specificity, `!important`, inline, pewarisan, shorthand, `@media` di lebar tertentu), label input, alt gambar.
  - Logika yang sama berjalan di browser (DOMParser) dan build (jsdom). Kode user tidak dieksekusi saat dinilai.
  - Preview langsung di iframe sandbox tanpa izin script, di soal, pelajaran, dan Playground.
- **Bash sebagai bahasa yang dinilai** (bagian dari M8 yang tertunda): worker dengan VFS baru per tes, mode editor shell, Playground. Build konten membandingkan setiap solusi bash/git dengan **bash & git asli**.
- **Build konten**: `npm run content -- track` atau hanya track yang sumbernya berubah. Validasi `bug_line` (harus satu-satunya baris yang berbeda) dijalankan saat menulis konten.
- **Test**:
  - Vitest 229 test, termasuk kompilasi 4 bahasa baru, 19 skenario git vs git asli, dan pemeriksa HTML/CSS.
  - verify-runtime di browser asli: 120/120 (SQL, Networking, Git, HTML/CSS) dan 160/160 (Go/Rust/C#/Kotlin lewat API).
  - E2E M9 (16 cek, 2× lolos): graf Git, jawaban Git yang salah ditolak, preview & syarat HTML, kuis, jawaban singkat, Python, Go via server, SQL `after`, Rust/C#/Kotlin, Playground HTML/Bash, tanpa overflow 390 px, tanpa error JS.

### Improvisasi vs PRD
- Soal Fondasi Go/Rust/C#/Kotlin sengaja sejajar (prompt & test sama, kode idiomatik per bahasa), supaya pindah bahasa terasa seperti "jurus yang sama, pernapasan berbeda". Generatornya di luar repo; YAML hasilnya adalah sumber resmi.
- Konten Kotlin kompatibel dengan Kotlin 1.3 (lokal) sampai 1.8 (Piston): `readLine()!!`, bukan `readln()`.
- Git dinilai lewat state, bukan output perintah, karena hash commit selalu berbeda.
- Konflik merge diselesaikan per baris (diff3), bukan per file, mengikuti perilaku git asli.
- HTML/CSS tidak memakai layout browser: pemeriksa menghitung cascade sendiri supaya hasilnya sama persis di build dan di HP. Batasannya: syarat yang butuh layout (lebar terhitung, posisi) belum didukung.
- Kotlin dinilai sekitar 1,7 detik per soal di server lokal karena kompilasi JVM.

### Catatan jujur
- **M8 masih WIP** dan dilewati atas permintaan user. Interpreter Bash (128/128 identik dengan bash asli) dan simulator Git sudah ada, tapi **terminal interaktif, lab cyber, CTF Arena, dan konten track Bash/Cyber belum dibuat**.
- PRD untuk Networking menyebut "diagram interaktif". Yang ada sekarang kuis, jawaban singkat, dan soal Python; diagram interaktif belum.
- Bab Menengah ke atas untuk Go/Rust/C#/Kotlin belum ada (target v1.0 per track lain ≥ 40 sudah terpenuhi).

## M7 — Gamifikasi: Koban, gacha, Bond, buff, Streak Freeze, pencapaian, 23 karakter & 10 iblis
- **23 karakter + 10 iblis**, semua digambar sendiri sebagai pixel art 32×32 di rig yang sama (tanpa art resmi/fan-art), masing-masing 5 ekspresi + efek pernapasan saat menang.
  - Karakter: 20 pendekar (Tanjiro, Zenitsu, Inosuke, Shinobu, Rengoku, Giyu, Kanao, Muichiro, Mitsuri, Obanai, Sanemi, Gyomei, Tengen, Genya, Urokodaki, Sabito, Makomo, Murata, Aoi, Kanae) + Nezuko, Tamayo, Yushiro. Ciri khas dijaga: haori dua sisi Giyu, topeng tengu Urokodaki, topeng rubah Sabito/Makomo, mata heterokromia & ular Obanai, bambu Nezuko, jimat kertas Yushiro.
  - Iblis: Muzan, Kokushibo (enam mata), Doma, Akaza, Hantengu, Gyokko (vas), Daki, Gyutaro, Rui, Enmu. Masing-masing mewakili konsep sulit (PRD §2.2) dan tampil sebagai lawan: Boss Raid, Lower/Upper Moon Exam (Rui/Enmu, lalu Akaza → Doma → Kokushibo → Muzan), lantai boss Infinity Castle, dan Bestiari Iblis.
  - Rig baru: wajah khusus (topeng, mata banyak), wajah iblis (pupil celah, taring), mata kanan beda warna, 13 efek pernapasan baru (kabut, cinta, ular, angin, batu, suara, bunga, matahari, bulan, darah, es, jaring, mimpi).
- **Koban 🪙**, dihitung ulang dari riwayat sehingga tidak bisa dobel atau hilang. Yang disimpan hanya pengeluaran (tabel `spends`, Dexie v4).
  - Sumber: latihan lulus pertama kali (XP/2 + 5), Daily Kata 30, Lower Moon 50, Upper Moon 150, Final Selection 20, misi harian 15/misi (+25 kalau tuntas), mode game dari rekor terbaik per hari (Raid: rekor per soal per minggu), dan hadiah pencapaian.
  - Mengulang soal yang sama tidak memberi Koban lagi.
- **XP & Slayer Level** global (level n butuh 50·n·(n−1) XP).
- **Gacha kosmetik** (`/gacha`, satu tap dari chip Koban di topbar), tanpa uang asli.
  - Isi: 18 karakter, 8 warna Nichirin (sekaligus warna aksen UI), 5 skin haori, 3 tema editor CodeMirror, 6 efek pernapasan.
  - Peluang ★★★ 4% / ★★ 26%. **Pity**: ★★ paling lambat tarikan ke-10, ★★★ paling lambat tarikan ke-50 (dites dengan sumber acak terburuk).
  - Item yang belum dimiliki 3× lebih mungkin keluar; duplikat dikembalikan 30%.
  - Pembelian atomik: saldo dihitung ulang di dalam transaksi, jadi double-tap tidak bisa membuat minus.
  - Lemari untuk memakai kosmetik.
- **Bond**: poin dari aktivitas berhasil saat karakter jadi companion (+10 per duplikat gacha). Lv 1–5 membuka kutipan, 2 "Tips dari Hashira" (best practice nyata sesuai track mentornya), cerita pendek, dan ikatan penuh. Semua teks ditulis sendiri.
- **Buff pasif**: satu per karakter dan semuanya benar-benar berlaku, misalnya:
  - Giyu +1 nyawa / Gyomei +2 nyawa di Castle
  - Zenitsu Time Attack ×1.2
  - Inosuke Bug Rush +15 dtk
  - Tanjiro hint pertama gratis
  - Tengen gacha −10%
  - Nezuko Streak Freeze −50%
  - Mitsuri Bond ×2
  - bonus Koban per mode atau jenis latihan untuk yang lain

  Buff yang aktif ditampilkan di mode game.
- **Hint & Koban** (PRD §8): soal ★1–★2 gratis; soal ★3+ 10 Koban per hint, gratis setelah 2 kali gagal. Hint yang sudah dibuka tersimpan.
- **Streak + Streak Freeze** (150 Koban, maks 2): menutup satu hari bolong, hanya kalau dibeli sebelumnya. **Heatmap** 18 minggu ala GitHub di Profil (hari yang diselamatkan freeze ditandai biru).
- **139 pencapaian**, termasuk **11 Demon Slayer Mark** (streak 30/100, Castle lantai 30, Raid 4 minggu, 100 soal sekali coba, Upper Moon level Profesional, DP, dll.).
  - Contoh: First Blood, Segfault Survivor, Lolos dari Akaza (timeout), Typo Slayer, Recursion Master, Poliglot, Waktu Iblis Keluar.
  - Dihitung dari data (tidak bisa hilang); hadiah Koban per tier.
  - Toast ringkas yang hilang sendiri (satu toast walau beberapa terbuka sekaligus).
- Profil baru: Slayer Level, streak & freeze, heatmap, tautan ke Pencapaian / Karakter / Gacha.
- Test:
  - Unit (66): integritas sprite (32×32, setiap piksel punya warna, 5 ekspresi berbeda, sprite unik), Koban anti-farming, buff, pity, refund, hint, Bond, freeze, heatmap, pencapaian.
  - E2E M7 (29 cek): Koban naik sekali saja, toast, hint gratis/berbayar & tersimpan, gacha 10×, saldo kurang ditolak di transaksi, buff Giyu/Zenitsu/Inosuke, Bond Lv 1 membuka kutipan, Nichirin → aksen, tema editor, sprite iblis di Raid & ujian, Streak Freeze menyelamatkan hari bolong, tanpa overflow, tanpa error JS.
  - Regresi E2E M3–M6 lolos.

### Improvisasi vs PRD
- Koban & pencapaian **diturunkan** dari riwayat, bukan saldo yang ditambah-kurang. Tidak ada state yang bisa korup, dan aturan baru otomatis berlaku untuk riwayat lama.
- Pencapaian berbasis ujian (Recursion Master dll.) wajib lewat ujian, tidak terbuka hanya karena placement. Level "tuntas" boleh dari placement (Final Selection membuktikan kemampuan).
- Setiap attempt mencatat companion yang aktif (hook Dexie), jadi Bond dan buff Koban dihitung sesuai companion saat itu, bukan companion sekarang.
- Efek pernapasan saat jawaban benar = ekspresi "Menang" companion beserta efeknya (bisa diganti lewat gacha), bukan animasi layar penuh, supaya tidak mengganggu ngoding.
- Achievements menunjukkan progres (nilai/target), bukan hanya terkunci/terbuka.
- E2E lama M1/M2 sudah basi sejak M3 (ujian kini wajib soal kode, daftar latihan hanya track yang dimulai). Sudah dibuktikan gagal juga di commit M6; alurnya dicakup E2E M3+. Pengecekan "6 latihan" di E2E M3 dilonggarkan karena M5 menambah jenis latihan.

## M6 — Mode game: Daily Missions, Daily Kata, Infinity Castle, Boss Raid, Time Attack, Bug Rush
- **Daily Missions (Gagak Kasugai)** di Beranda: misi Kata selalu ada + 2 misi acak per hari dari 7 jenis (3 latihan berbeda, 2 Bug Hunt, lantai 5 Castle, 8 benar Time Attack, skor 10 Bug Rush, serang Upper Moon, lulus Lower/Upper Moon). Progres dihitung dari aktivitas HARI INI saja, tiap misi bisa di-tap menuju modenya, badge "tuntas" saat semua selesai.
- **Daily Kata**: 1 soal menulis kode per hari, dipilih dari bab yang sudah terbuka di track yang sudah dimulai. Dibekukan begitu muncul (reload / bab baru terbuka tidak mengganti soal hari itu). Streak Kata tersendiri.
- **Infinity Castle**: 3 nyawa, lantai makin tinggi makin sulit (level kesulitan naik tiap 4 lantai), setiap lantai ke-10 adalah boss berisi soal kode (Write/Fill/Bug Hunt, satu kali serah). Ruangan biasa: pilihan ganda bank, Complexity, Read the Error, atau Predict. Salah = kehilangan nyawa dan ruangan baru; bisa mundur dengan selamat untuk menyimpan lantai. Rekor tercatat.
- **Boss Raid mingguan (Upper Moon)**: 5 soal ber-test case per minggu ISO, HP boss = jumlah semua test case, damage = test terbanyak yang pernah lolos per soal (rekor, bukan akumulasi spam). Boss & soal dibekukan per minggu.
- **Time Attack**: 5 menit, jawab soal pilihan cepat sebanyak mungkin.
- **Bug Rush**: 60 detik, potongan kode Bug Hunt muncul sebagai versi ber-bug ATAU versi yang sudah benar; putuskan "Ada bug" / "Aman". Combo untuk jawaban benar beruntun.
- Hub **Mode Game** di tab Latihan: status Kata hari ini + rekor tiap mode.
- Test: siklus hari/minggu (jam lokal, minggu ISO termasuk W53), misi hanya menghitung hari ini, Kata deterministik per hari, ruangan boss Castle, jawaban pilihan cepat valid, HP/damage Raid, Bug Rush. E2E: satu siklus harian penuh (Kata → Castle 6 lantai + game over → Time Attack & Bug Rush dengan jam palsu → Raid → latihan + Lower Moon → semua misi tuntas → besok misi ter-reset & Kata baru), tanpa overflow di 390 px dan tanpa error JS.

### Improvisasi vs PRD
- Nilai harian/mingguan (Kata, soal Raid) disimpan di tabel Dexie `kv` begitu pertama dibuat, jadi tidak bergeser saat bab baru terbuka di tengah hari.
- Soal semua mode game hanya dari bab yang sudah terbuka: tidak ada lompatan ke materi yang belum dipelajari.
- Buff pernapasan/companion (Giyu +1 nyawa, Zenitsu waktu ×1.2) belum ada: ikut sistem gamifikasi M7.
- Perbaikan tata letak: daftar kartu & panel soal Raid tidak lagi melebar keluar layar HP saat berisi kode panjang.

## M5 — Semua jenis latihan, Step Debugger, visualizer & track DSA
- **8 jenis latihan baru** (total 12, semua ≥ 10 soal; dicek test): Fill the Blank (isian di dalam kode, dinilai dengan test case), Trace Table, Refactor Challenge (lolos tes **dan** aturan kebersihan kode, checklist hidup saat mengetik), Complexity Guess, Syntax Speed Typing (WPM + akurasi ≥ 95%), Translate the Code (Python↔JS, Python→C/C++/Java), Code Review (tandai baris + penjelasan per masalah), Read the Error (pesan error ASLI dari menjalankan kodenya).
- **Step Debugger (Python)**: rekam lalu putar ulang langkah demi langkah, yaitu baris aktif, stack frame + variabel (yang berubah disorot), dan output sejauh ini; berhenti aman setelah 2000 langkah. Tersedia di setiap latihan kode Python (tombol 🐞, stdin = input tes pertama), Playground, dan setelah Trace Table.
- **Visualizer DSA** (`/visual`): 15 animasi piksel, yaitu bubble/selection/insertion/merge/quick sort, linear & binary search, two pointers, sliding window, stack, queue, linked list, min-heap (+ pohon), BFS, DFS. Kontrol putar/langkah/kecepatan/input acak; ditautkan dari bab DSA terkait.
- **Track DSA (Python) 76 soal, 16 bab** (Fondasi–Lanjut): pseudocode & trace, Big-O, array/prefix sum, rekursi (pangkat cepat, subset, Hanoi), searching, sorting, two pointers, linked list, stack/queue, hash map, sliding window, tree/BST, heap, BFS/DFS, greedy, DP.
- Total konten: 457 soal (Python 138, JS/TS 139, DSA 76, C 32, C++ 31, Java 34, SQL 3).

### Improvisasi vs PRD
- **Satu tracer Python untuk dua hal**: kunci Trace Table dihasilkan tracer yang sama dengan Step Debugger (CPython saat build, Pyodide di browser), jadi kunci tidak bisa salah ketik dan selalu cocok dengan yang ditonton di debugger.
- Validasi build per jenis: Refactor harus "benar tapi melanggar aturan" di starter dan "benar + taat aturan" di solusi; Translate dinilai terhadap output kode SUMBER; Read the Error harus benar-benar error (dan error-nya juga dicek di runtime browser); Review baris valid. `verify-runtime.cjs` sekarang 411/411 lolos di browser (soal non-test dinilai di UI).
- Penanda isian `⟦…⟧`, bukan `[[…]]` (sah di Python/JS).
- Step Debugger baru untuk Python. JS/compiled butuh interpreter terinstrumentasi, belum dibuat.

## M4 — Server eksekusi + track C, C++, Java
- **Server eksekusi Fastify** (`server/`): `POST /api/run` (validasi skema: bahasa, ukuran kode ≤ 64 KB, ≤ 30 input), `GET /api/health`, rate limit 60/menit, dan menyajikan `dist/` untuk produksi satu proses.
  - Backend `piston` (produksi, `docker-compose.yml`): Piston di Docker, sandbox isolate tanpa jaringan, batas waktu 2 dtk/tes & memori 256 MB.
  - Backend `local` (pengembangan, `npm run server`): gcc/g++/javac di komputer sendiri, compile sekali lalu jalankan per input, timeout 2 dtk/tes, memori 256 MB (`ulimit -v`, `-Xmx` untuk JVM), output maks 1 MB, folder kerja sementara dihapus.
- Frontend: C/C++/Java lewat `/api` (proxy Vite di dev). Label **"butuh koneksi"** di daftar track; banner "Butuh koneksi" + tombol jalankan nonaktif saat browser offline ATAU server tidak bisa dihubungi; Python/JS/SQL tetap jalan tanpa server. Editor mendukung C/C++/Java; Playground juga.
- Penjelas error untuk pesan gcc/g++/javac/JVM: titik koma, undeclared / std::cout, cannot find symbol, incompatible types, missing return, segfault, ArrayIndexOutOfBounds, NullPointerException, NumberFormatException, InputMismatch.
- Konten: **C 28, C++ 28, Java 28 soal** (bab Fondasi lengkap: 7 bab × 4 soal + pelajaran), divalidasi dengan compiler asli lewat `npm run content`.
- Test: executor (compile+run 3 bahasa, error kompilasi, timeout, segfault, batas memori), pemetaan API Piston (fetch tiruan), validasi API. `verify-runtime.cjs`: 84/84 solusi C/C++/Java lolos lewat API dari browser. Image Docker berhasil di-build dan server di dalamnya merespons.

### Catatan jujur
- Piston sendiri TIDAK diuji hidup di sini: menjalankan container `--privileged` dengan port terbuka ditolak oleh pengaman sesi cloud ini. Adapter-nya diuji terhadap API tiruan sesuai dokumentasi Piston v2; backend `local` diuji penuh. Jalankan `docker compose up -d --build` lalu `docker compose run --rm piston-setup` di komputermu.
- Target v1.0 PRD (≥ 120 soal C/C++/Java) belum tercapai: baru bab Fondasi. Final Selection untuk ketiganya belum ada ("Mulai dari Bab 1" tersedia). Bab Menengah ke atas menyusul.

## M3 — Track Python & JavaScript lengkap, hint, penjelas error
- **Python 123 soal & JavaScript/TypeScript 123 soal**, masing-masing 22 bab Fondasi → Menengah → Lanjut → Profesional (+3 soal SQL dari M2). Tiap bab: 2 kartu pelajaran (3–5 kalimat + contoh yang bisa dijalankan) lalu 4–6 latihan campuran Write/Predict/Bug Hunt/Parsons. Bab Profesional berisi tooling (argparse/logging, CLI args, linter mini), idiom, design pattern, dan project bertahap (to-do CLI 3 tahap, inventaris, analis teks).
- Halaman Bab (`/belajar/<track>/bab/<id>`): pelajaran → latihan → Lower Moon. Node Skill Tree bisa dibuka; tab Latihan hanya menampilkan bab yang terbuka; latihan bab terkunci tidak bisa diakses lewat URL.
- **Lower Moon Exam kini wajib ngoding**: 4 soal = 2 pilihan ganda (kalau ada) + soal kode dari bab itu, satu kali serah per soal, lulus ≥ 75%. Upper Moon: 6 soal dari seluruh level. Bab Lanjut/Profesional tanpa pilihan ganda → semua soal kode.
- Penjelas error bahasa Indonesia untuk ±30 pola error Python & JS (NameError, IndentationError, TypeError str+int, KeyError, ReferenceError, Cannot read properties of undefined, timeout, dll.) + link ke bab terkait. Petunjuk output "hampir benar" (beda huruf besar/kecil, spasi, teks tambahan, output kosong).
- `require("fs")` versi memori di runner JS (bab File I/O), satu tick event loop setelah eksekusi (setTimeout 0 ikut tercetak).
- Perbaikan runner Python: `sys.stdin` baru tiap run dan flush stdout di akhir. Sebelumnya sisa input tes sebelumnya bisa terbaca di tes berikutnya.

### Improvisasi vs PRD
- **Expected output tidak ditulis tangan.** Sumber konten = satu YAML per bab (`content/<track>/<bab>.yaml`) berisi input tes + solusi referensi; `npm run content` menjalankan solusi (Python asli, eksekutor JS yang sama dengan worker di proses terpisah ber-timeout, sql.js) untuk menghasilkan `src/generated/<track>.json`. Build gagal kalau: solusi error/tanpa output, Bug Hunt yang kodenya ternyata tidak bug, starter yang sudah lolos, hint ≠ 3, id ganda, bab tidak ada di kurikulum. Validasi ini menangkap 6 kesalahan saya sendiri selama menulis konten. Test memastikan JSON tidak basi (hash sumber).
- `scripts/verify-runtime.cjs`: menjalankan SEMUA solusi referensi di runtime browser asli (Pyodide/worker) → 249/249 lolos. Ini yang menemukan bug stdin Pyodide di atas.
- Format per bab, bukan satu file per soal (PRD: `<chapter>/<id>.yaml`): lebih mudah ditulis & dibaca bersama pelajarannya.
- Input tes boleh `{ gen: "kode python" }` untuk input besar (uji performa) tanpa menulisnya manual.

## M2 — Editor, runner offline, grader, 4 jenis latihan
- Editor CodeMirror 6 (tema gelap, ukuran font diatur di Profil) + toolbar simbol `Tab ( ) { } [ ] : ; = < > " ' + - * /` untuk layar sentuh.
- Runner offline di Web Worker: **Python** (Pyodide, disajikan lokal dari `public/pyodide`, tanpa CDN), **JavaScript/TypeScript** (sucrase), **SQL** (sql.js). Batas 4 detik per tes; infinite loop → worker dimatikan & dibuat ulang otomatis.
- Grader stdin → stdout (sama dengan format judge TLX TOKI / Codeforces / IOI): tes visible & hidden, abaikan spasi di akhir baris. Hasil per tes: ✓/✗, diff "Diharapkan vs Output kodemu", traceback/error.
- 4 jenis latihan: Write the Code, Predict the Output, Bug Hunt (tap baris bug → perbaiki), Parsons Puzzle (tap untuk menyusun, cocok untuk HP). Hint 3 tingkat. 15 contoh soal (Python, JS, SQL).
- Playground: Python/JS/TS/SQL, stdin, draf tersimpan per bahasa.
- Test konten: setiap soal YAML divalidasi, **solusi referensinya dijalankan** terhadap semua test case (Python asli, eksekutor JS yang sama dengan worker, sql.js). Bug Hunt dicek bahwa kode bug memang gagal. Test ini langsung menemukan satu kunci jawaban yang salah.

### Improvisasi vs PRD
- Semua soal kode memakai format stdin → stdout, bukan "tulis fungsi". Satu format untuk semua bahasa (termasuk compiled di M4) dan langsung cocok untuk soal olimpiade/CP.
- JS membaca input lewat `readline()` / `prompt()` (konvensi judge JS). Prompt di `input("...")` Python tidak ikut dinilai, supaya pemula tidak gagal karena teks prompt.
- Editor & runtime dimuat lazy (route terpisah), first load tidak ikut membengkak.

### Catatan dari user untuk milestone konten
- Bank soal problem solving (M5 DSA, M11 Olimpiade) diambil dari **TLX TOKI (OSN/OSK/OSP), Codeforces, dan IOI** jika tersedia. Tiap soal wajib atribusi (kompetisi, tahun, link). Kalau lisensi tidak mengizinkan menyalin soal, tampilkan ringkasan + link ke soal asli (user submit di judge resmi lalu menandai Accepted), dan buat soal orisinal setara dengan test case sendiri agar bisa di-judge di aplikasi.

## M1 — Onboarding, Path Builder, Final Selection, Skill Tree, Rank, Pace Engine
- **Arah visual baru: pixel art** (permintaan user). Karakter jadi sprite 32×32 (satu rig piksel, 5 karakter × 5 ekspresi + efek pernapasan & Nichirin saat menang), ikon tab/skill tree piksel, bingkai kartu/tombol bersudut takik, dither latar, animasi lompat per 1 piksel sprite. Teks tetap font biasa.
- Onboarding 5 langkah: tujuan, pengalaman, menit/hari, bahasa minat, Path Builder (urutan bisa diubah, tambah/hapus). Bisa diubah lagi di `/jalur`.
- Final Selection adaptif: binary search atas 13 bab Fondasi+Menengah, 2 soal benar per probe, ±6–8 soal. Penempatan maksimal awal level Lanjut.
- Skill Tree linear per track: tiap bab = Lower Moon Exam (lulus ≥ 75%), tiap level ditutup Upper Moon. Hanya node berikutnya yang bisa diuji (dicek di UI dan saat menyimpan), jadi tidak bisa lompat ke level akhir.
- 10 rank Kisatsutai per track (Kinoe hanya jika semua bab lulus), node Hashira Exam terkunci.
- Pace Engine: ETA Kinoe dari laju nyata 14 hari (≥ 2 exam lulus) atau dari target menit/hari; porsi review 20–50% naik saat akurasi turun. Streak dari riwayat ujian.
- Konten = YAML (`content/<track>/placement.yaml`), dimuat lazy. Bank Python & JavaScript: 26 soal masing-masing.
- Test: Vitest untuk engine, gating, rank, pace, streak, dan validasi bank soal.

### Improvisasi vs PRD
- Final Selection pakai binary search, bukan tes linear 10–15 menit: hasil sama tepat (teruji untuk semua 0–13 bab), soal lebih sedikit.
- Ujian Lower/Upper Moon M1 masih pilihan ganda dari bank yang sama. Soal coding asli datang bersama runner (M2) dan konten (M3).
- Track selain Python/JS: Final Selection belum tersedia ("Mulai dari Bab 1" tetap bisa), bank soalnya ditambah bersama konten track tersebut.
- Transfer Skill (PRD 4.7) ditunda sampai ada konten di ≥ 2 bahasa.

## M0 — Fondasi
- Vite + React + TypeScript, React Router (5 tab: Beranda, Belajar, Latihan, Playground, Profil), Dexie (settings: tema, companion, kurangi animasi).
- Design system washi × sumi: token CSS, mode Malam/Siang/ikuti sistem, aksen UI mengikuti warna companion, motif haori kotak di topbar.
- 5 karakter SVG orisinal (Tanjiro, Zenitsu, Inosuke, Shinobu, Rengoku) × 5 ekspresi (idle, senang, fokus, semangat, menang) + efek pernapasan saat menang.
- Override gambar: `public/characters/<id>/<ekspresi>.png`.

### Improvisasi vs PRD
- **Tanpa Tailwind & Framer Motion.** Token CSS + keyframes sudah cukup untuk desain dan animasi singkat. Bundle lebih kecil, satu dependency lebih sedikit. Bisa ditambah nanti kalau benar-benar perlu.
- **Satu rig chibi untuk semua karakter.** Wajah/ekspresi dipakai bersama; tiap karakter hanya mendefinisikan rambut, baju, aksesori. Menambah karakter ke-20+ (M7) cukup menambah data, tidak perlu 5 file SVG per karakter.
- Ikon tab memakai kanji (家 学 戦 試 我), tanpa library ikon.
