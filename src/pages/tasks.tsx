// Jenis latihan M5 yang dinilai langsung di perangkat (tanpa test case) + isian kode.
import { Fragment, useMemo, useRef, useState } from 'react'
import { COMPLEXITIES, ruleOk, type Exercise, type Rule } from '../data/exercise-types'
import { shuffle } from '../data/content'
import type { Graded } from '../run'

// Hasil non-test (pilihan, tabel, ketikan) ditampilkan dengan label sendiri di Results.
export const verdict = (pass: boolean, label: string, note?: string): Graded =>
  ({ expected: '', run: { stdout: '', stderr: '', ok: true }, pass, label, note })

const LANG_NAME: Record<string, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', sql: 'SQL', c: 'C', cpp: 'C++', java: 'Java' }

export function SourceView({ ex }: { ex: Exercise }) {
  return (
    <>
      <small className="muted">Kode sumber ({LANG_NAME[ex.from_lang!]}) → tulis ulang dalam {LANG_NAME[ex.lang]}</small>
      <pre className="code">{ex.from_code!.trimEnd()}</pre>
    </>
  )
}

export function RuleList({ rules, code }: { rules: Rule[]; code: string }) {
  return (
    <ul className="rules">
      {rules.map(r => { const ok = ruleOk(r, code); return <li key={r.text} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {r.text}</li> })}
    </ul>
  )
}

export function Fill({ ex, disabled, label, onRun }: { ex: Exercise; disabled: boolean; label: string; onRun: (code: string) => void }) {
  const [vals, setVals] = useState(() => ex.blank_sizes!.map(() => ''))
  const parts = ex.parts!
  return (
    <>
      <pre className="code fill">
        {parts.map((p, i) => (
          <Fragment key={i}>
            {p}
            {i < vals.length && (
              <input aria-label={`Isian ${i + 1}`} value={vals[i]} size={Math.max(3, ex.blank_sizes![i] + 1)} spellCheck={false} autoCapitalize="off" autoComplete="off"
                onChange={e => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} />
            )}
          </Fragment>
        ))}
      </pre>
      <button className="btn-primary" disabled={disabled || vals.some(v => !v.trim())} onClick={() => onRun(parts.map((p, i) => p + (vals[i] ?? '')).join(''))}>{label}</button>
    </>
  )
}

// Nilai cocok kalau sama persis dengan repr Python, atau sama tanpa tanda kutip string.
const sameCell = (typed: string, key: string) => typed.trim() === key || typed.trim() === key.replace(/^(['"])(.*)\1$/, '$2')

export function TraceTable({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const t = ex.trace!
  const [cells, setCells] = useState(() => t.rows.map(r => r.map(() => '')))
  const wrong = t.rows.flatMap((r, i) => r.map((k, j) => !sameCell(cells[i][j], k))).filter(Boolean).length
  return (
    <>
      <ol className="dbg-code code">
        {ex.code!.trimEnd().split('\n').map((l, k) => <li key={k} className={k + 1 === t.line ? 'now' : ''}><span>{k + 1 === t.line ? '▶' : ' '}</span>{l || ' '}</li>)}
      </ol>
      <p className="muted small">Isi nilai variabel setiap kali baris {t.line} (▶) SELESAI dijalankan. String boleh ditulis dengan atau tanpa tanda kutip.</p>
      <table className="trace">
        <thead><tr><th>#</th>{t.vars.map(v => <th key={v}><code>{v}</code></th>)}</tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {r.map((k, j) => (
                <td key={j} className={done ? (sameCell(cells[i][j], k) ? 'ok' : 'bad') : ''}>
                  <input aria-label={`${t.vars[j]} baris ${i + 1}`} value={cells[i][j]} disabled={done} spellCheck={false} autoCapitalize="off"
                    onChange={e => setCells(cells.map((row, a) => (a === i ? row.map((c, b) => (b === j ? e.target.value : c)) : row)))} />
                  {done && !sameCell(cells[i][j], k) && <small>{k}</small>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!done && <button className="btn-primary" disabled={cells.flat().some(c => !c.trim())} onClick={() => onCheck([verdict(!wrong, wrong ? `${wrong} sel salah` : 'Semua sel benar')])}>Periksa tabel</button>}
    </>
  )
}

export function Complexity({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const [pick, setPick] = useState<string | null>(null)
  return (
    <>
      <pre className="code">{ex.code!.trimEnd()}</pre>
      <div className="choices grid2">
        {COMPLEXITIES.map(c => (
          <button key={c} className="opt" disabled={done} data-state={done ? (c === ex.answer ? 'right' : c === pick ? 'wrong' : undefined) : undefined}
            onClick={() => { setPick(c); onCheck([verdict(c === ex.answer, `Jawabanmu ${c}${c === ex.answer ? '' : `, yang benar ${ex.answer}`}`, ex.explain)]) }}>
            {c}
          </button>
        ))}
      </div>
    </>
  )
}

export function Typing({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const target = ex.code!.trimEnd()
  const [typed, setTyped] = useState('')
  const start = useRef(0)
  function change(v: string) {
    if (!start.current) start.current = Date.now()
    setTyped(v)
    if (v.length >= target.length) {
      const benar = [...target].filter((c, i) => v[i] === c).length
      const akurasi = benar / target.length
      const wpm = Math.round(benar / 5 / Math.max((Date.now() - start.current) / 60000, 1 / 60))
      onCheck([verdict(akurasi >= 0.95, `Akurasi ${Math.round(akurasi * 100)}% · ${wpm} WPM`, akurasi >= 0.95 ? undefined : 'Butuh akurasi minimal 95%. Pelan tapi tepat!')])
    }
  }
  return (
    <>
      <pre className="code typing" aria-hidden>
        {[...target].map((c, i) => <span key={i} className={i < typed.length ? (typed[i] === c ? 'ok' : 'bad') : i === typed.length ? 'cur' : ''}>{c}</span>)}
      </pre>
      <textarea aria-label="Ketik ulang kode di atas" rows={target.split('\n').length + 1} value={typed} disabled={done} spellCheck={false} autoCapitalize="off" autoComplete="off"
        onChange={e => change(e.target.value)}
        onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); change(typed + '    ') } }} />
      <small className="muted">{typed.length}/{target.length} karakter. Tab = 4 spasi. Waktu mulai saat ketukan pertama.</small>
    </>
  )
}

export function Review({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const [sel, setSel] = useState<number[]>([])
  const issues = ex.issues!
  const isIssue = (n: number) => issues.some(i => i.line === n)
  const found = sel.filter(isIssue).length
  const keliru = sel.length - found
  return (
    <>
      <p className="muted small">Tap baris yang bermasalah (bisa lebih dari satu), lalu kirim review.</p>
      <ol className="lines code review">
        {ex.code!.trimEnd().split('\n').map((t, i) => {
          const n = i + 1
          const note = done ? issues.find(x => x.line === n)?.text : undefined
          return (
            <li key={i} className={done ? (isIssue(n) ? (sel.includes(n) ? 'hit' : 'miss') : sel.includes(n) ? 'false' : '') : ''}>
              <button aria-pressed={sel.includes(n)} disabled={done} onClick={() => setSel(sel.includes(n) ? sel.filter(x => x !== n) : [...sel, n])}>{t || ' '}</button>
              {note && <small className="note">↳ {note}</small>}
            </li>
          )
        })}
      </ol>
      {!done && (
        <button className="btn-primary" disabled={!sel.length} onClick={() => onCheck([verdict(found === issues.length && !keliru, `${found}/${issues.length} masalah ditemukan${keliru ? `, ${keliru} tandaan keliru` : ''}`)])}>
          Kirim review
        </button>
      )}
    </>
  )
}

export function ReadError({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const opts = useMemo(() => shuffle(ex.options!.map((t, i) => ({ t, ok: i === 0 }))), [ex])
  const [pick, setPick] = useState<number | null>(null)
  return (
    <>
      <pre className="code">{ex.code!.trimEnd()}</pre>
      {ex.tests[0]?.input && <><small className="muted">Input</small><pre className="code">{ex.tests[0].input.trimEnd()}</pre></>}
      <small className="muted">Pesan error</small>
      <pre className="stderr">{ex.error}</pre>
      <p className="prompt">Apa penyebab dan perbaikannya?</p>
      <div className="choices">
        {opts.map((o, i) => (
          <button key={i} className="opt" disabled={done} data-state={done ? (o.ok ? 'right' : i === pick ? 'wrong' : undefined) : undefined}
            onClick={() => { setPick(i); onCheck([verdict(o.ok, o.ok ? 'Diagnosis tepat' : 'Diagnosis meleset', ex.explain)]) }}>
            {o.t}
          </button>
        ))}
      </div>
    </>
  )
}

// Kuis skenario: pilihan ganda dengan penjelasan (options[0] benar, diacak saat tampil).
export function Quiz({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const opts = useMemo(() => shuffle(ex.options!.map((t, i) => ({ t, ok: i === 0 }))), [ex])
  const [pick, setPick] = useState<number | null>(null)
  return (
    <>
      {ex.code && <pre className="code">{ex.code.trimEnd()}</pre>}
      <div className="choices">
        {opts.map((o, i) => (
          <button key={i} className="opt" disabled={done} data-state={done ? (o.ok ? 'right' : i === pick ? 'wrong' : undefined) : undefined}
            onClick={() => { setPick(i); onCheck([verdict(o.ok, o.ok ? 'Tepat' : `Belum tepat. Jawaban: ${ex.options![0]}`, ex.explain)]) }}>
            {o.t}
          </button>
        ))}
      </div>
    </>
  )
}

// Jawaban singkat: dicocokkan tanpa membedakan huruf besar/kecil dan spasi berlebih.
export const normAnswer = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')
export function ShortAnswer({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (g: Graded[]) => void }) {
  const [ans, setAns] = useState('')
  const ok = () => ex.accept!.some(a => normAnswer(a) === normAnswer(ans))
  return (
    <>
      {ex.code && <pre className="code">{ex.code.trimEnd()}</pre>}
      <form className="short-answer" onSubmit={e => { e.preventDefault(); if (ans.trim()) onCheck([verdict(ok(), ok() ? `Jawabanmu ${ans.trim()}` : `Jawabanmu ${ans.trim()}, yang benar ${ex.accept![0]}`, ex.explain)]) }}>
        <label className="field">
          <small className="muted">Jawabanmu</small>
          <input value={ans} disabled={done} onChange={e => setAns(e.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Jawaban singkat" />
        </label>
        {!done && <button className="btn-primary" disabled={!ans.trim()}>Periksa</button>}
      </form>
    </>
  )
}
