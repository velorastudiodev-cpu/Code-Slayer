// Eksekusi murni (tanpa DOM) supaya bisa dipakai di Web Worker dan di test Node.
import type { SqlJsStatic } from 'sql.js'

export type Lang = 'python' | 'javascript' | 'typescript' | 'sql' | 'c' | 'cpp' | 'java' | 'go' | 'rust' | 'csharp' | 'kotlin' | 'bash' | 'html'
export type Run = { stdout: string; stderr: string; ok: boolean; timeout?: boolean; offline?: boolean }

// Bahasa compiled berjalan di server eksekusi (butuh koneksi); sisanya offline di browser.
export const NEEDS_SERVER: Lang[] = ['c', 'cpp', 'java', 'go', 'rust', 'csharp', 'kotlin']

// Format nilai mirip console.log Node, supaya output yang diharapkan sama dengan di terminal.
function fmt(v: unknown, top = true): string {
  if (typeof v === 'string') return top ? v : `'${v}'`
  if (Array.isArray(v)) return v.length ? `[ ${v.map(x => fmt(x, false)).join(', ')} ]` : '[]'
  if (v instanceof Map) return `Map(${v.size}) {${v.size ? ` ${[...v].map(([k, x]) => `${fmt(k, false)} => ${fmt(x, false)}`).join(', ')} ` : ''}}`
  if (v instanceof Set) return `Set(${v.size}) {${v.size ? ` ${[...v].map(x => fmt(x, false)).join(', ')} ` : ''}}`
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (v && typeof v === 'object') {
    const e = Object.entries(v)
    return e.length ? `{ ${e.map(([k, x]) => `${k}: ${fmt(x, false)}`).join(', ')} }` : '{}'
  }
  return String(v)
}

// require() hanya menyediakan 'fs' versi memori (per eksekusi): cukup untuk belajar API file Node di browser.
// readFileSync(0) / '/dev/stdin' membaca seluruh stdin (idiom Node untuk competitive programming).
function makeRequire(stdin = '') {
  const files = new Map<string, string>()
  const missing = (p: string | number) => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' })
  const read = (p: string | number) => { if (p === 0 || p === '/dev/stdin') return stdin; if (!files.has(p as string)) throw missing(p); return files.get(p as string)! }
  const write = (p: string, d: unknown) => { files.set(p, String(d)) }
  const append = (p: string, d: unknown) => { files.set(p, (files.get(p) ?? '') + String(d)) }
  const promises = { readFile: async (p: string) => read(p), writeFile: async (p: string, d: unknown) => write(p, d), appendFile: async (p: string, d: unknown) => append(p, d) }
  const fs = { readFileSync: read, writeFileSync: write, appendFileSync: append, existsSync: (p: string) => files.has(p), unlinkSync: (p: string) => { if (!files.delete(p)) throw missing(p) }, promises }
  return (m: string) => {
    if (m === 'fs' || m === 'node:fs') return fs
    if (m === 'fs/promises' || m === 'node:fs/promises') return promises
    throw new Error(`Cannot find module '${m}'`)
  }
}

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<void>

// stdin dibaca lewat readline() / prompt() (konvensi judge JS seperti Codeforces), output lewat console.log / print.
export async function execJs(code: string, input: string, ts = false): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const lines = input.split('\n')
  let i = 0
  const readline = () => (i < lines.length ? lines[i++] : null)
  const log = (...a: unknown[]) => { out.push(a.map(x => fmt(x)).join(' ') + '\n') }
  const elog = (...a: unknown[]) => { err.push(a.map(x => fmt(x)).join(' ') + '\n') }
  const console = { log, info: log, debug: log, warn: elog, error: elog }
  try {
    if (ts) code = (await import('sucrase')).transform(code, { transforms: ['typescript'] }).code
    await new AsyncFunction('console', 'readline', 'prompt', 'print', 'require', code)(console, readline, readline, log, makeRequire(input))
    // Satu tick event loop: callback setTimeout(..., 0) & microtask sempat jalan sebelum output diambil.
    await new Promise(r => setTimeout(r, 0))
    return { stdout: out.join(''), stderr: err.join(''), ok: true }
  } catch (e) {
    return { stdout: out.join(''), stderr: err.join('') + fmt(e) + '\n', ok: false }
  }
}

// SQL: stdin = skrip setup (CREATE/INSERT), output = hasil statement terakhir, kolom dipisah "|".
export function execSql(SQL: SqlJsStatic, code: string, setup: string, header = false): Run {
  const db = new SQL.Database()
  try {
    db.run(setup)
    const last = db.exec(code).at(-1)
    if (last && last.columns.join() === 'id,parent,notused,detail') return { stdout: queryPlan(last.values as [number, number, unknown, string][]), stderr: '', ok: true }
    const rows = last ? [...(header ? [last.columns] : []), ...last.values] : []
    return { stdout: rows.map(r => r.map(v => (v === null ? 'NULL' : String(v))).join('|') + '\n').join(''), stderr: '', ok: true }
  } catch (e) {
    return { stdout: '', stderr: `${(e as Error).message}\n`, ok: false }
  } finally {
    db.close()
  }
}

// EXPLAIN QUERY PLAN ditampilkan sebagai pohon seperti CLI sqlite3 (angka id internal tidak ditampilkan karena berubah antar versi).
export function queryPlan(rows: [number, number, unknown, string][]) {
  let out = 'QUERY PLAN\n'
  const walk = (parent: number, prefix: string) => {
    const kids = rows.filter(r => r[1] === parent)
    kids.forEach((r, i) => {
      const last = i === kids.length - 1
      out += `${prefix}${last ? '`--' : '|--'}${r[3]}\n`
      walk(r[0], prefix + (last ? '   ' : '|  '))
    })
  }
  walk(0, '')
  return out
}

// Bandingkan output: abaikan spasi di akhir baris dan baris kosong di akhir.
export const norm = (s: string) => s.replace(/\r/g, '').split('\n').map(l => l.trimEnd()).join('\n').trimEnd()
