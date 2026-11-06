// Swordsmith Village: project bertahap. Satu draf kode per project terbawa dari tahap ke tahap;
// setiap tahap dinilai dengan tes tahap itu + tes regresi tahap sebelumnya.
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useAllProgress, useAttempts } from '../db'
import { grade, type Graded, type Lang, type Test } from '../run'
import { Editor } from '../Editor'
import { nodesOf } from '../data/curriculum'
import { trackById } from '../data/tracks'
import { ServerBanner, useServerStatus } from '../run/status'
import { Results, errKind, failMsg } from './Exercise'
import data from '../generated/meta/projects.json'
import { sfx } from '../sfx'

export type Stage = { title: string; prompt: string; hints: string[]; solution: string; after?: string; tests: Test[] }
export type Project = { id: string; title: string; track: string; lang: string; requires: string; emoji: string; story: string; starter: string; regression?: boolean; stages: Stage[] }
export const PROJECTS = data.projects as Project[]

const stageNode = (p: Project, k: number) => `${p.id}:${k}`
const withAfter = (code: string, after?: string) => (after ? `${code}\n${after}` : code)

// Tahap yang sudah lulus (indeks) per project.
export function useStagesDone() {
  const attempts = useAttempts()
  return new Set(attempts.filter(a => a.kind === 'project' && a.passed).map(a => a.node))
}

function requirement(p: Project, passed: string[] | undefined) {
  const node = nodesOf(p.track).find(n => n.id === p.requires)
  return { open: !!passed?.includes(p.requires), label: `Lulus "${node?.title ?? p.requires}" di ${trackById(p.track).emoji} ${trackById(p.track).name}` }
}

export default function Village() {
  const progress = useAllProgress()
  const done = useStagesDone()
  return (
    <div className="page">
      <h1>⚒️ Swordsmith Village</h1>
      <p className="muted">Desa para penempa. Bangun program sungguhan tahap demi tahap; setiap tahap diuji otomatis, dan tahap lama tidak boleh rusak.</p>
      <ul className="tracks">
        {PROJECTS.map(p => {
          const req = requirement(p, progress.find(x => x.track === p.track)?.passed)
          const n = p.stages.filter((_, k) => done.has(stageNode(p, k))).length
          const body = (
            <>
              <span className="emoji" aria-hidden>{p.emoji}</span>
              <span className="grow">
                <b>{n === p.stages.length && '✓ '}{p.title}</b>
                <small>{trackById(p.track).name} · {req.open ? `${n}/${p.stages.length} tahap` : `🔒 ${req.label}`}</small>
              </span>
            </>
          )
          return <li key={p.id}>{req.open ? <Link className="card track" to={`/desa/${p.id}`}>{body}</Link> : <div className="card track locked">{body}</div>}</li>
        })}
      </ul>
    </div>
  )
}

export function ProjectPage() {
  const { id = '' } = useParams()
  const p = PROJECTS.find(x => x.id === id)
  const progress = useAllProgress()
  const done = useStagesDone()
  const draft = useLiveQuery(() => db.kv.get(`proj:${id}`).then(r => (r?.value as string | undefined) ?? null), [id])
  const reached = p ? p.stages.findIndex((_, k) => !done.has(stageNode(p, k))) : -1
  const [pick, setPick] = useState<number | null>(null)
  if (!p) return <Navigate to="/desa" replace />
  const req = requirement(p, progress.find(x => x.track === p.track)?.passed)
  if (!req.open) return <div className="page"><h1>{p.emoji} {p.title}</h1><p className="muted">🔒 {req.label} dulu.</p><Link className="btn-primary" to={`/belajar/${p.track}`}>Ke Skill Tree</Link></div>
  if (draft === undefined) return null
  const all = reached === -1
  const k = pick ?? (all ? p.stages.length - 1 : reached)
  return (
    <div className="page">
      <h1>{p.emoji} {p.title}</h1>
      <p className="story">{p.story}</p>
      <ol className="stepper" aria-label="Tahap project">
        {p.stages.map((s, i) => {
          const ok = done.has(stageNode(p, i))
          const open = ok || i === reached
          return (
            <li key={i} className={`${ok ? 'pass' : ''} ${i === k ? 'current' : ''}`}>
              <button disabled={!open} aria-current={i === k ? 'step' : undefined} onClick={() => setPick(i)}>{ok ? '✓' : open ? i + 1 : '🔒'} {s.title}</button>
            </li>
          )
        })}
      </ol>
      {all && <p className="feedback">⚔️ Project tuntas! Pedangmu sudah ditempa. Kamu tetap bisa mengulang tahap mana pun.</p>}
      <StageView key={`${id}:${k}`} p={p} k={k} initial={draft ?? p.starter} passedBefore={done.has(stageNode(p, k))} onPin={() => setPick(k)} onNext={() => setPick(null)} />
    </div>
  )
}

function StageView({ p, k, initial, passedBefore, onPin, onNext }: { p: Project; k: number; initial: string; passedBefore: boolean; onPin: () => void; onNext: () => void }) {
  const st = p.stages[k]
  const lang = p.lang as Lang
  const server = useServerStatus(lang)
  const [code, setCode] = useState(initial)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState<Graded[] | null>(null)
  const [first, setFirst] = useState(false)
  const [hints, setHints] = useState(0)
  const [base, setBase] = useState({ code: initial, ver: 0 }) // isi awal editor; ver naik = editor dibuat ulang (Reset)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Draf disimpan otomatis (satu draf per project, terbawa ke tahap berikutnya).
  useEffect(() => {
    if (code === initial) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => db.kv.put({ key: `proj:${p.id}`, value: code }), 400)
    return () => clearTimeout(timer.current)
  }, [code, initial, p.id])
  function reset() {
    if (!window.confirm('Kembalikan ke kode awal project? Drafmu akan diganti.')) return
    setCode(p.starter)
    setBase(b => ({ code: p.starter, ver: b.ver + 1 }))
    db.kv.put({ key: `proj:${p.id}`, value: p.starter })
  }

  async function run() {
    onPin() // tetap di tahap ini walau lulus (tahap berikutnya terbuka, tapi user memilih kapan lanjut)
    setStatus('Menyiapkan runtime…')
    setResults(null)
    await db.kv.put({ key: `proj:${p.id}`, value: code })
    const onStart = () => setStatus('Menjalankan tes…')
    const r = await grade(lang, withAfter(code, st.after), st.tests, '', onStart)
    // Regresi: tes tahap sebelumnya ikut dijalankan (disembunyikan; gagal = ada fitur lama yang rusak).
    const prev = p.regression === false ? [] : p.stages.slice(0, k)
    for (const s of prev) r.push(...(await grade(lang, withAfter(code, s.after), s.tests.map(t => ({ ...t, hidden: true })), '', onStart)))
    setStatus('')
    setResults(r)
    const pass = r.every(x => x.pass)
    sfx(pass ? (k === p.stages.length - 1 ? 'fanfare' : 'win') : 'lose')
    const node = stageNode(p, k)
    await db.transaction('rw', db.attempts, async () => {
      if (pass) setFirst(!(await db.attempts.where('track').equals(p.track).filter(a => a.kind === 'project' && a.node === node && a.passed).count()))
      await db.attempts.add({ track: p.track, node, kind: 'project', date: new Date().toISOString(), correct: r.filter(x => x.pass).length, total: r.length, passed: pass, meta: { type: k === p.stages.length - 1 ? 'final' : 'stage', err: errKind(r), ...(pass ? {} : { msg: failMsg(r) }) } })
    })
  }

  const won = results?.every(x => x.pass)
  const last = k === p.stages.length - 1
  const sample = st.tests[0]
  return (
    <>
      <section className="card">
        <small className="muted">Tahap {k + 1}/{p.stages.length}{passedBefore && ' · ✓ sudah lulus'}</small>
        <h2>{st.title}</h2>
        <p className="prompt">{st.prompt}</p>
        {sample && (
          <div className="samples">
            <div>
              {sample.input && <><small>Contoh input</small><pre className="code">{sample.input.trimEnd()}</pre></>}
              <small>Contoh output</small><pre className="code">{sample.expected.trimEnd()}</pre>
            </div>
          </div>
        )}
        {st.after && <details><summary>Query pemeriksa (dijalankan setelah kodemu)</summary><pre className="code">{st.after.trimEnd()}</pre></details>}
      </section>
      <ServerBanner status={server} />
      <Editor key={base.ver} value={base.code} lang={lang} onChange={setCode} label={`Editor project ${p.title}`} />
      <div className="row-actions">
        <button className="btn-ghost" onClick={reset}>Reset</button>
        <button className="btn-primary" disabled={!!status || ['offline', 'checking', 'none'].includes(server)} onClick={run}>{status || 'Tempa! Jalankan tes'}</button>
      </div>
      {results && <Results results={results} predict={false} track={p.track} />}
      {results && k > 0 && p.regression !== false && <p className="muted small">Tes {st.tests.length + 1} dst. adalah tes regresi tahap sebelumnya.</p>}
      {won && (
        <section className="card win">
          <h2>{last ? 'Project tuntas!' : 'Tahap selesai!'}{first && <> +{last ? 140 : 40} XP · +{last ? 140 : 40} Koban</>}</h2>
          <details><summary>Bandingkan dengan solusi referensi</summary><pre className="code">{st.solution.trimEnd()}</pre></details>
          {last ? <Link className="btn-primary" to="/desa">Kembali ke desa</Link> : <button className="btn-primary" onClick={onNext}>Lanjut ke tahap {k + 2}</button>}
        </section>
      )}
      {!won && st.hints.length > 0 && (
        <section className="hints">
          {st.hints.slice(0, hints).map((h, i) => <p key={i} className="feedback"><b>Hint {i + 1}:</b> {h}</p>)}
          {hints < st.hints.length && <button className="btn-ghost" onClick={() => setHints(hints + 1)}>Minta hint ({hints + 1}/{st.hints.length}) · gratis</button>}
        </section>
      )}
    </>
  )
}
