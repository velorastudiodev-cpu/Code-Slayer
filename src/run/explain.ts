// Penjelas error: pesan compiler/runtime umum → bahasa Indonesia sederhana + bab terkait.
export type Explanation = { title: string; text: string; chapter?: string }

type Rule = [RegExp, (m: RegExpMatchArray) => Explanation]

const RULES: Rule[] = [
  [/Waktu habis/, () => ({ title: 'Program tidak berhenti', text: 'Kemungkinan ada loop yang kondisinya tidak pernah salah (infinite loop), atau algoritmanya terlalu lambat untuk input besar. Pastikan variabel loop berubah menuju kondisi berhenti.', chapter: 'f6' })],
  // C / C++ / Java (pesan gcc, g++, javac, dan JVM)
  [/error: expected ('[;,]'|',' or ';') before/, () => ({ title: 'Lupa titik koma', text: 'Di C, C++, dan Java setiap pernyataan diakhiri ";". Lihat baris yang ditunjuk DAN baris sebelumnya.', chapter: 'f1' })],
  [/error: '(\w+)' (undeclared|was not declared in this scope)(; did you mean '([\w:]+)')?/, m => ({ title: `"${m[1]}" belum dideklarasikan`, text: m[4] ? `Mungkin maksudnya ${m[4]}. Di C++, cout/cin/string ada di namespace std, jadi tulis std::cout atau pakai "using namespace std;".` : `Variabel atau fungsi "${m[1]}" dipakai sebelum dideklarasikan (int ${m[1]} = ...;), atau ada salah ketik.`, chapter: 'f2' })],
  [/error: cannot find symbol/, () => ({ title: 'Nama tidak dikenal (Java)', text: 'Java tidak menemukan variabel, method, atau class dengan nama itu. Periksa ejaan, huruf besar/kecil, deklarasi, dan import.', chapter: 'f2' })],
  [/error: incompatible types: (\w+) cannot be converted to (\w+)/, m => ({ title: `${m[1]} bukan ${m[2]}`, text: `Nilai bertipe ${m[1]} diisikan ke variabel bertipe ${m[2]}. Ubah tipenya, atau konversi nilainya (misalnya Integer.parseInt untuk String ke int).`, chapter: 'f2' })],
  [/error: missing return statement|control reaches end of non-void function/, () => ({ title: 'Lupa return', text: 'Fungsi yang punya tipe hasil harus mengembalikan nilai di SEMUA jalur, termasuk setelah if/else.', chapter: 'f7' })],
  [/Segmentation fault/, () => ({ title: 'Segmentation fault', text: 'Program mengakses memori yang bukan miliknya, biasanya indeks array di luar batas, pointer NULL, atau scanf tanpa &. Periksa batas loop dan ukuran array.', chapter: 'm1' })],
  [/Floating point exception/, () => ({ title: 'Pembagian dengan nol', text: 'Ada pembagian atau modulo bilangan bulat dengan 0. Periksa pembaginya sebelum membagi.', chapter: 'f3' })],
  [/java\.lang\.ArrayIndexOutOfBoundsException: Index (-?\d+) out of bounds for length (\d+)/, m => ({ title: 'Indeks di luar batas', text: `Indeks ${m[1]} dipakai pada array dengan panjang ${m[2]}. Indeks yang valid adalah 0 sampai ${Number(m[2]) - 1}.`, chapter: 'm1' })],
  [/java\.lang\.NullPointerException/, () => ({ title: 'Mengakses null', text: 'Ada objek bernilai null yang dipanggil method-nya atau diakses isinya. Pastikan objek dibuat (new ...) atau diisi sebelum dipakai.', chapter: 'm6' })],
  [/java\.lang\.NumberFormatException: For input string: "(.*)"/, m => ({ title: 'Teks tidak bisa jadi angka', text: `"${m[1]}" bukan bilangan yang valid untuk Integer.parseInt. Kalau satu baris berisi beberapa angka, pecah dulu dengan split(" ").`, chapter: 'f4' })],
  [/java\.util\.(NoSuchElementException|InputMismatchException)/, m => ({ title: m[1] === 'InputMismatchException' ? 'Tipe input tidak cocok' : 'Input habis', text: 'Scanner membaca token yang tidak ada atau bukan tipe yang diminta (misalnya nextInt pada teks). Baca sesuai format input soal.', chapter: 'f4' })],
  // Go
  [/declared and not used: (\w+)|(\w+) declared (and|but) not used/, m => ({ title: `"${m[1] ?? m[2]}" dibuat tapi tidak dipakai`, text: 'Go menolak variabel yang dideklarasikan tapi tidak pernah dipakai. Pakai variabelnya, hapus, atau ganti namanya dengan _.', chapter: 'f2' })],
  [/"([\w/]+)" imported and not used/, m => ({ title: `Import "${m[1]}" tidak dipakai`, text: 'Go menolak import yang tidak dipakai. Hapus baris import itu, atau gunakan paketnya.', chapter: 'f1' })],
  [/panic: runtime error: index out of range \[(-?\d+)\] with length (\d+)/, m => ({ title: 'Indeks di luar batas', text: `Indeks ${m[1]} dipakai pada slice dengan panjang ${m[2]}. Indeks yang valid 0 sampai ${Number(m[2]) - 1}; periksa kondisi loop (< bukan <=).`, chapter: 'm1' })],
  [/strconv\.Atoi: parsing "(.*)": invalid syntax/, m => ({ title: 'Teks tidak bisa jadi angka', text: `"${m[1]}" bukan bilangan bulat. Kalau ada "\\n" atau spasi di ujungnya, bersihkan dulu dengan strings.TrimSpace.`, chapter: 'f4' })],
  [/goroutine \d+ \[running\]:[\s\S]*stack overflow|runtime: goroutine stack exceeds/, () => ({ title: 'Rekursi tanpa ujung', text: 'Fungsi memanggil dirinya terus-menerus sampai memori stack habis. Pastikan ada base case yang pasti tercapai.', chapter: 'f7' })],
  // Rust
  [/error\[E0384\]: cannot assign twice to immutable variable `(\w+)`/, m => ({ title: `"${m[1]}" tidak bisa diubah`, text: `Variabel di Rust bawaannya immutable. Tulis let mut ${m[1]} kalau nilainya memang akan berubah.`, chapter: 'f2' })],
  [/error\[E0382\]: (borrow|use) of moved value: `(\w+)`/, m => ({ title: `"${m[2]}" sudah dipindahkan (move)`, text: 'Kepemilikan nilai sudah pindah ke variabel/fungsi lain, jadi nama lama tidak boleh dipakai. Pinjam dengan &, atau salin dengan .clone() kalau memang butuh dua salinan.', chapter: 'm1' })],
  [/error\[E0308\]: mismatched types/, () => ({ title: 'Tipe tidak cocok', text: 'Rust tidak mengubah tipe otomatis. Konversi angka dengan as (x as f64) dan teks ke angka dengan .parse().', chapter: 'f2' })],
  [/index out of bounds: the len is (\d+) but the index is (\d+)/, m => ({ title: 'Indeks di luar batas', text: `Indeks ${m[2]} dipakai pada Vec dengan panjang ${m[1]}. Range 0..=len terlalu jauh satu; pakai 0..len.`, chapter: 'm1' })],
  [/called `Result::unwrap\(\)` on an `Err` value: ParseIntError|ParseIntError \{ kind: InvalidDigit \}/, () => ({ title: 'Teks tidak bisa jadi angka', text: 'parse() gagal. Biasanya karena masih ada newline dari read_line: panggil .trim() sebelum .parse().', chapter: 'f4' })],
  [/thread 'main' has overflowed its stack/, () => ({ title: 'Rekursi tanpa ujung', text: 'Rekursi tidak pernah berhenti sampai stack habis. Pastikan ada base case yang pasti tercapai.', chapter: 'f7' })],
  // C# (Mono)
  [/error CS1010: Newline in constant/, () => ({ title: 'Tanda kutip tidak ditutup', text: 'Ada string yang dibuka dengan " tapi tidak ditutup di baris yang sama.', chapter: 'f1' })],
  [/error CS0103: The name `(\w+)' does not exist/, m => ({ title: `"${m[1]}" tidak dikenal`, text: `Variabel atau method "${m[1]}" belum dideklarasikan di scope ini, atau ada salah ketik (huruf besar/kecil berpengaruh).`, chapter: 'f2' })],
  [/error CS0266: Cannot implicitly convert type `(\w+)' to `(\w+)'|error CS0029: Cannot implicitly convert/, () => ({ title: 'Tipe tidak cocok', text: 'C# tidak mengubah tipe yang bisa kehilangan data secara otomatis. Pakai cast eksplisit, misalnya (int)x, atau int.Parse untuk teks.', chapter: 'f2' })],
  [/System\.IndexOutOfRangeException|System\.ArgumentOutOfRangeException/, () => ({ title: 'Indeks di luar batas', text: 'Indeks yang dipakai lebih besar dari elemen yang ada. Indeks terakhir = Length - 1 (atau Count - 1); periksa kondisi loop.', chapter: 'm1' })],
  [/System\.FormatException/, () => ({ title: 'Teks tidak bisa jadi angka', text: 'int.Parse/double.Parse menerima teks yang bukan angka. Periksa pemecahan input (Split) dan bersihkan dengan Trim().', chapter: 'f4' })],
  [/System\.StackOverflowException|Stack overflow/, () => ({ title: 'Rekursi tanpa ujung', text: 'Method memanggil dirinya tanpa henti. Pastikan base case-nya pasti tercapai.', chapter: 'f7' })],
  // Kotlin
  [/error: unresolved reference: (\w+)/, m => ({ title: `"${m[1]}" tidak dikenal`, text: `Kotlin tidak menemukan "${m[1]}". Periksa ejaan, deklarasi (val/var), dan import.`, chapter: 'f2' })],
  [/error: val cannot be reassigned/, () => ({ title: 'val tidak bisa diubah', text: 'Nilai yang dibuat dengan val tidak bisa diisi ulang. Ganti menjadi var kalau memang akan berubah.', chapter: 'f2' })],
  [/error: type mismatch: inferred type is (\w+) but (\w+) was expected/, m => ({ title: `${m[1]} bukan ${m[2]}`, text: `Kotlin tidak mengubah tipe otomatis. Pakai konversi seperti toInt(), toLong(), toDouble(), atau toString().`, chapter: 'f2' })],
  [/java\.lang\.NumberFormatException: For input string: "([\s\S]*?)"/, m => ({ title: 'Teks tidak bisa jadi angka', text: `"${m[1].replace(/\n/g, '\\n')}" bukan angka. Bersihkan spasi/newline dengan trim() sebelum toInt().`, chapter: 'f4' })],
  [/kotlin\.KotlinNullPointerException|NullPointerException/, () => ({ title: 'Nilai null dipaksa dengan !!', text: 'readLine()!! atau x!! bertemu null (misalnya input sudah habis). Pakai ?: untuk nilai cadangan atau periksa null dulu.', chapter: 'f4' })],
  [/java\.lang\.StackOverflowError/, () => ({ title: 'Rekursi tanpa ujung', text: 'Fungsi memanggil dirinya tanpa henti sampai stack habis. Pastikan ada base case.', chapter: 'f7' })],
  // Python
  [/IndentationError: (expected an indented block|unexpected indent|unindent does not match)/, () => ({ title: 'Indentasi berantakan', text: 'Python memakai indentasi (spasi di awal baris) untuk menandai blok. Setelah baris yang berakhir ":" isi bloknya harus menjorok, dan baris dalam satu blok harus sejajar. Pakai 4 spasi secara konsisten.', chapter: 'f5' })],
  [/SyntaxError: expected ':'/, () => ({ title: 'Lupa titik dua', text: 'Baris if, elif, else, for, while, def, dan class harus diakhiri tanda titik dua ":".', chapter: 'f5' })],
  [/SyntaxError: unterminated string literal/, () => ({ title: 'Tanda kutip tidak ditutup', text: 'Ada teks yang dibuka dengan " atau \' tapi tidak ditutup di baris yang sama.', chapter: 'f2' })],
  [/SyntaxError: '\(' was never closed|SyntaxError: unexpected EOF/, () => ({ title: 'Kurung tidak ditutup', text: 'Ada kurung "(" yang belum ditutup. Hitung pasangan kurung di baris yang ditunjuk dan baris sebelumnya.' })],
  [/SyntaxError: invalid syntax\. Maybe you meant '==' or ':=' instead of '='\?|cannot assign to/, () => ({ title: '= bukan ==', text: '"=" untuk mengisi nilai, "==" untuk membandingkan. Di dalam kondisi if/while, pakai "==".', chapter: 'f3' })],
  [/SyntaxError/, () => ({ title: 'Kesalahan penulisan (syntax)', text: 'Python tidak bisa membaca kodenya. Periksa baris yang ditunjuk tanda ^: kurung, tanda kutip, titik dua, atau kata kunci yang salah ketik.' })],
  [/NameError: name '(\w+)' is not defined/, m => ({ title: `"${m[1]}" belum dikenal`, text: `Variabel atau fungsi "${m[1]}" dipakai sebelum dibuat, atau ada salah ketik (huruf besar/kecil berpengaruh). Kalau maksudnya teks, apit dengan tanda kutip.`, chapter: 'f2' })],
  [/UnboundLocalError/, () => ({ title: 'Variabel lokal dipakai sebelum diisi', text: 'Di dalam fungsi, variabel yang diubah dianggap lokal. Isi dulu nilainya di dalam fungsi, atau kirim lewat parameter dan kembalikan dengan return.', chapter: 'f7' })],
  [/TypeError: can only concatenate str \(not "(\w+)"\) to str|TypeError: unsupported operand type\(s\) for \+: 'int' and 'str'/, () => ({ title: 'Menggabung teks dengan angka', text: 'Teks (str) tidak bisa dijumlah dengan angka. Ubah angka jadi teks dengan str(x), pakai f-string f"...{x}...", atau ubah teks jadi angka dengan int(...).', chapter: 'f2' })],
  [/TypeError: '(\w+)' object is not subscriptable/, m => ({ title: `${m[1]} tidak bisa diakses dengan [ ]`, text: `Nilai bertipe ${m[1]} tidak punya indeks. Periksa apakah variabelnya benar-benar list/string/dict.`, chapter: 'm1' })],
  [/TypeError: '(\w+)' object is not callable/, m => ({ title: `${m[1]} bukan fungsi`, text: `Ada nilai bertipe ${m[1]} yang dipanggil dengan ( ). Mungkin nama variabel menimpa nama fungsi, misalnya list = [...] lalu list(...).`, chapter: 'f7' })],
  [/TypeError: \w+\(\) (missing|takes) /, () => ({ title: 'Jumlah argumen tidak cocok', text: 'Fungsi dipanggil dengan jumlah argumen yang berbeda dari parameter di def-nya. Untuk method di class, ingat parameter pertama adalah self.', chapter: 'f7' })],
  [/ValueError: invalid literal for int\(\) with base 10: '(.*)'/, m => ({ title: 'Teks tidak bisa jadi angka', text: `int() menerima "${m[1]}" yang bukan bilangan bulat. Kalau satu baris berisi beberapa angka, pecah dulu dengan .split().`, chapter: 'f4' })],
  [/ValueError: (not enough|too many) values to unpack/, () => ({ title: 'Jumlah nilai tidak pas', text: 'Banyaknya variabel di kiri "=" harus sama dengan banyaknya nilai di kanan, misalnya a, b = input().split() butuh tepat 2 kata.', chapter: 'f4' })],
  [/IndexError: (list|string|tuple) index out of range/, m => ({ title: 'Indeks di luar batas', text: `Indeks ${m[1]} dimulai dari 0 sampai panjang - 1. Periksa batas loop (range) dan apakah ${m[1]}-nya kosong.`, chapter: 'm1' })],
  [/KeyError: (.*)/, m => ({ title: `Kunci ${m[1]} tidak ada`, text: 'Dict tidak punya kunci itu. Cek dulu dengan "if k in d", atau pakai d.get(k, default).', chapter: 'm1' })],
  [/ZeroDivisionError/, () => ({ title: 'Pembagian dengan nol', text: 'Ada pembagian (/, //, %) dengan nilai 0. Tangani kasus 0 secara khusus sebelum membagi.', chapter: 'f3' })],
  [/AttributeError: '(\w+)' object has no attribute '(\w+)'/, m => ({ title: `${m[1]} tidak punya .${m[2]}`, text: `Method atau atribut "${m[2]}" tidak ada pada tipe ${m[1]}. Periksa ejaannya dan tipe variabelnya.` })],
  [/RecursionError/, () => ({ title: 'Rekursi tidak berhenti', text: 'Fungsi memanggil dirinya terus tanpa mencapai base case. Pastikan ada kondisi berhenti dan argumennya mengecil di tiap panggilan.', chapter: 'f7' })],
  [/EOFError/, () => ({ title: 'Input habis', text: 'input() dipanggil lebih banyak dari jumlah baris input yang tersedia. Baca hanya sebanyak yang dijelaskan di soal.', chapter: 'f4' })],
  [/ModuleNotFoundError: No module named '(\w+)'/, m => ({ title: `Modul ${m[1]} tidak tersedia`, text: 'Hanya pustaka standar Python yang tersedia di sini. Periksa ejaan nama modul.', chapter: 'm5' })],
  // JavaScript
  [/ReferenceError: (\w+) is not defined/, m => ({ title: `"${m[1]}" belum dikenal`, text: `Variabel atau fungsi "${m[1]}" belum dideklarasikan (let/const/function), atau salah ketik. Huruf besar/kecil berpengaruh.`, chapter: 'f2' })],
  [/ReferenceError: Cannot access '(\w+)' before initialization/, m => ({ title: `"${m[1]}" dipakai sebelum dibuat`, text: 'Variabel let/const baru bisa dipakai setelah baris deklarasinya.', chapter: 'f2' })],
  [/TypeError: Assignment to constant variable/, () => ({ title: 'const tidak bisa diubah', text: 'Variabel const tidak bisa diisi ulang. Pakai let kalau nilainya berubah.', chapter: 'f2' })],
  [/TypeError: Cannot read propert(y|ies) of (undefined|null)/, m => ({ title: `Mengakses isi dari ${m[2]}`, text: `Ada nilai ${m[2]} yang diakses seperti objek/array (x.a atau x[i]). Biasanya indeks di luar batas, readline() sudah habis, atau fungsi lupa return.`, chapter: 'm1' })],
  [/TypeError: ([\w.]+) is not a function/, m => ({ title: `${m[1]} bukan fungsi`, text: `"${m[1]}" dipanggil dengan ( ) padahal bukan fungsi. Periksa ejaan method dan tipe nilainya (misalnya .map hanya ada di array).` })],
  [/RangeError: Maximum call stack size exceeded/, () => ({ title: 'Rekursi tidak berhenti', text: 'Fungsi memanggil dirinya terus tanpa base case. Pastikan ada kondisi berhenti.', chapter: 'f7' })],
  [/SyntaxError: (Unexpected token|Unexpected end of input|missing \) after|Invalid or unexpected token)/, () => ({ title: 'Kesalahan penulisan (syntax)', text: 'JavaScript tidak bisa membaca kodenya. Periksa pasangan kurung ( ) { } [ ], tanda kutip, dan koma.' })],
]

export function explainError(stderr: string): Explanation | null {
  for (const [re, f] of RULES) { const m = stderr.match(re); if (m) return f(m) }
  return null
}

// Output salah tapi program jalan: beri petunjuk dari bentuk perbedaannya.
export function explainMismatch(expected: string, actual: string): string | null {
  const e = expected.trim(), a = actual.trim()
  if (!a) return 'Programmu tidak mencetak apa pun. Lupa print / console.log?'
  if (e.toLowerCase() === a.toLowerCase()) return 'Hampir benar: beda huruf besar/kecil.'
  if (e.replace(/\s+/g, '') === a.replace(/\s+/g, '')) return 'Hampir benar: beda spasi atau baris baru.'
  if (a.endsWith(e)) return 'Ada teks tambahan sebelum jawaban. Hapus teks yang tidak diminta soal.'
  if (a.startsWith(e)) return 'Jawabannya benar, tapi ada output tambahan sesudahnya.'
  return null
}
