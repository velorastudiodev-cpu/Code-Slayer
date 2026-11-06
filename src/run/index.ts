import { NEEDS_SERVER, norm, type Lang, type Run } from './exec'
import type { Req } from './worker'
import { runWandbox, wandboxSupports } from './wandbox'

export type { Lang, Run }
export { NEEDS_SERVER }
// Alamat server eksekusi (bahasa compiled). Urutan: diatur user di Profil → saat build (VITE_API_URL) →
// '/api' di server yang sama (web). Di APK tanpa pengaturan: belum ada server sama sekali (null).
const isNative = () => typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
let userApi: string | null = null
export const setUserApi = (url: string | null) => { userApi = url }
// Cadangan layanan publik (wandbox.org) bila belum ada server sendiri. Bawaan: nyala; bisa dimatikan di Profil.
let publicOk = true
export const setPublicCompiler = (on: boolean) => { publicOk = on }
/** Tanpa server sendiri, apakah bahasa ini bisa dijalankan lewat layanan publik? */
export const usesPublic = (lang: Lang) => publicOk && wandboxSupports(lang)
export const normalizeApi = (url: string) => { const u = url.trim().replace(/\/+$/, ''); return u ? (u.endsWith('/api') ? u : `${u}/api`) : '' }
export function apiBase(): string | null {
  if (userApi) return userApi
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  return isNative() ? null : '/api'
}
/** @deprecated pakai apiBase() */
export const API = import.meta.env.VITE_API_URL ?? '/api'
export type Test = { input?: string; expected: string; hidden?: boolean }
// label/note: hasil jenis latihan non-test (pilihan, tabel, ketikan, aturan refactor).
export type Graded = Test & { run: Run; pass: boolean; label?: string; note?: string }

// Batas waktu per tes, dihitung setelah runtime siap (memuat Pyodide pertama kali tidak dihitung).
const TIMEOUT = 4000
const workers = new Map<string, Worker>()
let seq = 0

const fail = (msg: string, timeout = false): Run => ({ stdout: '', stderr: msg, ok: false, timeout })

const OFFLINE = 'Server eksekusi tidak bisa dihubungi. Bahasa ini di-compile di server, bukan di HP. Periksa internet atau alamat server di Profil → Server eksekusi.\n'
const NO_PUBLIC_JUDGE = 'Juri olimpiade butuh server eksekusi sendiri (batas waktu ketat & input besar tidak cocok untuk layanan publik). Atur di Profil → Server eksekusi.\n'
const NO_SERVER = 'Belum ada server eksekusi. Bahasa ini di-compile di server (bukan di HP), dan aplikasi ini belum diatur ke server mana pun. Ini bukan masalah internetmu: atur di Profil → Server eksekusi.\n'

async function runServer(lang: Lang, code: string, inputs: string[], onStart?: () => void, timeLimitMs?: number): Promise<Run[]> {
  onStart?.()
  const api = apiBase()
  if (!api) {
    // Juri olimpiade (timeLimitMs) tetap butuh server sendiri: batas waktu Wandbox berbeda dan input bisa berukuran MB.
    if (usesPublic(lang) && !timeLimitMs) return runWandbox(lang, code, inputs)
    return inputs.map(() => ({ ...fail(timeLimitMs && usesPublic(lang) ? NO_PUBLIC_JUDGE : NO_SERVER), offline: true }))
  }
  try {
    const res = await fetch(`${api}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang, code, inputs, ...(timeLimitMs ? { timeLimitMs } : {}) }), signal: AbortSignal.timeout(120_000),
    })
    // 502–504 = proxy tidak bisa menjangkau server eksekusi: sama dengan offline.
    if (res.status >= 502) return inputs.map(() => ({ ...fail(OFFLINE), offline: true }))
    if (!res.ok) return inputs.map(() => fail(`Server eksekusi error (${res.status}).\n`))
    return (await res.json()).results
  } catch {
    return inputs.map(() => ({ ...fail(OFFLINE), offline: true }))
  }
}

export function runMany(lang: Lang, code: string, inputs: string[], opts: { header?: boolean; onStart?: () => void; debug?: boolean; timeLimitMs?: number } = {}): Promise<Run[]> {
  if (NEEDS_SERVER.includes(lang)) return runServer(lang, code, inputs, opts.onStart, opts.timeLimitMs)
  // HTML/CSS: dinilai di main thread (DOMParser tidak ada di worker); script user tidak dijalankan.
  if (lang === 'html') return import('./htmlcheck').then(({ runChecks }) => { opts.onStart?.(); return inputs.map(i => ({ stdout: runChecks(new DOMParser().parseFromString(code, 'text/html'), JSON.parse(i || '[]')), stderr: '', ok: true })) })
  const key = lang === 'typescript' ? 'javascript' : lang
  let w = workers.get(key)
  if (!w) workers.set(key, (w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })))
  const worker = w
  const id = ++seq
  const results: Run[] = []
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => { clearTimeout(timer); worker.removeEventListener('message', on); resolve(results) }
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        // Infinite loop: matikan worker, buat baru di run berikutnya.
        worker.terminate()
        workers.delete(key)
        while (results.length < inputs.length) results.push(fail(`Waktu habis (> ${TIMEOUT / 1000} detik). Ada infinite loop?\n`, true))
        finish()
      }, TIMEOUT)
    }
    const on = ({ data: m }: MessageEvent) => {
      if (m.id !== id) return
      if (m.type === 'start') { opts.onStart?.(); arm() }
      else if (m.type === 'result') { results[m.i] = m.run; arm() }
      else if (m.type === 'done') finish()
      else if (m.type === 'fatal') { while (results.length < inputs.length) results.push(fail(m.error + '\n')); finish() }
    }
    worker.addEventListener('message', on)
    worker.postMessage({ id, lang, code, inputs, header: opts.header, debug: opts.debug } satisfies Req)
  })
}

export async function grade(lang: Lang, code: string, tests: Test[], setup = '', onStart?: () => void): Promise<Graded[]> {
  const runs = await runMany(lang, code, tests.map(t => setup + (t.input ?? '')), { onStart })
  return tests.map((t, i) => ({ ...t, run: runs[i], pass: runs[i].ok && norm(runs[i].stdout) === norm(t.expected) }))
}

export type Frame = { name: string; vars: Record<string, string> }
export type Step = { line: number; stack: Frame[]; out: number }
export type DebugResult = { steps: Step[]; out: string; error: string | null }

// Step Debugger (Python): rekam semua langkah sekali, lalu diputar ulang di UI.
export async function debugPy(code: string, stdin: string): Promise<DebugResult> {
  const [r] = await runMany('python', code, [stdin], { debug: true })
  return r.ok ? JSON.parse(r.stdout) : { steps: [], out: '', error: r.stderr }
}
