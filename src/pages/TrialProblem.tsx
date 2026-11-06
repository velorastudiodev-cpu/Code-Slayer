// Hashira Trial: halaman soal (juri subtask gaya IOI, editorial bertingkat) dan Virtual Contest (timer, skor, medali, ranking pribadi).
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ContestRun } from '../db'
import { Editor } from '../Editor'
import { ServerBanner, useServerStatus } from '../run/status'
import type { Lang } from '../run'
import { judge, CPP_TEMPLATE, PY_TEMPLATE, type Judged } from '../olymp/judge'
import { bestScore, fmtTime, medal, objectiveScore, pickObjective, type Contest, type Olymp, type Problem } from '../olymp/logic'
import { TrialGate, useOlymp } from './Trial'
import { sfx } from '../sfx'

const PY_STAGES = ['kabupaten', 'provinsi']
const MEDAL = { emas: '🥇 Emas', perak: '🥈 Perak', perunggu: '🥉 Perunggu' } as const

export default function TrialProblemPage() {
  const { id = '' } = useParams()
  const o = useOlymp()
  if (!o) return null
  const p = o.problems.find(x => x.id === id)
  if (!p) return <Navigate to="/olimpiade" replace />
  return (
    <TrialGate>
      <div className="page">
        <p><Link to={p.stage === 'cp' ? '/olimpiade/cp' : `/olimpiade/tahap/${p.stage}`}>← Kembali</Link></p>
        <ProblemView key={p.id} p={p} />
      </div>
    </TrialGate>
  )
}

function useSubs(problem: string, run?: number) {
  return useLiveQuery(() => db.subs.where('problem').equals(problem).filter(s => s.run === run).toArray(), [problem, run]) ?? []
}

export function ProblemView({ p, run, closed }: { p: Problem; run?: number; closed?: boolean }) {
  const [lang, setLang] = useState<Lang>('cpp')
  const draftKey = `od:${p.id}:${lang}`
  const draft = useLiveQuery(() => db.kv.get(draftKey).then(r => (r?.value as string | undefined) ?? null), [draftKey])
  const subs = useSubs(p.id, run)
  const best = bestScore(subs.map(s => s.earned))
  const [code, setCode] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [res, setRes] = useState<Judged | null>(null)
  const [edLevel, setEdLevel] = useState(0)
  const server = useServerStatus(lang, false)
  useEffect(() => { setCode(null) }, [lang])
  if (draft === undefined) return null
  const initial = draft ?? (lang === 'cpp' ? CPP_TEMPLATE : PY_TEMPLATE)
  const current = code ?? initial

  async function submit() {
    setStatus('Menyiapkan…'); setRes(null)
    await db.kv.put({ key: draftKey, value: current })
    const r = await judge(p, lang, current, setStatus)
    setStatus(''); setRes(r)
    sfx(r.score === 100 ? 'fanfare' : r.score > 0 ? 'win' : 'lose')
    await db.transaction('rw', db.subs, db.attempts, async () => {
      await db.subs.add({ problem: p.id, run, date: new Date().toISOString(), lang, code: current, earned: r.earned, score: r.score })
      if (run === undefined && r.score === 100) await db.attempts.add({ track: 'olymp', node: p.id, kind: 'olymp', date: new Date().toISOString(), correct: 100, total: 100, passed: true })
    })
  }

  return (
    <article className="problem">
      <h1>{p.title} <span className={`score ${best.total === 100 ? 'full' : ''}`}>{best.total}</span></h1>
      <small className="muted">Batas waktu {p.tl / 1000} detik · {p.topics.join(', ')} · {PY_STAGES.includes(p.stage) ? 'C++ atau Python' : 'C++ (standar kompetisi)'}</small>
      <section className="statement">
        <p className="prompt">{p.statement.trim()}</p>
        <h2>Format masukan</h2><p>{p.input.trim()}</p>
        <h2>Format keluaran</h2><p>{p.output.trim()}</p>
        {p.constraints && <><h2>Batasan</h2><p>{p.constraints.trim()}</p></>}
        <div className="samples">
          {p.samples.map((s, i) => (
            <div key={i}><small>Contoh masukan {i + 1}</small><pre className="code">{s.input.trimEnd()}</pre><small>Contoh keluaran {i + 1}</small><pre className="code">{s.expected.trimEnd()}</pre></div>
          ))}
        </div>
        <h2>Subtask</h2>
        <table className="compare subtasks">
          <thead><tr><th>#</th><th>Batasan</th><th>Poin</th><th>Terbaik</th></tr></thead>
          <tbody>{p.subtasks.map((s, i) => <tr key={i} className={best.per[i] ? 'current' : ''}><td>{i + 1}</td><td>{s.desc}</td><td>{s.points}</td><td>{best.per[i] ?? 0}</td></tr>)}</tbody>
        </table>
      </section>
      {!closed && (
        <>
          {PY_STAGES.includes(p.stage) && (
            <div className="seg" role="radiogroup" aria-label="Bahasa">
              {(['cpp', 'python'] as const).map(l => <button key={l} role="radio" aria-checked={lang === l} onClick={() => setLang(l)}>{l === 'cpp' ? 'C++' : 'Python'}</button>)}
            </div>
          )}
          {lang === 'cpp' && <ServerBanner status={server} />}
          <Editor key={`${p.id}:${lang}`} value={initial} lang={lang} onChange={setCode} label={`Editor ${p.title}`} />
          <div className="row-actions">
            <button className="btn-primary" disabled={!!status || (lang === 'cpp' && (['offline', 'checking', 'none'].includes(server)))} onClick={submit}>{status || 'Kirim ke juri'}</button>
          </div>
        </>
      )}
      {closed && <p className="feedback">Waktu kontes habis: submisi ditutup.</p>}
      {res && <JudgeResult r={res} />}
      {run === undefined && <Editorial p={p} level={edLevel} setLevel={setEdLevel} tried={subs.length > 0} />}
      {subs.length > 0 && (
        <details className="card">
          <summary>Riwayat submisi ({subs.length})</summary>
          <ol className="plain">{[...subs].reverse().map(s => <li key={s.id}><b>{s.score}</b> poin · {s.lang === 'cpp' ? 'C++' : 'Python'} · {new Date(s.date).toLocaleString('id-ID')} <small className="muted">[{s.earned.join(' / ')}]</small></li>)}</ol>
        </details>
      )}
    </article>
  )
}

function JudgeResult({ r }: { r: Judged }) {
  const bad = r.samples.find(s => s.verdict !== 'AC')
  const err = [...r.samples, ...r.subtasks.flatMap(s => s.tests)].find(t => t.verdict === 'CE' || t.verdict === 'RE')
  return (
    <section className="results" aria-live="polite">
      <h2>Skor {r.score}/100</h2>
      <p className="verdicts">Contoh: {r.samples.map((s, i) => <span key={i} className={`v v-${s.verdict}`}>{s.verdict}</span>)}</p>
      {bad && bad.verdict === 'WA' && (
        <div className="diff"><div><small>Diharapkan</small><pre>{bad.expected.trimEnd()}</pre></div><div><small>Output kodemu</small><pre>{bad.run.stdout.trimEnd() || '(kosong)'}</pre></div></div>
      )}
      <ol className="plain">
        {r.subtasks.map((s, i) => (
          <li key={i} className={s.earned ? 'pass' : 'fail'}>
            <b>Subtask {i + 1}: {s.earned}/{s.points}</b> {s.tests.map((t, j) => <span key={j} className={`v v-${t.verdict}`} title={`Tes ${j + 1}`}>{t.verdict}</span>)}
          </li>
        ))}
      </ol>
      <p className="muted small">AC = benar · WA = jawaban salah · TLE = melebihi batas waktu · RE = runtime error · CE = gagal kompilasi. Data uji tersembunyi.</p>
      {err && <pre className="stderr">{err.run.stderr.trimEnd().slice(0, 1500)}</pre>}
    </section>
  )
}

// Editorial bertingkat: hint → ide kunci → solusi lengkap + kompleksitas.
function Editorial({ p, level, setLevel, tried }: { p: Problem; level: number; setLevel: (n: number) => void; tried: boolean }) {
  const steps = [['Hint', p.editorial.hint], ['Ide kunci', p.editorial.idea], ['Solusi', `${p.editorial.solution} Kompleksitas: ${p.editorial.complexity}.`]] as const
  return (
    <section className="card editorial">
      <h2>Editorial bertingkat</h2>
      {steps.slice(0, level).map(([t, x]) => <p key={t}><b>{t}:</b> {x}</p>)}
      {level >= 3 && <details><summary>Kode solusi referensi (C++)</summary><pre className="code">{p.solution.trimEnd()}</pre></details>}
      {level < 3 && (
        <button className="btn-ghost" disabled={level === 2 && !tried} onClick={() => setLevel(level + 1)}>
          Buka {steps[level][0].toLowerCase()}{level === 2 && !tried ? ' (kirim minimal sekali dulu)' : ''}
        </button>
      )}
    </section>
  )
}

// ---------------- Virtual Contest ----------------
export function ContestList() {
  const o = useOlymp()
  const runs = useLiveQuery(() => db.runs.toArray(), []) ?? []
  const nav = useNavigate()
  if (!o) return null
  async function start(c: Contest) {
    const id = await db.runs.add({ contest: c.id, start: new Date().toISOString(), seed: Math.floor(Math.random() * 2 ** 31) })
    nav(`/olimpiade/kontes/${c.id}/${id}`)
  }
  return (
    <TrialGate>
      <div className="page">
        <p><Link to="/olimpiade">← Hashira Trial</Link></p>
        <h1>⏱️ Virtual Contest</h1>
        <p className="muted">Simulasi ujian dengan durasi format kompetisinya. Ambang medali di sini adalah aproksimasi (persentase skor maksimum), bukan batas resmi tahun tertentu.</p>
        {o.contests.map(c => {
          const mine = runs.filter(r => r.contest === c.id)
          const active = mine.find(r => !r.end && Date.now() < Date.parse(r.start) + c.minutes * 60_000)
          const done = mine.filter(r => r.end).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          const top = done[0]
          const m = top && medal(c, top.score ?? 0, top.max ?? 1)
          return (
            <section key={c.id} className="card contest">
              <h2>{c.name}</h2>
              <p className="muted small">{c.kind === 'objective' ? `${c.count} soal objektif` : `${c.problems!.length} soal pemrograman dengan subtask`} · {Math.floor(c.minutes / 60) ? `${Math.floor(c.minutes / 60)} jam ` : ''}{c.minutes % 60 ? `${c.minutes % 60} menit` : ''} · medali ≥ {c.medals.perunggu}% / {c.medals.perak}% / {c.medals.emas}%</p>
              {c.note && <p className="small">{c.note}</p>}
              {top && <p>Rekor pribadi: <b>{top.score}/{top.max}</b> {m && MEDAL[m]} · {done.length}× dicoba</p>}
              <div className="row-actions">
                {active ? <Link className="btn-primary" to={`/olimpiade/kontes/${c.id}/${active.id}`}>Lanjutkan (berjalan)</Link> : <button className="btn-primary" onClick={() => start(c)}>Mulai simulasi</button>}
                {c.real && <a className="btn-ghost" href={c.real} target="_blank" rel="noopener noreferrer">Kontes asli di TLX ↗</a>}
              </div>
            </section>
          )
        })}
      </div>
    </TrialGate>
  )
}

export function ContestSession() {
  const { id = '', run = '' } = useParams()
  const o = useOlymp()
  const r = useLiveQuery(() => db.runs.get(Number(run)), [run])
  if (!o || r === undefined) return null
  const c = o.contests.find(x => x.id === id)
  if (!c || !r || r.contest !== id) return <Navigate to="/olimpiade/kontes" replace />
  return <TrialGate><Session o={o} c={c} r={r} /></TrialGate>
}

function Session({ o, c, r }: { o: Olymp; c: Contest; r: ContestRun }) {
  const deadline = Date.parse(r.start) + c.minutes * 60_000
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const subs = useLiveQuery(() => db.subs.where('run').equals(r.id!).toArray(), [r.id]) ?? []
  const qs = useMemo(() => (c.kind === 'objective' ? pickObjective(o.objective, c, r.seed) : []), [o, c, r.seed])
  const probs = (c.problems ?? []).map(id => o.problems.find(p => p.id === id)!)
  const [tab, setTab] = useState(0)
  const over = !!r.end || now >= deadline

  const result = useMemo(() => {
    if (c.kind === 'objective') return objectiveScore(c, qs, r.answers ?? {})
    const per = probs.map(p => bestScore(subs.filter(s => s.problem === p.id).map(s => s.earned)).total)
    return { score: per.reduce((a, b) => a + b, 0), max: probs.length * 100, per }
  }, [c, qs, r.answers, subs, probs])

  // Tutup sesi (tombol Selesai atau waktu habis): simpan skor & medali sekali.
  useEffect(() => {
    if (!over || r.end) return
    void finish()
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps
  async function finish() {
    const fresh = await db.runs.get(r.id!)
    if (!fresh || fresh.end) return
    const m = medal(c, result.score, result.max)
    await db.transaction('rw', db.runs, db.attempts, async () => {
      await db.runs.update(r.id!, { end: new Date().toISOString(), score: result.score, max: result.max })
      await db.attempts.add({ track: 'olymp', node: c.id, kind: 'contest', date: new Date().toISOString(), correct: Math.max(0, result.score), total: result.max, passed: !!m, meta: m ? { type: m } : undefined })
    })
  }
  async function answer(q: string, a: string) { await db.runs.update(r.id!, { answers: { ...(r.answers ?? {}), [q]: a } }) }

  if (r.end) return <ContestResult o={o} c={c} r={r} qs={qs} probs={probs} per={'per' in result ? result.per : undefined} />
  return (
    <div className="page contest-run">
      <header className="contest-bar">
        <b>{c.name}</b>
        <span className="timer" aria-live="off">⏱️ {fmtTime(deadline - now)}</span>
        <span>Skor {c.kind === 'objective' ? `${Object.keys(r.answers ?? {}).length}/${qs.length} dijawab` : `${result.score}/${result.max}`}</span>
        <button className="btn-ghost" onClick={() => { if (window.confirm('Akhiri simulasi sekarang?')) void finish() }}>Selesai</button>
      </header>
      {c.kind === 'objective' ? (
        <ol className="objective-list">
          {qs.map(q => (
            <li key={q.id} className="card">
              <p>{q.prompt}</p>
              {q.code && <pre className="code">{q.code}</pre>}
              <div className="choices">
                {[...q.options].sort().map(t => <button key={t} className="opt" aria-pressed={r.answers?.[q.id] === t} disabled={over} onClick={() => answer(q.id, t)}>{t}</button>)}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <div className="seg" role="tablist">{probs.map((p, i) => <button key={p.id} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}>{String.fromCharCode(65 + i)}. {p.title} ({'per' in result ? result.per[i] : 0})</button>)}</div>
          <ProblemView key={probs[tab].id} p={probs[tab]} run={r.id} closed={over} />
        </>
      )}
    </div>
  )
}

function ContestResult({ o, c, r, qs, probs, per }: { o: Olymp; c: Contest; r: ContestRun; qs: ReturnType<typeof pickObjective>; probs: Problem[]; per?: number[] }) {
  const all = useLiveQuery(() => db.runs.where('contest').equals(c.id).filter(x => !!x.end).toArray(), [c.id]) ?? []
  const ranked = [...all].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.start.localeCompare(b.start))
  const rank = ranked.findIndex(x => x.id === r.id) + 1
  const m = medal(c, r.score ?? 0, r.max ?? 1)
  const used = Math.min(c.minutes * 60_000, Date.parse(r.end!) - Date.parse(r.start))
  return (
    <div className="page">
      <p><Link to="/olimpiade/kontes">← Virtual Contest</Link></p>
      <h1>{c.name}: selesai</h1>
      <p className="score-big">{r.score}/{r.max} {m ? MEDAL[m] : <span className="muted">tanpa medali</span>}</p>
      <p className="muted">Waktu terpakai {fmtTime(used)} dari {fmtTime(c.minutes * 60_000)} · peringkat pribadi #{rank} dari {ranked.length} percobaan.</p>
      {per && <table className="compare"><tbody>{probs.map((p, i) => <tr key={p.id}><td>{String.fromCharCode(65 + i)}. <Link to={`/olimpiade/soal/${p.id}`}>{p.title}</Link></td><td>{per[i]}/100</td></tr>)}</tbody></table>}
      {c.kind === 'objective' && (
        <ol className="plain">
          {qs.map(q => { const a = r.answers?.[q.id]; return (
            <li key={q.id} className={`card ${a === q.options[0] ? 'pass' : 'fail'}`}>
              <p>{q.prompt}</p>{q.code && <pre className="code">{q.code}</pre>}
              <p className="small">Jawabanmu: <b>{a ?? '(kosong)'}</b> · Kunci: <b>{q.options[0]}</b></p>
              <p className="small muted">{q.explain}</p>
            </li>) })}
        </ol>
      )}
      <section className="card">
        <h2>Ranking pribadi</h2>
        <ol>{ranked.slice(0, 10).map(x => <li key={x.id} className={x.id === r.id ? 'current' : ''}>{x.score}/{x.max} · {new Date(x.start).toLocaleDateString('id-ID')}</li>)}</ol>
      </section>
      {c.real && <a className="btn-ghost" href={c.real} target="_blank" rel="noopener noreferrer">Coba kontes aslinya di TLX ↗</a>}
      <p className="muted small">Soal: {o.problems.length} orisinal tersedia untuk latihan setelah kontes.</p>
    </div>
  )
}
