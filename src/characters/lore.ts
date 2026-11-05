// Isi yang terbuka lewat Bond. Kutipan & cerita ditulis sendiri (bukan kutipan dari manga/anime);
// "Tips dari Hashira" = best practice nyata, disesuaikan dengan track yang diasuh karakter itu.
export type Lore = { title: string; quote: string; story: string; tips: [string, string] }

export const LORE: Record<string, Lore> = {
  tanjiro: {
    title: 'Pendekar Pernapasan Air',
    quote: 'Kalau tesnya merah, kita baca pesannya pelan-pelan. Setiap error sedang memberi tahu sesuatu.',
    story: 'Tanjiro mengendus bug seperti mencium bau iblis: ia mulai dari baris pertama yang terasa "aneh", lalu menelusuri nilai variabel satu per satu sampai ketemu sumbernya.',
    tips: [
      'Baca traceback dari bawah ke atas: baris terakhir menyebut jenis error, baris di atasnya menunjuk lokasi di kodemu.',
      'Ubah satu hal setiap kali, lalu jalankan lagi. Kalau mengubah tiga hal sekaligus, kamu tidak tahu mana yang memperbaiki.',
    ],
  },
  zenitsu: {
    title: 'Pendekar Petir',
    quote: 'Aku takut... tapi kalau fungsinya kecil dan jelas, aku bisa menebasnya dalam satu kilatan!',
    story: 'Zenitsu hanya menguasai satu jurus, tapi melatihnya ribuan kali. Begitu juga fungsi yang baik: satu tugas, dikerjakan sangat baik.',
    tips: [
      'Pakai const secara default di JavaScript, let hanya kalau nilainya memang berubah. Hindari var.',
      'Selalu pakai === dan !== di JavaScript. == melakukan konversi tipe diam-diam ("0" == 0 bernilai true).',
    ],
  },
  inosuke: {
    title: 'Pendekar Pernapasan Binatang',
    quote: 'Terminal itu hutanku! Pipa, grep, sed... semuanya senjata!',
    story: 'Inosuke tidak pernah membaca peta. Ia membaca jejak. Di terminal, jejak itu adalah man page dan --help.',
    tips: [
      'Di Bash, selalu beri tanda kutip pada variabel ("$file"), supaya nama file yang mengandung spasi tidak pecah.',
      'Awali script Bash dengan set -euo pipefail supaya script berhenti saat ada perintah yang gagal, bukan diam-diam lanjut.',
    ],
  },
  shinobu: {
    title: 'Hashira Serangga',
    quote: 'Racun paling berbahaya adalah input yang kamu percaya begitu saja.',
    story: 'Shinobu tidak sekuat Hashira lain, jadi ia meneliti kelemahan lawannya dengan teliti. Keamanan aplikasi pun begitu: kenali celahnya sebelum penyerang menemukannya.',
    tips: [
      'Jangan pernah menyusun query SQL dengan menggabungkan string input. Pakai parameter (prepared statement).',
      'Simpan password dengan hash lambat yang memakai salt (bcrypt, scrypt, Argon2), bukan MD5 atau SHA-1.',
    ],
  },
  rengoku: {
    title: 'Hashira Api',
    quote: 'Pointer yang menggantung tidak akan mengalahkan semangatku! Bebaskan setiap malloc dengan free!',
    story: 'Rengoku membakar habis kebiasaan buruk dengan disiplin: setiap sumber daya yang ia buka, ia tutup kembali sebelum pergi.',
    tips: [
      'Di C, setiap malloc harus punya free yang jelas pemiliknya. Setelah free, set pointer ke NULL.',
      'Kompilasi dengan -Wall -Wextra dan anggap warning sebagai error. Kebanyakan bug C sudah diperingatkan compiler.',
    ],
  },
  giyu: {
    title: 'Hashira Air',
    quote: 'Kodenya tidak perlu panjang. Cukup tenang, rapi, dan benar.',
    story: 'Giyu jarang bicara, tapi setiap gerakannya presisi. Kode Python yang baik pun sama: sedikit baris, mudah dibaca, tanpa kejutan.',
    tips: [
      'Ikuti PEP 8: snake_case untuk fungsi & variabel, 4 spasi indentasi, nama yang menjelaskan isi.',
      'Pakai with open(...) as f: supaya file selalu tertutup, bahkan saat terjadi exception.',
    ],
  },
  kanao: {
    title: 'Pendekar Pernapasan Bunga',
    quote: 'Aku tidak perlu melempar koin lagi. Aku tahu yang mana yang benar: yang bisa diakses semua orang.',
    story: 'Kanao melihat gerakan terkecil lawannya. Di frontend, detail kecil seperti kontras warna dan label tombol menentukan siapa yang bisa memakai aplikasimu.',
    tips: [
      'Pakai elemen HTML semantik (button, nav, main, label) sebelum meraih div. Pembaca layar mengandalkannya.',
      'Setiap gambar penting butuh alt yang bermakna. Gambar dekoratif cukup diberi alt="".',
    ],
  },
  muichiro: {
    title: 'Hashira Kabut',
    quote: 'Aku sering lupa. Makanya aku menulis semuanya: komentar, catatan, dan test.',
    story: 'Muichiro kehilangan ingatannya, tapi tidak kehilangan kemampuannya. Kode yang dites dengan baik tetap benar walau penulisnya sudah lupa detailnya.',
    tips: [
      'Di C++, pakai RAII dan smart pointer (std::unique_ptr) supaya memori bebas otomatis saat objek keluar scope.',
      'Lewatkan objek besar sebagai const T& supaya tidak tersalin, kecuali fungsinya memang butuh salinan.',
    ],
  },
  mitsuri: {
    title: 'Hashira Cinta',
    quote: 'Aplikasi yang manis itu yang cepat dibuka dan tidak bikin pemakainya bingung!',
    story: 'Pedang Mitsuri lentur seperti pita. Arsitektur aplikasi mobile yang baik juga lentur: UI terpisah dari logika, jadi mudah diubah.',
    tips: [
      'Jangan lakukan kerja berat (jaringan, database) di main thread. Aplikasi akan macet dan bisa ditutup paksa sistem.',
      'Pisahkan state dari tampilan (misalnya ViewModel). Rotasi layar tidak boleh menghapus isian pengguna.',
    ],
  },
  obanai: {
    title: 'Hashira Ular',
    quote: 'Tipe datamu harus jelas. Aku tidak suka kejutan saat runtime.',
    story: 'Obanai dan ularnya bergerak sebagai satu kesatuan. Di Java, kelas dan interface yang dirancang rapi juga saling melengkapi tanpa saling mengikat erat.',
    tips: [
      'Utamakan komposisi daripada pewarisan. Pewarisan yang dalam membuat perubahan kecil merambat ke mana-mana.',
      'Bandingkan isi String di Java dengan .equals(), bukan ==. == membandingkan referensi objek.',
    ],
  },
  sanemi: {
    title: 'Hashira Angin',
    quote: 'Kalau error-nya tidak ditangani, jangan salahkan programnya saat meledak!',
    story: 'Sanemi keras di luar, tapi ia selalu melindungi rekan-rekannya. Penanganan error yang baik juga begitu: tegas, dan melindungi pemakai dari crash.',
    tips: [
      'Di Go, selalu periksa nilai err yang dikembalikan. Jangan pernah membuangnya dengan _ tanpa alasan.',
      'Bungkus error dengan konteks: fmt.Errorf("baca config: %w", err), supaya jejak masalahnya terbaca.',
    ],
  },
  gyomei: {
    title: 'Hashira Batu',
    quote: 'Compiler yang ketat itu bentuk kasih sayang. Ia menolak kodemu sekarang supaya penggunamu tidak terluka nanti.',
    story: 'Gyomei tidak bisa melihat, tapi tidak ada yang lolos dari perasaannya. Borrow checker Rust juga begitu: ia merasakan setiap referensi yang berbahaya.',
    tips: [
      'Di Rust, utamakan meminjam (&T) daripada memindahkan atau meng-clone. Clone untuk "menenangkan" compiler sering menyembunyikan desain yang kurang tepat.',
      'Pakai Result dan operator ? untuk error. Simpan unwrap() untuk contoh dan test, jangan di kode produksi.',
    ],
  },
  tengen: {
    title: 'Hashira Suara',
    quote: 'Kode yang mencolok itu kode yang rapi! Nama yang jelas adalah kemewahan sejati!',
    story: 'Tengen menghitung ritme pertarungan seperti partitur. Kode C# yang baik juga punya ritme: konsisten, terbaca, dan mudah ditebak.',
    tips: [
      'Pakai using (atau await using) untuk objek IDisposable supaya koneksi dan file tertutup tepat waktu.',
      'Untuk operasi I/O, pakai async/await sampai ke atas. Hindari .Result dan .Wait() karena bisa membuat deadlock.',
    ],
  },
  genya: {
    title: 'Pemburu Iblis',
    quote: 'Aku tidak berbakat. Jadi aku latihan lebih banyak dari siapa pun.',
    story: 'Genya tidak bisa memakai pernapasan, jadi ia mencari caranya sendiri. Kalau satu pendekatan buntu, coba pecah masalahnya jadi bagian yang lebih kecil.',
    tips: [
      'Kalau soal terasa terlalu besar, tulis dulu versi paling sederhana yang benar, baru optimalkan.',
      'Tulis contoh input-output kecil dengan tangan sebelum ngoding. Kebanyakan bug logika ketahuan di kertas.',
    ],
  },
  nezuko: {
    title: 'Adik yang Melindungi',
    quote: 'Mmm! Mmm-mm!',
    story: 'Nezuko tidak bisa bicara, tapi selalu ada di saat genting. Ia tumbuh dan menyusut sesuai kebutuhan, seperti struktur data yang dipilih sesuai masalahnya.',
    tips: [
      'Pilih struktur data dari operasi yang paling sering: cari cepat → set/dict, urutan & indeks → list, ambil terkecil → heap.',
      'Istirahat itu bagian dari belajar. Bug yang buntu satu jam sering terpecahkan setelah jalan kaki lima menit.',
    ],
  },
  urokodaki: {
    title: 'Mantan Hashira Air, Guru',
    quote: 'Penilaianmu terlalu lambat. Latih dasarnya sampai tubuhmu bergerak sendiri.',
    story: 'Urokodaki melatih murid-muridnya membelah batu sebelum boleh ikut Final Selection. Dasar yang kuat membuat konsep lanjutan terasa wajar.',
    tips: [
      'Sebelum menulis kode, jelaskan langkah solusinya dalam bahasa biasa (pseudocode). Kalau belum bisa dijelaskan, belum siap dikodekan.',
      'Latihan sedikit tapi setiap hari lebih efektif daripada maraton seminggu sekali. Itu inti spaced repetition.',
    ],
  },
  sabito: {
    title: 'Murid Urokodaki',
    quote: 'Jangan berhenti saat tesnya hijau. Tanya dulu: apakah kodemu juga benar untuk kasus yang tidak dites?',
    story: 'Sabito menunggu di bawah pohon, menantang Tanjiro sampai pedangnya benar-benar tajam. Edge case juga begitu: diam menunggu sampai kamu lengah.',
    tips: [
      'Selalu uji kasus tepi: input kosong, satu elemen, nilai negatif, angka sangat besar, dan duplikat.',
      'Off-by-one paling sering muncul di batas loop. Periksa indeks pertama dan terakhir secara eksplisit.',
    ],
  },
  makomo: {
    title: 'Murid Urokodaki',
    quote: 'Gerakanmu masih kaku. Coba lebih ringan: hapus yang tidak perlu.',
    story: 'Makomo mengajari Tanjiro bergerak efisien tanpa tenaga terbuang. Refactor adalah latihan yang sama: hasil sama, gerakan lebih sedikit.',
    tips: [
      'Refactor hanya saat test sudah hijau, dan dalam langkah kecil. Setiap langkah jalankan test lagi.',
      'Kalau kode yang sama muncul tiga kali, saatnya jadikan fungsi. Dua kali boleh ditunggu dulu.',
    ],
  },
  murata: {
    title: 'Pemburu Iblis Biasa',
    quote: 'Aku bukan Hashira, tapi aku tetap datang setiap hari. Itu juga kekuatan, kan?',
    story: 'Murata selamat dari misi demi misi bukan karena bakat, tapi karena tidak pernah absen. Konsistensi mengalahkan intensitas.',
    tips: [
      'Commit kecil dan sering, dengan pesan yang menjelaskan "kenapa", bukan hanya "apa".',
      'Simpan catatan error yang pernah kamu temui dan cara memperbaikinya. Kamu akan bertemu error yang sama lagi.',
    ],
  },
  aoi: {
    title: 'Penjaga Butterfly Mansion',
    quote: 'Kesalahan kemarin itu bahan latihan hari ini. Ayo ulangi sampai lancar!',
    story: 'Aoi merawat para pemburu yang terluka sampai mereka pulih. Mengulang soal yang dulu salah adalah rehabilitasi yang sama untuk pemahamanmu.',
    tips: [
      'Ulangi soal yang salah setelah 1 hari, 3 hari, lalu 1 minggu. Jarak yang makin panjang membuat ingatan bertahan.',
      'Saat review, tulis ulang solusinya dari nol tanpa melihat jawaban lama.',
    ],
  },
  kanae: {
    title: 'Mantan Hashira Bunga',
    quote: 'Bahkan kode yang paling berantakan pun bisa dirawat sampai mekar.',
    story: 'Kanae percaya setiap orang bisa berubah. Kode warisan pun begitu: tambahkan test dulu, lalu perbaiki sedikit demi sedikit.',
    tips: [
      'Sebelum mengubah kode lama tanpa test, tulis dulu "characterization test" yang merekam perilakunya sekarang.',
      'Saat code review, kritik kodenya, bukan orangnya. Beri alasan dan contoh perbaikan.',
    ],
  },
  tamayo: {
    title: 'Tabib & Peneliti',
    quote: 'Data yang rapi adalah obat. Normalisasi dulu, baru ramu query-nya.',
    story: 'Tamayo meneliti darah iblis selama ratusan tahun dengan catatan yang sangat teratur. Database yang baik juga dimulai dari skema yang dipikirkan matang.',
    tips: [
      'Beri index pada kolom yang sering dipakai di WHERE dan JOIN, tapi jangan semua kolom: index memperlambat INSERT.',
      'Bungkus beberapa perubahan yang saling terkait dalam satu transaksi supaya semua berhasil atau semua batal.',
    ],
  },
  yushiro: {
    title: 'Asisten Tamayo',
    quote: 'Jangan pilih SELECT *. Ambil hanya kolom yang kamu butuhkan. Hmph.',
    story: 'Yushiro bisa menyembunyikan seluruh rumah dengan jimat kertasnya. Query yang efisien juga "menyembunyikan" kerja berat: hanya mengambil yang perlu.',
    tips: [
      'Sebutkan kolom secara eksplisit di SELECT. SELECT * rapuh saat skema berubah dan memboroskan data.',
      'Pakai EXPLAIN untuk melihat bagaimana database menjalankan query sebelum menebak-nebak penyebab lambat.',
    ],
  },
}
