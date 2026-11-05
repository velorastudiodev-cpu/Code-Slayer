// Test diferensial: setiap skrip dijalankan di bash GNU asli dan di interpreter simulasi; stdout & exit code harus sama.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { Shell } from './shell.ts'
import { VFS } from './vfs.ts'

type Case = [name: string, script: string, opts?: { stdin?: string; files?: Record<string, string> }]

function real(script: string, stdin = '', files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'slayer-'))
  try {
    for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c) }
    try {
      const out = execFileSync('bash', ['-c', script], { cwd: dir, input: stdin, env: { PATH: process.env.PATH, LC_ALL: 'C', HOME: dir }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
      return { stdout: out.toString(), code: 0 }
    } catch (e) {
      const x = e as { stdout: Buffer; status: number }
      return { stdout: x.stdout?.toString() ?? '', code: x.status }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
async function sim(script: string, stdin = '', files: Record<string, string> = {}) {
  const sh = new Shell({ fs: new VFS().load(files) })
  const r = await sh.run(script, stdin)
  return { stdout: r.stdout, code: r.code }
}

const LOG = 'ip=10.0.0.5 GET /login 200\nip=10.0.0.9 POST /login 401\nip=10.0.0.5 GET /admin 403\nip=10.0.0.7 POST /login 401\nip=10.0.0.9 POST /login 401\n'
const CSV = 'nama,kota,nilai\ntanjiro,kyoto,90\nzenitsu,tokyo,72\ninosuke,osaka,65\nnezuko,kyoto,88\n'

const CASES: Case[] = [
  // echo, quoting, variabel
  ['echo dasar', 'echo halo   dunia; echo "halo   dunia"; echo -n tanpa; echo; echo -e "a\\tb\\nc"'],
  ['kutip tunggal & ganda', `x=Slayer; echo '$x' "$x" "\\$x" "a'b" 'a"b'`],
  ['ANSI-C', `echo $'baris1\\nbaris2'`],
  ['variabel kosong & default', 'echo "[${a:-kosong}]" "[${a-unset}]"; a=; echo "[${a:-d}]" "[${a-d}]" "[${a:+ada}]"; b=1; echo "${b:+ada}"'],
  ['assign default', 'echo ${x:=5}; echo $x'],
  ['panjang & substring', 's=KimetsuNoYaiba; echo ${#s} ${s:0:7} ${s:7} ${s: -5} ${s:2:3}'],
  ['hapus pola', 'f=arsip.tar.gz; echo ${f%.gz} ${f%%.*} ${f#*.} ${f##*.}; p=/home/slayer/x.txt; echo ${p##*/} ${p%/*}'],
  ['ganti pola', 's=aaa-bbb-aaa; echo ${s/aaa/X} ${s//aaa/X} ${s/#aaa/Y} ${s/%aaa/Z}'],
  ['huruf besar kecil', 's=tanjiro; echo ${s^^} ${s^}; t=ZENITSU; echo ${t,,} ${t,}'],
  ['word splitting', 'x="a  b   c"; for w in $x; do echo "[$w]"; done; for w in "$x"; do echo "[$w]"; done'],
  ['IFS koma', 'IFS=,; line="a,b,,c"; for f in $line; do echo "[$f]"; done'],
  ['read IFS', 'IFS=: read -r u x uid rest <<< "root:x:0:0:root:/root:/bin/bash"; echo "$u $uid $rest"'],
  ['read beberapa var', 'read a b c <<< "satu dua tiga empat"; echo "$a|$b|$c"'],
  ['read loop stdin', 'while read -r baris; do echo "> $baris"; done', { stdin: 'satu\ndua\ntiga\n' }],
  ['read tanpa newline akhir', 'while read -r l || [ -n "$l" ]; do echo "[$l]"; done', { stdin: 'a\nb' }],
  ['read dua kali', 'read nama; read umur; echo "$nama berumur $umur"', { stdin: 'Tanjiro\n15\n' }],
  ['brace', 'echo {1..5} {a..e} {05..10} {1..10..3} file{A,B}.txt {x,y}{1,2}'],
  ['tilde & path', 'cd /tmp; echo $PWD; cd -  >/dev/null; mkdir -p d/e; cd d/e; pwd | sed "s#.*/d/e#.../d/e#"'],
  // aritmetika
  ['aritmetika', 'a=7; b=3; echo $((a+b)) $((a-b)) $((a*b)) $((a/b)) $((a%b)) $((a**b)) $(( (a+b)*2 ))'],
  ['inkremen', 'i=5; ((i++)); ((i+=10)); echo $i; echo $((i--)) $i $((--i))'],
  ['perbandingan aritmetika', 'x=10; if (( x > 5 && x < 20 )); then echo ya; fi; (( x == 3 )) || echo bukan'],
  ['ternary & bit', 'x=6; echo $(( x > 5 ? 1 : 0 )) $(( x & 3 )) $(( x | 1 )) $(( x << 2 )) $(( 0x1f )) $(( 010 ))'],
  ['let & declare -i', 'let "a = 4 * 5"; echo $a; declare -i n=3; n+=4; echo $n'],
  // kondisi
  ['test angka', 'for n in 3 10 15; do if [ $n -lt 5 ]; then echo kecil; elif [ $n -le 10 ]; then echo sedang; else echo besar; fi; done'],
  ['test string', '[ "abc" = "abc" ] && echo sama; [ -z "" ] && echo kosong; [ -n "x" ] && echo isi; [ "a" != "b" ] && echo beda'],
  ['test file', 'touch f; mkdir d; [ -f f ] && echo file; [ -d d ] && echo dir; [ -e nope ] || echo tidak-ada; [ -s f ] || echo kosong'],
  ['[[ pola & regex ]]', 'f=laporan.txt; [[ $f == *.txt ]] && echo teks; [[ $f =~ ^lap(.*)\\.txt$ ]] && echo "${BASH_REMATCH[1]}"; [[ -n $f && $f != *.pdf ]] && echo bukan-pdf'],
  ['[[ < > ]]', '[[ apel < jeruk ]] && echo urut; [[ 2 -gt 10 ]] || echo angka'],
  ['case', 'for x in apel 42 Y n zzz; do case $x in [0-9]*) echo angka;; apel|jeruk) echo buah;; [Yy]) echo ya;; n|N) echo tidak;; *) echo lain;; esac; done'],
  ['&& ||', 'true && echo a || echo b; false && echo c || echo d; false || false || echo e'],
  ['! dan $?', 'false; echo $?; true; echo $?; ! false; echo $?; ls nope 2>/dev/null; echo $?'],
  // loop
  ['for c-style', 'for ((i=1; i<=5; i++)); do printf "%d " $i; done; echo'],
  ['while counter', 'i=0; while [ $i -lt 3 ]; do echo "putaran $i"; i=$((i+1)); done'],
  ['until', 'n=1; until [ $n -gt 16 ]; do echo $n; n=$((n*2)); done'],
  ['break continue', 'for i in {1..10}; do [ $i -eq 3 ] && continue; [ $i -eq 6 ] && break; echo $i; done'],
  ['nested break 2', 'for a in 1 2 3; do for b in x y; do [ $a = 2 ] && break 2; echo $a$b; done; done'],
  ['for seq', 'for i in $(seq 1 4); do echo "baris $i"; done'],
  // fungsi
  ['fungsi & return', 'sapa() { echo "Halo, $1! ($#)"; return 3; }; sapa Tanjiro x; echo "kode $?"'],
  ['local', 'x=global; f() { local x=lokal; echo $x; }; f; echo $x'],
  ['rekursi faktorial', 'fak() { if [ $1 -le 1 ]; then echo 1; else echo $(( $1 * $(fak $(( $1 - 1 ))) )); fi; }; fak 6'],
  ['$@ vs $*', 'f() { for a in "$@"; do echo "[$a]"; done; for a in "$*"; do echo "<$a>"; done; }; f "satu dua" tiga'],
  ['shift', 'f() { echo $1; shift; echo $1 $#; shift 2; echo $#; }; f a b c d'],
  ['set --', 'set -- x y z; echo $# $2; set -- "${@:2}"; echo "$@"'],
  // array
  ['array', 'a=(merah kuning hijau); echo ${a[0]} ${a[2]} ${#a[@]}; a+=(biru); echo "${a[@]}"; a[1]=emas; echo ${a[*]}; echo ${!a[@]}'],
  ['assoc array', 'declare -A umur; umur[tanjiro]=15; umur[rengoku]=20; echo ${umur[tanjiro]} ${#umur[@]}'],
  ['mapfile', 'mapfile -t baris < f.txt; echo ${#baris[@]} ${baris[1]}', { files: { 'f.txt': 'a\nb\nc\n' } }],
  // substitusi & pipe & redirect
  ['command substitution', 'n=$(echo halo | wc -c); echo "$n"; d=`echo lama`; echo $d; echo "$(echo "  spasi  ")"'],
  ['redirect', 'echo satu > f; echo dua >> f; cat f; wc -l < f; cat nope 2> err; wc -l < err | tr -d " "'],
  ['2>&1 dan &>', 'ls nope > out 2>&1; grep -c "No such" out; ls nope &> out2; grep -c cannot out2'],
  ['heredoc', 'nama=Tanjiro\ncat <<EOF\nHalo $nama\n$((1+2))\nEOF\ncat <<\'EOF\'\nmentah $nama\nEOF'],
  ['heredoc indent', 'cat <<-AKHIR\n\tterindentasi\n\tAKHIR'],
  ['pipeline subshell', 'n=0; echo x | while read l; do n=1; done; echo $n'],
  ['pipefail', 'false | true; echo $?; set -o pipefail; false | true; echo $?'],
  ['subshell', 'x=1; (x=2; echo $x); echo $x; (cd /tmp; true); echo ok'],
  ['group redirect', '{ echo a; echo b; } > f; cat f; { echo c; } >> f; wc -l < f'],
  ['set -e', 'set -e; echo mulai; false || true; echo masih; false; echo tidak-tercetak'],
  ['set -u', 'set -u; echo "${x:-aman}"; echo $belum; echo tidak'],
  ['exit code', 'f() { exit 4; }; (f); echo $?; exit 7'],
  ['eval', 'cmd="echo dari eval"; eval $cmd; v=nama; nama=Zenitsu; eval echo \\$$v'],
  ['printf', 'printf "%s-%d-%5s|%-5s|%05d|%.2f|%x|%o|%%\\n" a 42 kn kr 7 3.14159 255 8; printf "%s\\n" satu dua tiga; printf "%3d:%s\\n" 1 a 2 b'],
  ['printf -v & %b', 'printf -v x "%03d" 7; echo $x; printf "%b\\n" "a\\tb"'],
  ['getopts', 'f() { local OPTIND o; while getopts "vn:" o; do case $o in v) echo verbose;; n) echo "nama=$OPTARG";; ?) echo salah;; esac; done; shift $((OPTIND-1)); echo "sisa: $*"; }; f -v -n Tanjiro a b'],
  ['skrip & argumen', 'printf "#!/bin/bash\\necho \\"arg: \\$1 \\$#\\"\\n" > s.sh; chmod +x s.sh; ./s.sh satu dua; bash s.sh tiga'],
  ['source', 'echo "WARNA=merah" > conf; source conf; echo $WARNA; . ./conf; echo ok'],
  ['glob', 'touch a.txt b.txt c.log .h.txt; echo *.txt; echo *.log; echo ?.txt; echo [ab].txt; echo *.none; ls -a | grep -c txt'],
  ['glob subdir', 'mkdir -p x/y; touch x/1.md x/y/2.md; echo x/*.md; echo x/*/*.md'],
  // coreutils
  ['cat -n tac rev', 'printf "a\\nb\\nc\\n" > f; cat -n f; tac f; rev f'],
  ['head tail', 'seq 1 20 > n; head -n 3 n; tail -n 2 n; head -3 n | tail -1; tail -n +18 n; head -n -17 n'],
  ['wc', 'printf "satu dua\\ntiga\\n" > f; wc -l f; wc -w < f; wc f; cat f | wc; wc -c f; wc -l f f'],
  ['grep', 'grep 401 log; grep -c 401 log; grep -v POST log; grep -n admin log; grep -i "get /LOGIN" log; grep -o "10\\.0\\.0\\.[0-9]*" log | sort -u', { files: { log: LOG } }],
  ['grep -E -w -x', 'printf "cat\\ncatalog\\nconcat\\ndog\\n" > f; grep -w cat f; grep -E "^(cat|dog)$" f; grep -x dog f; grep -c "^c" f; grep -e cat -e dog f | wc -l'],
  ['grep BRE', 'printf "aa\\na+b\\nab\\n(x)\\n" > f; grep "a+b" f; grep "a\\+" f; grep "(x)" f; grep -E "a+" f | wc -l'],
  ['grep -r -l', 'mkdir -p src/a; echo "TODO: x" > src/a/1.txt; echo "beres" > src/2.txt; grep -r TODO src; grep -rl beres .; grep -q TODO src/a/1.txt && echo ada'],
  ['sort', 'printf "10\\n9\\n100\\n9\\n" > n; sort n; sort -n n; sort -nr n; sort -u n; sort -n -u n'],
  ['sort -k -t', 'tail -n +2 csv | sort -t, -k3 -n; tail -n +2 csv | sort -t, -k2,2 -k3,3nr', { files: { csv: CSV } }],
  ['sort kolom spasi', 'printf "b 2\\na 10\\nc 1\\n" | sort -k2 -n; printf "B\\na\\nC\\nb\\n" | sort; printf "B\\na\\nC\\nb\\n" | sort -f'],
  ['uniq', 'printf "a\\na\\nb\\na\\nc\\nc\\n" > f; uniq f; uniq -c f; uniq -d f; uniq -u f; sort f | uniq -c | sort -nr | head -1'],
  ['cut', 'cut -d, -f1 csv; cut -d, -f1,3 csv | head -2; cut -c1-3 csv | tail -1; echo "a:b:c:d" | cut -d: -f2-', { files: { csv: CSV } }],
  ['tr', 'echo "Hello World" | tr a-z A-Z; echo "hello" | tr -d l; echo "aaabbbccc" | tr -s abc; echo "a b  c" | tr " " "\\n"; echo "S3cr3t!" | tr -cd "[:alpha:]"; echo; echo hello | tr "[:lower:]" "[:upper:]"'],
  ['sed', 'printf "satu\\ndua\\ntiga\\nempat\\n" > f; sed "s/a/A/" f; sed "s/a/A/g" f; sed -n 2p f; sed "2d" f; sed -n "/ga/p" f; sed "1,2d" f; sed "s/\\(.\\)\\(.*\\)/\\2\\1/" f; sed -E "s/(t)(i)/\\2\\1/" f; sed "$d" f; sed "/dua/,/tiga/d" f'],
  ['sed -i & y & =', 'printf "abc\\ndef\\n" > f; sed -i "s/b/B/" f; cat f; sed "y/abc/xyz/" f; sed -n "$=" f; sed "1i\\\\awal" f; sed "\\$a akhir" f'],
  ['awk', `awk -F, 'NR>1 {print $1, $3}' csv; awk -F, 'NR>1 {s+=$3} END {print s, s/(NR-1)}' csv; awk -F, '$3 > 80 {print toupper($1)}' csv; awk -F, 'NR>1 {n[$2]++} END {for (k in n) print k, n[k]}' csv | sort`, { files: { csv: CSV } }],
  ['awk lanjut', `awk '{print NF, $NF}' log | head -2; awk '/401/ {c++} END {print c}' log; awk '{split($1,a,"="); print a[2]}' log | sort | uniq -c | sort -rn | head -1; awk 'BEGIN {printf "%5.1f|%-4s|\\n", 3.14159, "ab"; x = "10"; if (x > 9) print "num"; print length("kimetsu"), substr("kimetsu", 2, 3), index("abc", "c")}'`, { files: { log: LOG } }],
  ['awk gsub & OFS', `echo "a-b-c" | awk -F- -v OFS=: '{$1=$1; print}'; echo "aaa" | awk '{gsub(/a/, "b"); print}'; echo "x y z" | awk '{print $2 $3; print $2, $3}'; printf "3\\n1\\n2\\n" | awk '{s+=$1} END {print "total:", s}'`],
  ['find', 'mkdir -p p/q; touch p/a.txt p/q/b.txt p/c.log; find p -name "*.txt" | sort; find p -type d | sort; find p -maxdepth 1 -type f | sort; find . -name "*.log"'],
  ['xargs & tee', 'printf "a\\nb\\nc\\n" | xargs echo; printf "a b c d\\n" | xargs -n 2 echo; echo isi | tee f1 f2 > /dev/null; cat f1 f2; echo x | xargs -I {} echo "[{}]"'],
  ['seq basename dirname', 'seq 3; seq 2 5; seq 10 -3 1; seq -s, 4; seq -w 8 10; basename /a/b/c.txt; basename /a/b/c.txt .txt; dirname /a/b/c.txt; dirname c.txt'],
  ['expr', 'expr 3 + 4; expr 10 / 3; expr length kimetsu; x=$(expr 5 \\* 6); echo $x'],
  ['cp mv rm mkdir', 'mkdir -p a/b; echo x > a/f; cp a/f a/g; mv a/g a/b/; ls a; ls a/b; cp -r a c; ls c/b; rm -r a; ls; rm nope 2>/dev/null || echo gagal; rmdir c/b 2>/dev/null || echo tidak-kosong'],
  ['chmod & stat', 'touch f; chmod 600 f; stat -c "%a" f; chmod u+x,g+r f; stat -c %a f; chmod 755 f; stat -c "%A %a" f; chmod -x f; stat -c %a f; chmod a=r f; stat -c %a f'],
  ['base64 & hash', 'echo -n "SLAYER" | base64; echo U0xBWUVS | base64 -d; echo; echo -n abc | sha256sum; echo -n abc | md5sum; printf "teks" > f; sha256sum f'],
  ['nl & paste', 'printf "a\\n\\nb\\n" > f; nl f; printf "1\\n2\\n" > x; printf "a\\nb\\n" > y; paste x y; paste -d, x y; paste -s -d+ x'],
  ['date format aman', 'date +%Y | grep -cE "^[0-9]{4}$"'],
  ['tidak ditemukan', 'perintahngawur; echo $?'],
  // batch 2: pola yang sering dipakai di soal
  ['loop file', 'touch b.txt a.txt c.md; for f in *.txt; do echo "berkas: $f ${f%.txt}"; done; for f in *.pdf; do echo "[$f]"; done'],
  ['while read file', 'while IFS=, read -r nama kota nilai; do [ "$nama" = nama ] && continue; echo "$nama ($kota): $nilai"; done < csv', { files: { csv: CSV } }],
  ['hitung baris & max', 'max=0; while read -r n; do (( n > max )) && max=$n; done; echo $max', { stdin: '4\n17\n9\n' }],
  ['jumlah input', 'read n; s=0; for ((i=0;i<n;i++)); do read x; s=$((s+x)); done; echo $s', { stdin: '3\n5\n10\n-2\n' }],
  ['string ulang', 'n=4; s=""; for ((i=0;i<n;i++)); do s+="*"; done; echo "$s"; printf "%0.s-" {1..5}; echo'],
  ['palindrom', 'w=katak; r=$(echo "$w" | rev); [ "$w" = "$r" ] && echo palindrom || echo bukan'],
  ['reverse loop', 's=slayer; out=""; for ((i=${#s}-1;i>=0;i--)); do out+="${s:i:1}"; done; echo $out'],
  ['fungsi return nilai', 'kuadrat() { echo $(( $1 * $1 )); }; hasil=$(kuadrat 9); echo "hasil=$hasil"; ganjil() { (( $1 % 2 )); }; ganjil 3 && echo ganjil; ganjil 4 || echo genap'],
  ['case fallthrough', 'x=a; case $x in a) echo A;& b) echo B;; c) echo C;; esac'],
  ['nested quote cmdsubst', 'echo "Hari: $(echo "satu $(echo dua)")"; x="$(printf "%s" "a b")"; echo "[$x]"'],
  ['arith var tanpa $', 'a=3; b=4; c=$(( a*a + b*b )); echo $c; (( c == 25 )) && echo pythagoras'],
  ['test kombinasi', 'a=5; [ $a -gt 1 -a $a -lt 10 ] && echo dalam; [ $a -lt 1 -o $a -eq 5 ] && echo salah-satu; [ ! -e nope ] && echo tidak-ada'],
  ['default & error var', 'f() { echo "${1:?butuh argumen}"; }; f ada; (f) 2>/dev/null; echo "kode $?"'],
  ['array loop & indeks', 'h=(Tanjiro Zenitsu Inosuke); for i in "${!h[@]}"; do echo "$i: ${h[$i]}"; done; echo "${h[@]:1}"; echo ${#h[1]}'],
  ['assoc loop', 'declare -A n=([a]=1 [b]=2); for k in a b; do echo "$k=${n[$k]}"; done'],
  ['split string ke array', 'IFS=: read -ra p <<< "/usr/bin:/bin:/sbin"; echo ${#p[@]} ${p[2]}; s="a b c"; arr=($s); echo ${arr[1]}'],
  ['tr hitung huruf', 'echo "kimetsu no yaiba" | tr -d " " | fold -w1 2>/dev/null | wc -l; echo "kimetsu no yaiba" | tr -cd a | wc -c'],
  ['grep pipeline log', 'grep " 401$" log | cut -d" " -f1 | cut -d= -f2 | sort | uniq -c | sort -rn', { files: { log: LOG } }],
  ['awk laporan', `awk -F, 'NR==1 {next} {total+=$3; if ($3>max) {max=$3; who=$1}} END {printf "rata-rata %.1f, terbaik %s (%d)\\n", total/(NR-1), who, max}' csv`, { files: { csv: CSV } }],
  ['sed edit config', 'printf "port=80\nhost=lokal\n#debug=1\n" > c; sed -i "s/^port=.*/port=8080/" c; sed -n "/^#/!p" c; grep -c = c'],
  ['backup nama tanggal', 'mkdir -p data backup; echo 1 > data/a; echo 2 > data/b; for f in data/*; do cp "$f" "backup/$(basename "$f").bak"; done; ls backup'],
  ['exit status pipeline grep', 'echo halo | grep -q x; echo $?; echo halo | grep -q h; echo $?'],
  ['wc tanpa nama file', 'printf "a\nb\n" > f; wc -l < f; cat f | wc -l; wc -l f | cut -d" " -f1'],
  ['printf tabel', 'printf "%-8s|%5s\n" Nama Nilai; while IFS=, read -r n k v; do printf "%-8s|%5d\n" "$n" "$v"; done < <(tail -n +2 csv) 2>/dev/null || true', { files: { csv: CSV } }],
  ['until & break input', 'while true; do read -r x || break; [ "$x" = stop ] && break; echo "dapat $x"; done; echo selesai', { stdin: 'a\nb\nstop\nc\n' }],
  ['subshell exit tidak menutup', '(exit 3); echo "lanjut $?"'],
  ['source fungsi', 'printf "sapa() { echo hai \\$1; }\n" > lib.sh; source lib.sh; sapa slayer'],
  ['set -x tidak ke stdout', 'set -x; echo terlihat; set +x'],
  ['kata reserved sebagai argumen', 'echo if then done fi; echo {'],
  ['syntax error', 'if true; then echo x'],
]

describe('interpreter Bash vs bash asli', () => {
  for (const [name, script, o] of CASES) {
    it(name, async () => {
      const r = real(script, o?.stdin, o?.files)
      const s = await sim(script, o?.stdin, o?.files)
      expect(s.stdout, `stdout\n--- skrip ---\n${script}`).toBe(r.stdout)
      expect(s.code, 'exit code').toBe(r.code)
    })
  }
})

describe('sandbox', () => {
  it('infinite loop dihentikan', async () => {
    const r = await new Shell({ maxSteps: 5000 }).run('while true; do :; done; echo tidak')
    expect(r.code).toBe(124)
    expect(r.stderr).toMatch(/langkah/)
  })
  it('permission 000: pemilik pun tidak bisa membaca (bukan root)', async () => {
    // Tidak bisa dibandingkan dengan bash asli: test berjalan sebagai root di container.
    expect((await new Shell().run('echo rahasia > s; chmod 000 s; cat s 2>/dev/null || echo ditolak; chmod 644 s; cat s')).stdout).toBe('ditolak\nrahasia\n')
  })
  it('permission: user biasa tidak bisa membaca /root', async () => {
    const r = await new Shell().run('ls /root; cat /etc/passwd | head -1; touch /etc/x')
    expect(r.stdout).toBe('root:x:0:0::/root:/bin/bash\n')
    expect(r.stderr).toMatch(/Permission denied/)
  })
  it('setuid binary berjalan sebagai pemilik', async () => {
    const fs = new VFS().load({ '/usr/local/bin/cekuid': { bin: 'cekuid', owner: 'root', mode: '4755' } })
    const sh = new Shell({ fs, binaries: { cekuid: c => { c.out(c.sh.user + '\n'); return 0 } } })
    expect((await sh.run('/usr/local/bin/cekuid; find / -perm -4000 -type f 2>/dev/null')).stdout).toBe('root\n/usr/local/bin/cekuid\n')
  })
})
