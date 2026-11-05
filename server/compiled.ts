// Backend eksekusi "local": compile sekali, jalankan per input dengan timeout, batas memori, dan batas output.
// Dipakai server (EXEC_BACKEND=local, untuk pengembangan) dan build konten. Produksi: Piston di Docker (lihat piston.ts).
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Run } from '../src/run/exec.ts'

export type CLang = 'c' | 'cpp' | 'java' | 'go' | 'rust' | 'csharp' | 'kotlin'
export const COMPILED: CLang[] = ['c', 'cpp', 'java', 'go', 'rust', 'csharp', 'kotlin']

const MEM_KB = 262144 // 256 MB
const SPEC: Record<CLang, { file: string; compile: string[]; run: string[] }> = {
  c: { file: 'main.c', compile: ['gcc', '-O2', '-std=c17', '-o', 'main', 'main.c', '-lm'], run: ['sh', '-c', `ulimit -v ${MEM_KB}; exec ./main`] },
  cpp: { file: 'main.cpp', compile: ['g++', '-O2', '-std=c++20', '-o', 'main', 'main.cpp'], run: ['sh', '-c', `ulimit -v ${MEM_KB}; exec ./main`] },
  // JVM butuh ruang alamat virtual besar, jadi batasnya lewat -Xmx, bukan ulimit.
  java: { file: 'Main.java', compile: ['javac', '-J-Xmx512m', '-encoding', 'UTF-8', 'Main.java'], run: ['java', '-Xmx256m', '-Xss64m', '-XX:+UseSerialGC', 'Main'] },
  // Runtime Go & Mono memesan ruang alamat besar di awal: batas memori lewat GOMEMLIMIT / heap GC, bukan ulimit -v.
  go: { file: 'main.go', compile: ['go', 'build', '-o', 'main', 'main.go'], run: ['sh', '-c', 'GOMEMLIMIT=256MiB GOMAXPROCS=1 exec ./main'] },
  rust: { file: 'main.rs', compile: ['rustc', '-O', '--edition', '2021', '-o', 'main', 'main.rs'], run: ['sh', '-c', `ulimit -v ${MEM_KB}; exec ./main`] },
  csharp: { file: 'main.cs', compile: ['mcs', '-langversion:experimental', '-out:main.exe', 'main.cs'], run: ['sh', '-c', 'MONO_GC_PARAMS=max-heap-size=256m exec mono main.exe'] },
  kotlin: { file: 'main.kt', compile: ['kotlinc', 'main.kt', '-include-runtime', '-d', 'main.jar'], run: ['java', '-Xmx256m', '-Xss64m', '-XX:+UseSerialGC', '-jar', 'main.jar'] },
}

const MAX_OUT = 1 << 20
const env: NodeJS.ProcessEnv = { ...process.env, LANG: 'C.UTF-8', GOCACHE: join(tmpdir(), 'slayer-gocache'), GOPATH: join(tmpdir(), 'slayer-gopath'), GOFLAGS: '-mod=mod', GO111MODULE: 'off', JAVA_OPTS: '-Xmx512m' }
delete env.JAVA_TOOL_OPTIONS // kalau ada, JVM mencetaknya ke stderr

type Exec = { code: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean }

function exec(cmd: string[], cwd: string, input: string, timeoutMs: number, extraEnv = {}): Promise<Exec> {
  return new Promise(resolve => {
    const p = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...env, ...extraEnv } })
    let stdout = '', stderr = '', timedOut = false
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL') }, timeoutMs)
    p.stdout.on('data', d => { stdout += d; if (stdout.length > MAX_OUT) p.kill('SIGKILL') })
    p.stderr.on('data', d => { stderr += d; if (stderr.length > MAX_OUT) p.kill('SIGKILL') })
    p.on('error', e => { stderr += e.message })
    p.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, timedOut }) })
    p.stdin.on('error', () => {}) // program boleh tidak membaca stdin
    p.stdin.end(input)
  })
}

const SIGNAL_MSG: Record<string, string> = {
  SIGSEGV: 'Segmentation fault (akses memori tidak valid)',
  SIGFPE: 'Floating point exception (misalnya pembagian dengan nol)',
  SIGABRT: 'Aborted',
}

export async function runCompiled(lang: CLang, code: string, inputs: string[], { timeoutMs = 2000, compileMs = 20000 } = {}): Promise<Run[]> {
  const spec = SPEC[lang]
  const dir = await mkdtemp(join(tmpdir(), 'slayer-'))
  try {
    await writeFile(join(dir, spec.file), code)
    // Pesan compiler dalam ASCII (tanpa kutip Unicode), sama dengan Piston.
    const c = await exec(spec.compile, dir, '', compileMs, { LC_ALL: 'C' })
    if (c.code !== 0) {
      const msg = c.timedOut ? 'Kompilasi terlalu lama.\n' : (c.stderr + c.stdout).replaceAll(dir + '/', '')
      return inputs.map(() => ({ stdout: '', stderr: `Gagal kompilasi:\n${msg}`, ok: false }))
    }
    const out: Run[] = []
    for (const input of inputs) {
      const r = await exec(spec.run, dir, input, timeoutMs)
      if (r.timedOut) out.push({ stdout: r.stdout, stderr: 'Waktu habis\n', ok: false, timeout: true })
      else {
        // `exec` di sh membuat sinyal program dilaporkan langsung.
        const extra = r.signal ? `${SIGNAL_MSG[r.signal] ?? r.signal}\n` : r.code ? `(exit code ${r.code})\n` : ''
        out.push({ stdout: r.stdout, stderr: r.stderr + extra, ok: r.code === 0 && !r.signal })
      }
    }
    return out
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
