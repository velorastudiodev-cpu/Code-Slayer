import { NEEDS_SERVER, norm, type Lang, type Run } from './exec'
import type { Req } from './worker'

export type { Lang, Run }
export { NEEDS_SERVER }
export const API = import.meta.env.VITE_API_URL ?? '/api'
export type Test = { input?: string; expected: string; hidden?: boolean }
// label/note: hasil jenis latihan non-test (pilihan, tabel, ketikan, aturan refactor).
export type Graded = Test & { run: Run; pass: boolean; label?: string; note?: string }

// Batas waktu per tes, dihitung setelah runtime siap (memuat Pyodide pertama kali tidak dihitung).
const TIMEOUT = 4000
const workers = new Map<string, Worker>()
let seq = 0

const fail = (msg: string, timeout = false): Run => ({ stdout: '', stderr: msg, ok: false, timeout })

const OFFLINE = 'Butuh koneksi: bahasa ini dikompilasi di server eksekusi, dan server tidak bisa dihubungi.\n'

async function runServer(lang: Lang, code: string, inputs: string[], onStart?: () => void, timeLimitMs?: number): Promise<Run[]> {
  onStart?.()
  try {
    const res = await fetch(`${API}/run`, {
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
