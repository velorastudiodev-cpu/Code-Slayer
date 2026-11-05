// Mesin lab Cyber & CTF Arena. Semua target adalah aplikasi SIMULASI buatan sendiri yang berjalan di perangkat user
// (fungsi TypeScript, sql.js, shell simulasi). Tidak ada request ke jaringan asli. Dipakai sama persis di build (validasi) & browser.
import type { SqlJsStatic } from 'sql.js'
import { Shell } from '../term/shell.ts'
import { VFS, type FileSpec } from '../term/vfs.ts'
import { b64decode, b64encode, md5, sha256 } from '../term/hash.ts'

// ---------------- flag ----------------
const KEY = 'kisatsutai'
const xor = (s: string) => Array.from(s, (c, i) => String.fromCharCode(c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length))).join('')
export const encFlag = (f: string) => b64encode(xor(f))
export const decFlag = (e: string) => xor(b64decode(e))
export const flagHash = (f: string) => sha256(f.trim())
// Flag di dalam konfigurasi lab (mis. isi berkas) disimpan sebagai token, diisi saat lab dibuka.
export const FLAG_TOKEN = '@@FLAG@@'
export function hydrate<T>(config: T, flag: string): T {
  return JSON.parse(JSON.stringify(config).split(FLAG_TOKEN).join(flag.replace(/["\\]/g, '\\$&'))) as T
}
export const checkFlag = (input: string, hash: string) => /^SLAYER\{[^{}]+\}$/.test(input.trim()) && flagHash(input) === hash

// ---------------- lab web: server simulasi ----------------
export type Req = { method: string; path: string; query: Record<string, string>; body: string; cookies: Record<string, string>; headers: Record<string, string> }
export type Res = { status: number; headers: Record<string, string>; body: string }
export type WebCtx = { flag: string; SQL?: SqlJsStatic }

export function parseUrl(url: string) {
  const [p, q = ''] = url.replace(/^https?:\/\/[^/]+/, '').split('?')
  return { path: p || '/', query: Object.fromEntries(new URLSearchParams(q)) }
}
export const form = (body: string) => Object.fromEntries(new URLSearchParams(body))
export function makeReq(r: { method?: string; url: string; body?: string; cookie?: string; headers?: Record<string, string> }): Req {
  const { path, query } = parseUrl(r.url)
  const cookies = Object.fromEntries((r.cookie ?? '').split(';').map(c => c.trim()).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)] }))
  return { method: (r.method ?? 'GET').toUpperCase(), path, query, body: r.body ?? '', cookies, headers: Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])) }
}
const ok = (body: string, headers: Record<string, string> = {}): Res => ({ status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers }, body })
const json = (o: unknown, status = 200): Res => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o, null, 2) })
const err = (status: number, body: string): Res => ({ status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body })

function db(ctx: WebCtx, setup: string) {
  if (!ctx.SQL) throw new Error('sql.js belum dimuat')
  const d = new ctx.SQL.Database()
  d.run(setup)
  return d
}

type App = (req: Req, ctx: WebCtx) => Res | Promise<Res>
export const WEB_APPS: Record<string, App> = {
  // SQL injection pada login: query disusun dengan sambung string.
  'sqli-login': (req, ctx) => {
    if (req.path !== '/login') return ok('Form login Markas: POST /login dengan body user=...&pass=...')
    if (req.method !== 'POST') return err(405, 'Gunakan POST')
    const f = form(req.body)
    const sql = `SELECT nama, peran FROM akun WHERE user = '${f.user ?? ''}' AND pass = '${f.pass ?? ''}'`
    const d = db(ctx, `CREATE TABLE akun(user TEXT, pass TEXT, nama TEXT, peran TEXT);
      INSERT INTO akun VALUES ('oyakata','${sha256(ctx.flag).slice(0, 24)}','Kagaya Ubuyashiki','oyakata'),('tanjiro','air123','Kamado Tanjiro','slayer');`)
    try {
      const r = d.exec(sql)[0]
      if (!r) return { ...err(401, 'Login gagal.'), headers: { 'x-debug-sql': sql } }
      const [nama, peran] = r.values[0] as string[]
      return ok(`Selamat datang, ${nama}!` + (peran === 'oyakata' ? `\nArsip rahasia Oyakata: ${ctx.flag}` : '\n(Hanya Oyakata yang bisa membuka arsip rahasia.)'), { 'x-debug-sql': sql })
    } catch (e) { return { ...err(500, `SQL error: ${(e as Error).message}`), headers: { 'x-debug-sql': sql } } }
    finally { d.close() }
  },
  // SQL injection UNION pada pencarian.
  'sqli-union': (req, ctx) => {
    if (req.path !== '/cari') return ok('Pencarian slayer: GET /cari?q=nama')
    const sql = `SELECT nama, napas FROM slayer WHERE nama LIKE '%${req.query.q ?? ''}%'`
    const d = db(ctx, `CREATE TABLE slayer(nama TEXT, napas TEXT); CREATE TABLE gulungan_terlarang(isi TEXT);
      INSERT INTO slayer VALUES ('Tanjiro','Air'),('Zenitsu','Petir'),('Inosuke','Binatang'); INSERT INTO gulungan_terlarang VALUES ('${ctx.flag}');`)
    try {
      const r = d.exec(sql)[0]
      return ok((r?.values ?? []).map(v => v.join(' | ')).join('\n') || '(tidak ada hasil)', { 'x-debug-sql': sql })
    } catch (e) { return { ...err(500, `SQL error: ${(e as Error).message}`), headers: { 'x-debug-sql': sql } } }
    finally { d.close() }
  },
  // IDOR: API surat tidak memeriksa pemilik.
  'idor-surat': (req, ctx) => {
    if (req.cookies.sesi !== 'tanjiro-7f3a') return json({ error: 'Belum login. Cookie: sesi=tanjiro-7f3a' }, 401)
    const m = /^\/api\/surat\/(\d+)$/.exec(req.path)
    if (!m) return json({ petunjuk: 'GET /api/surat/<id>. Suratmu: 1043, 1044' })
    const surat: Record<string, unknown> = {
      1041: { dari: 'Oyakata', untuk: 'Para Hashira', isi: `Kode rapat Pilar: ${ctx.flag}` },
      1042: { dari: 'Shinobu', untuk: 'Kanao', isi: 'Latihan jam 5 pagi.' },
      1043: { dari: 'Urokodaki', untuk: 'Tanjiro', isi: 'Jaga Nezuko.' },
      1044: { dari: 'Gagak', untuk: 'Tanjiro', isi: 'Misi ke Asakusa.' },
    }
    return surat[m[1]] ? json({ id: +m[1], ...(surat[m[1]] as object) }) : json({ error: 'Tidak ada' }, 404)
  },
  // Cookie peran disimpan di klien (base64 JSON) tanpa tanda tangan.
  'cookie-peran': (req, ctx) => {
    const raw = req.cookies.profil ?? b64encode('{"user":"zenitsu","peran":"slayer"}')
    let p: { user?: string; peran?: string } = {}
    try { p = JSON.parse(b64decode(raw)) } catch { return err(400, 'Cookie profil rusak (harus base64 dari JSON).') }
    if (req.path !== '/ruang-pilar') return ok(`Halo ${p.user}. Cookie kamu: profil=${raw}\nRuang Pilar: GET /ruang-pilar`, { 'set-cookie': `profil=${raw}` })
    return p.peran === 'hashira' ? ok(`Selamat datang, Hashira ${p.user}. ${ctx.flag}`) : err(403, `Peran "${p.peran}" tidak boleh masuk Ruang Pilar.`)
  },
  // JWT dengan alg "none" diterima.
  'jwt-none': (req, ctx) => {
    const tok = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const demo = `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u('{"sub":"inosuke","admin":false}')}.c2lnbmF0dXJlLXJhaGFzaWE`
    if (!tok) return ok(`Token kamu: ${demo}\nKirim: GET /admin dengan header Authorization: Bearer <token>`)
    const [h, p, s] = tok.split('.')
    try {
      const head = JSON.parse(b64ud(h)), body = JSON.parse(b64ud(p))
      const valid = head.alg === 'none' || s === 'c2lnbmF0dXJlLXJhaGFzaWE' // BUG: alg none tidak ditolak
      if (!valid) return err(401, 'Tanda tangan tidak valid.')
      if (req.path !== '/admin') return ok(`Halo ${body.sub}`)
      return body.admin === true ? ok(`Panel admin. ${ctx.flag}`) : err(403, 'Bukan admin.')
    } catch { return err(400, 'Token rusak.') }
  },
  // SSRF: filter URL naif berbasis string.
  'ssrf-pratinjau': (req, ctx) => {
    if (req.path !== '/pratinjau') return ok('Layanan pratinjau tautan: GET /pratinjau?url=http://...')
    const url = req.query.url ?? ''
    if (/intranet|localhost/i.test(url)) return err(403, 'Diblokir: alamat internal tidak diizinkan.')
    const hosts: Record<string, Record<string, string>> = {
      'berita.desa': { '/': 'Berita desa: server intranet korps pindah ke 10.0.0.7 (jangan disebar!).' },
      'intranet.kisatsutai': { '/rahasia': `Dokumen internal: ${ctx.flag}` },
      '10.0.0.7': { '/rahasia': `Dokumen internal: ${ctx.flag}`, '/': 'Intranet Kisatsutai. Lihat /rahasia' },
    }
    const m = /^https?:\/\/([^/:]+)(?::\d+)?(\/[^?#]*)?/.exec(url)
    if (!m) return err(400, 'URL tidak valid.')
    const page = hosts[m[1]]?.[m[2] || '/']
    return page ? ok(`Pratinjau ${url}:\n${page}`) : err(502, `Gagal mengambil ${url}`)
  },
  // Path traversal pada unduhan.
  'path-unduh': (req, ctx) => {
    if (req.path !== '/unduh') return ok('Unduh dokumen: GET /unduh?file=laporan.txt')
    const files: Record<string, string> = { '/srv/dokumen/laporan.txt': 'Laporan misi bulan ini: aman.', '/srv/dokumen/jadwal.txt': 'Patroli malam: Senin & Kamis.', '/srv/rahasia/kunci.txt': ctx.flag, '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nslayer:x:1000:1000::/home/slayer:/bin/bash' }
    const parts = ('/srv/dokumen/' + (req.query.file ?? '')).split('/')
    const out: string[] = []
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p) }
    const f = files['/' + out.join('/')]
    return f ? ok(f) : err(404, 'File tidak ditemukan.')
  },
  // Mass assignment: semua field body disalin ke akun baru.
  'mass-assign': (req, ctx) => {
    if (req.path !== '/api/daftar' || req.method !== 'POST') return ok('Pendaftaran: POST /api/daftar dengan body JSON {"user": "...", "pass": "..."}')
    let b: Record<string, unknown>
    try { b = JSON.parse(req.body) } catch { return json({ error: 'Body harus JSON' }, 400) }
    const akun = { peran: 'kakushi', ...b } // BUG: field peran dari user ikut tersalin
    return json(akun.peran === 'hashira' ? { ok: true, akun, hadiah: ctx.flag } : { ok: true, akun })
  },
  // Recon: robots.txt membocorkan direktori cadangan.
  'robots-cadangan': (req, ctx) => {
    const pages: Record<string, string> = { '/': 'Situs resmi Kisatsutai. Tidak ada yang menarik di sini... atau ada?', '/robots.txt': 'User-agent: *\nDisallow: /cadangan-lama/', '/cadangan-lama/': 'Index of /cadangan-lama/\n  db-2019.sql.bak', '/cadangan-lama/db-2019.sql.bak': `-- dump lama\nINSERT INTO rahasia VALUES ('${ctx.flag}');` }
    return pages[req.path] ? ok(pages[req.path]) : err(404, 'Tidak ditemukan.')
  },
  // Command injection: host disambung ke perintah shell (shell simulasi berisi file flag).
  'cmd-ping': async (req, ctx) => {
    if (req.path !== '/ping') return ok('Alat jaringan: GET /ping?host=8.8.8.8')
    const sh = new Shell({ fs: new VFS().load({ '/srv/flag.txt': ctx.flag + '\n', '/srv/app.py': 'os.system("ping -c 1 " + host)  # :(\n' }), cwd: '/srv' })
    const r = await sh.run(`ping -c 1 ${req.query.host ?? ''}`)
    return ok(r.stdout + r.stderr)
  },
}
const b64u = (s: string) => b64encode(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const b64ud = (s: string) => b64decode(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))

export async function webRequest(app: string, r: Parameters<typeof makeReq>[0], ctx: WebCtx): Promise<Res> {
  const f = WEB_APPS[app]
  if (!f) return err(500, `app ${app} tidak ada`)
  return f(makeReq(r), ctx)
}

// ---------------- lab HTML (XSS/CSRF): halaman korban + harness pendeteksi ----------------
// Halaman dirender di iframe sandbox="allow-scripts" (tanpa same-origin): tidak bisa membaca aplikasi induk.
// Harness melaporkan bukti eksploit ke induk lewat postMessage.
export const HARNESS = `<script>
(function(){
  var lapor = function(t, d){ try { parent.postMessage({ lab: 'slayer', type: t, data: d }, '*') } catch (e) {} };
  window.alert = function(x){ lapor('xss', String(x)) };
  window.print = function(){ lapor('xss', 'print') };
  var kirim = function(f){ var d = {}; for (var i = 0; i < f.elements.length; i++) { var e = f.elements[i]; if (e.name) d[e.name] = e.value } lapor('form', { action: f.getAttribute('action') || '', method: (f.getAttribute('method') || 'get').toLowerCase(), fields: d }) };
  HTMLFormElement.prototype.submit = function(){ kirim(this) };
  document.addEventListener('submit', function(e){ e.preventDefault(); kirim(e.target) }, true);
})();
</script>`
export const HTML_APPS: Record<string, { render: (payload: string) => string; input: string; check: (msgs: { type: string; data: unknown }[]) => boolean; note: string }> = {
  'xss-cari': {
    input: 'Kata kunci pencarian', note: 'Halaman hasil pencarian menampilkan kata kuncimu apa adanya.',
    render: p => `<!doctype html><meta charset="utf-8"><h3>Arsip Kisatsutai</h3><p>Hasil pencarian untuk: <b>${p}</b></p><p>0 dokumen ditemukan.</p>`,
    check: m => m.some(x => x.type === 'xss'),
  },
  'xss-bukutamu': {
    input: 'Komentar buku tamu', note: 'Komentar disimpan lalu ditampilkan ke semua pengunjung. Filter menghapus tag <script> (sekali saja, tanpa membedakan huruf besar/kecil).',
    render: p => `<!doctype html><meta charset="utf-8"><h3>Buku Tamu Rumah Kupu-kupu</h3><ul><li>Kanao: Terima kasih!</li><li>Anon: ${p.replace(/<\/?script>/i, '')}</li></ul>`,
    check: m => m.some(x => x.type === 'xss'),
  },
  'xss-dom': {
    input: 'Nama (masuk ke fragmen URL #nama=...)', note: 'Skrip halaman membaca nama dari fragmen URL lalu memasangnya dengan innerHTML.',
    render: p => `<!doctype html><meta charset="utf-8"><h3>Kartu Sambutan</h3><div id="sapa"></div><script>var nama = decodeURIComponent(${JSON.stringify(encodeURIComponent(p))}); document.getElementById('sapa').innerHTML = 'Selamat datang, ' + nama;</script>`,
    check: m => m.some(x => x.type === 'xss'),
  },
  'csrf-transfer': {
    input: 'Halaman HTML jebakan milikmu', note: 'Bank Desa memproses POST https://bank.desa/transfer (field: ke, jumlah) dari browser yang sedang login tanpa token CSRF. Bot korban (sedang login) membuka halamanmu dan TIDAK mengklik apa pun.',
    render: p => `<!doctype html><meta charset="utf-8">${p}`,
    check: m => m.some(x => x.type === 'form' && /bank\.desa\/transfer/.test(String((x.data as { action: string }).action)) && (x.data as { method: string }).method === 'post' && (x.data as { fields: Record<string, string> }).fields.ke === 'akatsuki' && +(x.data as { fields: Record<string, string> }).fields.jumlah > 0),
  },
}
export const htmlDoc = (app: string, payload: string) => HTML_APPS[app].render(payload).replace(/^(<!doctype html>)/i, `$1${HARNESS}`)

// ---------------- lab terminal ----------------
export function labShell(files: Record<string, FileSpec>, procs?: { pid: number; user: string; cmd: string }[]) {
  return new Shell({ fs: new VFS().load(files), interactive: true, procs: procs as never })
}

// ---------------- crypto ----------------
export const CRYPTO_OPS: Record<string, { name: string; param?: string; run: (s: string, p: string) => string }> = {
  b64d: { name: 'Base64 decode', run: s => b64decode(s) },
  b64e: { name: 'Base64 encode', run: s => b64encode(s) },
  hexd: { name: 'Hex decode', run: s => s.replace(/\s+/g, '').match(/../g)?.map(h => String.fromCharCode(parseInt(h, 16))).join('') ?? '' },
  hexe: { name: 'Hex encode', run: s => Array.from(s, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('') },
  rot13: { name: 'ROT13', run: s => caesar(s, 13) },
  caesar: { name: 'Caesar (geser −k)', param: 'k', run: (s, p) => caesar(s, -(+p || 0)) },
  vigenere: { name: 'Vigenère decrypt', param: 'kunci', run: (s, p) => vigenere(s, p, -1) },
  xor: { name: 'XOR satu byte (hex input)', param: 'kunci (0-255)', run: (s, p) => (s.replace(/\s+/g, '').match(/../g) ?? []).map(h => String.fromCharCode(parseInt(h, 16) ^ (+p & 255))).join('') },
  reverse: { name: 'Balik string', run: s => [...s].reverse().join('') },
  md5: { name: 'MD5', run: s => md5(s) },
  sha256: { name: 'SHA-256', run: s => sha256(s) },
}
export function caesar(s: string, k: number) {
  return s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26 + 26) % 26 + b) })
}
export function vigenere(s: string, key: string, dir: 1 | -1) {
  if (!key) return s
  let j = 0
  return s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; const k = (key[j++ % key.length].toLowerCase().charCodeAt(0) - 97) * dir; return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26 + 26) % 26 + b) })
}
export const applyOps = (s: string, ops: { op: string; p?: string }[]) => ops.reduce((acc, o) => CRYPTO_OPS[o.op].run(acc, o.p ?? ''), s)

// ---------------- crackme (kode milik kita, input user hanya string) ----------------
export function crackmeCheck(code: string, key: string): boolean {
  try { return new Function('kunci', `${code}\nreturn periksa(kunci)`)(key) === true } catch { return false }
}

// ---------------- packet viewer ----------------
export type Packet = { no: number; t: string; src: string; dst: string; proto: string; info: string; data?: string }
export function filterPackets(ps: Packet[], q: string) {
  const f = q.trim().toLowerCase()
  if (!f) return ps
  const m = /^(ip\.src|ip\.dst|ip\.addr)\s*==\s*([\d.]+)$/.exec(f)
  if (m) return ps.filter(p => (m[1] !== 'ip.dst' && p.src === m[2]) || (m[1] !== 'ip.src' && p.dst === m[2]))
  return ps.filter(p => p.proto.toLowerCase() === f || p.info.toLowerCase().includes(f) || (p.data ?? '').toLowerCase().includes(f))
}
