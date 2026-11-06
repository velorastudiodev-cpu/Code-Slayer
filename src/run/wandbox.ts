// Cadangan server publik: Wandbox (wandbox.org) untuk C, C++, Java, Go, Rust, C# bila belum ada server eksekusi sendiri.
// Dipilih pemilik aplikasi (opsi "layanan publik"); pengguna diberi tahu bahwa kodenya dikirim ke wandbox.org dan bisa
// mematikannya di Profil. Kotlin tidak tersedia di Wandbox, jadi tetap butuh server sendiri.
import type { Lang, Run } from './exec'

export const WANDBOX = 'https://wandbox.org/api'

// Compiler dari daftar resmi wandbox.org/api/list.json (dicek 2026-11). Bila namanya hilang, dicari ulang dari daftar.
export const WB: Partial<Record<Lang, { language: string; pin: string; raw?: string; prep?: (code: string) => string }>> = {
  c: { language: 'C', pin: 'gcc-13.2.0-c', raw: '-O2\n-lm' },
  cpp: { language: 'C++', pin: 'gcc-13.2.0', raw: '-O2\n-std=c++20' },
  java: { language: 'Java', pin: 'openjdk-jdk-21+35', prep: javaForWandbox },
  go: { language: 'Go', pin: 'go-1.23.2' },
  rust: { language: 'Rust', pin: 'rust-1.82.0' },
  csharp: { language: 'C#', pin: 'mono-6.12.0.199' },
}
export const wandboxSupports = (lang: Lang) => !!WB[lang]

// Wandbox menyimpan sumber Java sebagai prog.java, sedangkan soal memakai `public class Main`. Kelas Main dibuat
// non-public dan ditambah peluncur `prog`, sehingga jalan baik bila Wandbox menjalankan `java prog` maupun `java Main`.
export function javaForWandbox(code: string) {
  if (!/\bclass\s+Main\b/.test(code)) return code
  return code.replace(/\bpublic\s+(final\s+)?class\s+Main\b/, (_, f) => `${f ?? ''}class Main`) +
    '\nclass prog { public static void main(String[] args) throws Exception { Main.main(args); } }\n'
}

type WbRes = { status?: string; signal?: string; compiler_error?: string; compiler_message?: string; program_output?: string; program_error?: string; program_message?: string; error?: string }

// Respons Wandbox → bentuk Run yang sama dengan server sendiri.
export function fromWandbox(r: WbRes): Run {
  const out = r.program_output ?? ''
  const err = r.program_error ?? ''
  const ranProgram = 'program_output' in r || 'program_error' in r
  if (r.error) return { stdout: '', stderr: `Server publik error: ${r.error}\n`, ok: false }
  if (r.status !== '0' && !ranProgram && r.compiler_error) return { stdout: '', stderr: `Gagal kompilasi:\n${r.compiler_error}`, ok: false }
  const killed = /kill|time ?limit|timeout/i.test(`${r.signal ?? ''} ${r.program_message ?? ''}`)
  if (killed) return { stdout: out, stderr: 'Waktu habis (batas server publik)\n', ok: false, timeout: true }
  const sig = r.signal ? `${r.signal}\n` : ''
  return { stdout: out, stderr: err + (r.status && r.status !== '0' && !err ? `(exit code ${r.status})\n` : '') + sig, ok: r.status === '0' && !r.signal }
}

let listCache: Promise<{ name: string; language: string }[]> | null = null
async function compilerFor(lang: Lang, f: typeof fetch, avoid?: string) {
  const spec = WB[lang]!
  if (!avoid) return spec.pin
  listCache ??= f(`${WANDBOX}/list.json`).then(r => r.json())
  const list = await listCache
  return list.find(c => c.language === spec.language && c.name !== avoid && !c.name.includes('head'))?.name ?? spec.pin
}

// Satu request per input (Wandbox menerima satu stdin), paling banyak 2 sekaligus agar sopan ke layanan gratis.
export async function runWandbox(lang: Lang, code: string, inputs: string[], f: typeof fetch = fetch): Promise<Run[]> {
  const spec = WB[lang]
  if (!spec) return inputs.map(() => ({ stdout: '', stderr: 'Bahasa ini tidak tersedia di server publik. Atur server sendiri di Profil → Server eksekusi.\n', ok: false, offline: true }))
  const src = spec.prep ? spec.prep(code) : code
  let compiler = spec.pin
  const one = async (stdin: string, retry = true): Promise<Run> => {
    try {
      const res = await f(`${WANDBOX}/compile.json`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ compiler, code: src, stdin, ...(spec.raw ? { 'compiler-option-raw': spec.raw } : {}), save: false }),
      })
      if (res.status === 429) return { stdout: '', stderr: 'Server publik sedang sibuk (batas permintaan). Coba lagi sebentar lagi.\n', ok: false, offline: true }
      if (!res.ok) {
        const t = await res.text()
        // Nama compiler sudah tidak tersedia: cari penggantinya dari daftar resmi, lalu ulangi sekali.
        if (retry && /compiler/i.test(t)) { compiler = await compilerFor(lang, f, compiler); return one(stdin, false) }
        return { stdout: '', stderr: `Server publik menolak (${res.status}).\n`, ok: false }
      }
      return fromWandbox(await res.json())
    } catch {
      return { stdout: '', stderr: 'Server publik (wandbox.org) tidak bisa dihubungi. Periksa internet.\n', ok: false, offline: true }
    }
  }
  const out: Run[] = new Array(inputs.length)
  let next = 0
  await Promise.all([0, 1].map(async () => { while (next < inputs.length) { const i = next++; out[i] = await one(inputs[i]) } }))
  return out
}
