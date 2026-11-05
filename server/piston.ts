// Backend eksekusi "piston": Piston (github.com/engineer-man/piston) di Docker. Kode berjalan di sandbox isolate,
// tanpa akses jaringan, dengan batas waktu & memori dari Piston.
import type { Run } from '../src/run/exec.ts'
import type { CLang } from './compiled.ts'

const LANG: Record<CLang, { language: string; file: string }> = {
  c: { language: 'c', file: 'main.c' },
  cpp: { language: 'c++', file: 'main.cpp' },
  java: { language: 'java', file: 'Main.java' },
  go: { language: 'go', file: 'main.go' },
  rust: { language: 'rust', file: 'main.rs' },
  csharp: { language: 'csharp', file: 'main.cs' },
  kotlin: { language: 'kotlin', file: 'main.kt' },
}

type Stage = { stdout: string; stderr: string; code: number | null; signal: string | null }

export async function runPiston(url: string, lang: CLang, code: string, inputs: string[], f: typeof fetch = fetch, timeLimitMs = 2000): Promise<Run[]> {
  // Piston menerima satu stdin per eksekusi, jadi tiap tes satu request (dijalankan paralel).
  return Promise.all(inputs.map(async stdin => {
    const res = await f(`${url}/api/v2/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        language: LANG[lang].language, version: '*', files: [{ name: LANG[lang].file, content: code }], stdin,
        compile_timeout: 20000, run_timeout: timeLimitMs, run_memory_limit: 256 * 1024 * 1024,
      }),
    })
    if (!res.ok) return { stdout: '', stderr: `Server eksekusi menolak (${res.status}): ${await res.text()}\n`, ok: false }
    const { compile, run } = (await res.json()) as { compile?: Stage; run: Stage }
    if (compile && compile.code !== 0) return { stdout: '', stderr: `Gagal kompilasi:\n${compile.stderr || compile.stdout}`, ok: false }
    if (run.signal === 'SIGKILL') return { stdout: run.stdout, stderr: 'Waktu habis\n', ok: false, timeout: true }
    return { stdout: run.stdout, stderr: run.stderr + (run.signal ? `${run.signal}\n` : ''), ok: run.code === 0 && !run.signal }
  }))
}
