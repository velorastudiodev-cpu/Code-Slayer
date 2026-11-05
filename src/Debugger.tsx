import { useEffect, useState } from 'react'
import { debugPy, type DebugResult } from './run'

// Step Debugger Python: jalankan sekali dengan tracer, lalu maju/mundur per langkah.
export function Debugger({ code, stdin, onClose }: { code: string; stdin: string; onClose: () => void }) {
  const [data, setData] = useState<DebugResult | null>(null)
  const [i, setI] = useState(0)
  useEffect(() => { debugPy(code, stdin).then(setData) }, [code, stdin])

  const n = data?.steps.length ?? 0
  const go = (k: number) => setI(Math.max(0, Math.min(n - 1, k)))
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('.cm-editor, textarea, input:not([type=range])')) return
      if (e.key === 'ArrowRight') setI(k => Math.min(n - 1, k + 1))
      if (e.key === 'ArrowLeft') setI(k => Math.max(0, k - 1))
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [n])

  if (!data) return <section className="card debugger"><p className="muted">Merekam langkah…</p></section>
  const step = data.steps[i]
  const prev = data.steps[i - 1]
  const last = i === n - 1
  const changed = (f: number, k: string) => prev && prev.stack[f]?.name === step.stack[f]?.name && prev.stack[f]?.vars[k] !== step.stack[f].vars[k]
  return (
    <section className="card debugger" aria-label="Step Debugger">
      <div className="row">
        <h2>Step Debugger</h2>
        <button className="btn-ghost" onClick={onClose}>Tutup</button>
      </div>
      {n === 0 ? <p className="feedback wrong">{data.error ?? 'Tidak ada langkah.'}</p> : (
        <>
          <div className="dbg-controls">
            <button onClick={() => go(0)} aria-label="Langkah pertama">⏮</button>
            <button onClick={() => go(i - 1)} aria-label="Mundur">◀</button>
            <span className="muted small">Langkah {i + 1}/{n}</span>
            <button onClick={() => go(i + 1)} aria-label="Maju">▶</button>
            <button onClick={() => go(n - 1)} aria-label="Langkah terakhir">⏭</button>
          </div>
          <input type="range" min={0} max={n - 1} value={i} onChange={e => go(+e.target.value)} aria-label="Langkah" />
          <ol className="dbg-code code">
            {code.trimEnd().split('\n').map((l, k) => (
              <li key={k} className={k + 1 === step.line ? 'now' : ''}><span>{k + 1 === step.line ? '▶' : ' '}</span>{l || ' '}</li>
            ))}
          </ol>
          <div className="dbg-frames">
            {step.stack.map((f, fi) => (
              <div key={fi} className="frame">
                <b>{f.name}</b>
                <table><tbody>
                  {Object.entries(f.vars).map(([k, v]) => <tr key={k} className={changed(fi, k) ? 'changed' : ''}><td>{k}</td><td><code>{v}</code></td></tr>)}
                  {!Object.keys(f.vars).length && <tr><td className="muted">(kosong)</td></tr>}
                </tbody></table>
              </div>
            ))}
          </div>
          <small className="muted">Output sejauh ini</small>
          <pre className="code">{data.out.slice(0, last ? undefined : step.out) || ' '}</pre>
          {last && data.error && <p className="feedback wrong">{data.error}</p>}
        </>
      )}
    </section>
  )
}
