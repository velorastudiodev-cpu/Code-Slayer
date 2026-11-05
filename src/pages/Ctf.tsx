// CTF Arena (jeopardy): web, crypto, forensics, rev, misc. Flag SLAYER{...}, poin, dan papan skor pribadi.
// Semua target adalah simulasi buatan sendiri di perangkat user. Didahului ikrar etika (wajib).
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useAttempts } from '../db'
import { FlagForm, LabTools, Writeup, useLabs, type Lab } from '../labs/LabView'
import { sfx } from '../sfx'

const CATS: [string, string][] = [['web', '🌐 Web'], ['crypto', '🔐 Crypto'], ['forensics', '🔎 Forensics'], ['rev', '🧩 Rev'], ['misc', '📡 Misc']]
const TITLES: [number, string][] = [[0, 'Mizunoto'], [300, 'Kanoe'], [1000, 'Tsuguko'], [2500, 'Hashira'], [4500, 'Hashira Serangga']]

export function useSolves() {
  const a = useAttempts() // solve dari Arena (track ctf) maupun dari bab Cyber (track cyber)
  const m = new Map<string, string>()
  for (const x of [...a].sort((p, q) => p.date.localeCompare(q.date))) if (x.kind === 'ctf' && x.passed && !m.has(x.node)) m.set(x.node, x.date)
  return m
}
export async function recordSolve(lab: Lab, track = 'ctf') {
  await db.attempts.add({ track, node: lab.id, kind: 'ctf', date: new Date().toISOString(), correct: lab.points, total: lab.points, passed: true, meta: { type: lab.cat } })
  sfx('fanfare')
}

// Ikrar etika: wajib sebelum lab pertama.
export function EthicsGate({ children }: { children: React.ReactNode }) {
  const ok = useLiveQuery(() => db.kv.get('ctf:ikrar').then(r => !!r), [])
  const [c, setC] = useState([false, false, false])
  if (ok === undefined) return null
  if (ok) return <>{children}</>
  const items = [
    'Aku hanya menguji sistem milikku sendiri atau yang pemiliknya mengizinkan secara tertulis. Semua lab di sini adalah simulasi milik aplikasi ini.',
    'Aku paham akses ilegal ke sistem elektronik orang lain adalah tindak pidana (UU ITE, antara lain Pasal 30, 32, dan 46).',
    'Jika menemukan celah di sistem nyata, aku melaporkannya secara bertanggung jawab (responsible disclosure) dan tidak menyalahgunakannya.',
  ]
  return (
    <div className="page">
      <h1>🦋 Ikrar Etika Slayer</h1>
      <p className="muted">Shinobu: "Racun bisa menyembuhkan atau membunuh. Ilmu peretasan juga begitu." Centang ketiganya untuk masuk.</p>
      <section className="card">
        {items.map((t, i) => <label key={i} className="check"><input type="checkbox" checked={c[i]} onChange={e => setC(c.map((x, j) => (j === i ? e.target.checked : x)))} /> {t}</label>)}
        <button className="btn-primary" disabled={!c.every(Boolean)} onClick={() => db.kv.put({ key: 'ctf:ikrar', value: new Date().toISOString() })}>Aku berikrar</button>
      </section>
    </div>
  )
}

export default function CtfArena() {
  const labs = useLabs()
  const solves = useSolves()
  if (!labs) return <p className="muted">Memuat…</p>
  const pts = labs.filter(l => solves.has(l.id)).reduce((s, l) => s + l.points, 0)
  const max = labs.reduce((s, l) => s + l.points, 0)
  const title = [...TITLES].reverse().find(([p]) => pts >= p)![1]
  const timeline = labs.filter(l => solves.has(l.id)).sort((a, b) => solves.get(b.id)!.localeCompare(solves.get(a.id)!))
  return (
    <EthicsGate>
      <div className="page">
        <h1>🏴 CTF Arena</h1>
        <p className="muted">Jeopardy-style. Semua target berjalan di sandbox milik aplikasi ini — tidak ada sistem sungguhan yang diserang.</p>
        <section className="card scoreboard">
          <h2>Papan skor pribadi</h2>
          <p className="score-big">{pts} <small className="muted">/ {max} poin</small></p>
          <p>Gelar: <b>{title}</b> · {solves.size}/{labs.length} flag</p>
          <div className="bar" role="progressbar" aria-label="Poin CTF" aria-valuenow={pts} aria-valuemax={max}><i style={{ width: `${(100 * pts) / max}%` }} /></div>
          {timeline.length > 0 && <details><summary>Riwayat flag</summary><ol className="plain">{timeline.map(l => <li key={l.id}>{new Date(solves.get(l.id)!).toLocaleString('id-ID')} · {l.title} (+{l.points})</li>)}</ol></details>}
        </section>
        {CATS.map(([c, name]) => {
          const ls = labs.filter(l => l.cat === c).sort((a, b) => a.points - b.points)
          return (
            <section key={c}>
              <h2>{name} <small className="muted">{ls.filter(l => solves.has(l.id)).length}/{ls.length}</small></h2>
              <div className="ctf-grid">
                {ls.map(l => (
                  <Link key={l.id} to={`/ctf/${l.id}`} className={`card ctf-tile ${solves.has(l.id) ? 'solved' : ''}`}>
                    <b>{l.points}</b><span>{l.title}</span>{solves.has(l.id) && <small>✓ solved</small>}
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </EthicsGate>
  )
}

export function CtfLab() {
  const { id = '' } = useParams()
  const labs = useLabs()
  const solves = useSolves()
  const [hints, setHints] = useState(0)
  if (!labs) return null
  const lab = labs.find(l => l.id === id)
  if (!lab) return <Navigate to="/ctf" replace />
  const solved = solves.has(lab.id)
  return (
    <EthicsGate>
      <div className="page">
        <p><Link to="/ctf">← CTF Arena</Link></p>
        <h1>{lab.title} <span className="badge">{lab.cat} · {lab.points}</span></h1>
        <LabBody lab={lab} solved={solved} hints={hints} setHints={setHints} onSolve={() => void recordSolve(lab)} />
      </div>
    </EthicsGate>
  )
}

export function LabBody({ lab, solved, hints, setHints, onSolve }: { lab: Lab; solved: boolean; hints: number; setHints: (n: number) => void; onSolve: () => void }) {
  return (
    <>
      <p className="story">{lab.story}</p>
      <p className="prompt">🎯 {lab.task}</p>
      <LabTools lab={lab} />
      <FlagForm lab={lab} solved={solved} onSolve={onSolve} />
      {solved && <Writeup lab={lab} />}
      {!solved && (
        <section className="hints">
          {lab.hints.slice(0, hints).map((h, i) => <p key={i} className="feedback"><b>Hint {i + 1}:</b> {h}</p>)}
          {hints < lab.hints.length && <button className="btn-ghost" onClick={() => setHints(hints + 1)}>Minta hint ({hints + 1}/{lab.hints.length})</button>}
        </section>
      )}
    </>
  )
}
