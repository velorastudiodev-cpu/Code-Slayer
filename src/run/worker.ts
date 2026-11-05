/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide'
import type { SqlJsStatic } from 'sql.js'
import { execJs, execSql, type Lang, type Run } from './exec'
import TRACER from './tracer.py?raw'

export type Req = { id: number; lang: Lang; code: string; inputs: string[]; header?: boolean; debug?: boolean }

let py: Promise<PyodideInterface> | undefined
let sql: Promise<SqlJsStatic> | undefined

function loadPy() {
  return (py ??= (async () => {
    const base = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href
    const { loadPyodide } = await import(/* @vite-ignore */ base + 'pyodide.mjs')
    const p: PyodideInterface = await loadPyodide({ indexURL: base })
    // Prompt di input("...") tidak ikut ke stdout, supaya penilaian adil untuk pemula.
    p.runPython('import builtins\n_input = builtins.input\nbuiltins.input = lambda *a: _input()')
    p.FS.writeFile('/home/pyodide/slayer_tracer.py', TRACER)
    return p
  })())
}

function loadSql() {
  return (sql ??= (async () => {
    const [{ default: init }, { default: wasm }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')])
    return init({ locateFile: () => wasm })
  })())
}

async function execPy(p: PyodideInterface, code: string, input: string): Promise<Run> {
  let stdout = '', stderr = ''
  const dout = new TextDecoder(), derr = new TextDecoder()
  p.setStdout({ write: b => { stdout += dout.decode(b, { stream: true }); return b.length } })
  p.setStderr({ write: b => { stderr += derr.decode(b, { stream: true }); return b.length } })
  // sys.stdin baru setiap run: buffer stdin Pyodide bisa menyimpan sisa input dari run sebelumnya.
  p.globals.set('__stdin', input)
  p.runPython('import sys, io\nsys.stdin = io.StringIO(__stdin)\ndel __stdin')
  const globals = p.globals.get('dict')()
  globals.set('__name__', '__main__')
  try {
    await p.runPythonAsync(code, { globals })
    flush(p)
    return { stdout, stderr, ok: true }
  } catch (e) {
    // Buang frame internal Pyodide, sisakan traceback kode user.
    const msg = (e as Error).message
    const at = msg.indexOf('  File "<exec>"')
    flush(p)
    return { stdout, stderr: stderr + (at < 0 ? msg : 'Traceback (most recent call last):\n' + msg.slice(at)), ok: false }
  } finally {
    globals.destroy()
  }
}

// Output tanpa newline (print(..., end="")) masih di buffer Python sampai di-flush.
const flush = (p: PyodideInterface) => p.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()')

async function handle({ id, lang, code, inputs, header, debug }: Req) {
  let exec: (input: string) => Run | Promise<Run>
  try {
    // Step Debugger: tracer mencatat setiap langkah, hasilnya JSON di stdout.
    if (lang === 'python' && debug) { const p = await loadPy(); exec = input => execPy(p, `import slayer_tracer\nprint(slayer_tracer.debug_steps(${JSON.stringify(code)}, ${JSON.stringify(input)}))`, input) }
    else if (lang === 'python') { const p = await loadPy(); exec = input => execPy(p, code, input) }
    else if (lang === 'sql') { const S = await loadSql(); exec = input => execSql(S, code, input, header) }
    else if (lang === 'bash') {
      // Terminal simulasi: VFS baru per tes, jadi tes tidak saling memengaruhi.
      const { Shell } = await import('../term/shell.ts')
      exec = async input => { const r = await new Shell().run(code, input); return { stdout: r.stdout, stderr: r.stderr, ok: r.code === 0 } }
    }
    else exec = input => execJs(code, input, lang === 'typescript')
  } catch (e) {
    return postMessage({ id, type: 'fatal', error: `Gagal memuat runtime: ${(e as Error).message}` })
  }
  postMessage({ id, type: 'start' })
  for (let i = 0; i < inputs.length; i++) postMessage({ id, type: 'result', i, run: await exec(inputs[i]) })
  postMessage({ id, type: 'done' })
}

// Satu permintaan per waktu: stdin/stdout Pyodide bersifat global.
let queue = Promise.resolve()
onmessage = ({ data }: MessageEvent<Req>) => { queue = queue.then(() => handle(data)) }
