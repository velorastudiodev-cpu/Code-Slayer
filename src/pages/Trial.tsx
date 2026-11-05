// Hashira Trial (jalur olimpiade): gerbang rank Kinoe, tahapan OSN-K → IOI, latihan objektif, Topic Tracker,
// modul C++ untuk CP, dan Menuju CS/STEI ITB. Soal & kontes ada di TrialProblem.tsx.
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useAllProgress } from '../db'
import { shuffle } from '../data/content'
import { trackById } from '../data/tracks'
import { bestScore, readiness, topicStatus, trialGate, fmtTime, type Objective, type Olymp } from '../olymp/logic'

let cache: Promise<Olymp> | null = null
export function useOlymp() {
  const [o, setO] = useState<Olymp | null>(null)
  useEffect(() => { (cache ??= import('../generated/meta/olymp.json').then(m => m.default as unknown as Olymp)).then(setO) }, [])
  return o
}

// Skor terbaik per soal latihan (gaya IOI: terbaik per subtask lintas submisi).
export function useBest() {
  const subs = useLiveQuery(() => db.subs.toArray(), []) ?? []
  return useMemo(() => {
    const by = new Map<string, number[][]>()
    for (const s of subs) if (s.run === undefined) by.set(s.problem, [...(by.get(s.problem) ?? []), s.earned])
    return new Map([...by].map(([k, v]) => [k, bestScore(v).total]))
  }, [subs])
}
export function useAccepted() {
  const rows = useLiveQuery(() => db.kv.where('key').startsWith('arsip:').toArray(), []) ?? []
  return new Set(rows.map(r => r.key.slice(6)))
}

const Bar = ({ value, max, label }: { value: number; max: number; label: string }) => (
  <div className="bar" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemax={max}><i style={{ width: `${max ? (100 * value) / max : 0}%` }} /></div>
)

// Gerbang: terkunci sampai rank Kinoe (Python/C++) + DSA Fondasi; progres syarat terlihat.
export function TrialGate({ children }: { children: React.ReactNode }) {
  const progress = useAllProgress()
  const g = trialGate(progress)
  if (g.open) return <>{children}</>
  return (
    <div className="page">
      <h1>🏆 Hashira Trial <span className="badge">terkunci</span></h1>
      <p className="muted">Jalur olimpiade (OSN-K → IOI) dan persiapan masuk CS/STEI ITB. Hanya terbuka bagi slayer yang sudah mencapai rank tertinggi.</p>
      <section className="card">
        <h2>Syarat membuka</h2>
        <p><b>1.</b> Rank <b>Kinoe</b> di {trackById('python').emoji} Python <i>atau</i> {trackById('cpp').emoji} C++</p>
        <small className="muted">Python: rank {g.python + 1}/10</small><Bar value={g.python} max={9} label="Rank Python" />
        <small className="muted">C++: rank {g.cpp + 1}/10</small><Bar value={g.cpp} max={9} label="Rank C++" />
        <p><b>2.</b> Lulus semua bab Fondasi {trackById('dsa').emoji} DSA ({g.dsaDone}/{g.dsaTotal})</p>
        <Bar value={g.dsaDone} max={g.dsaTotal} label="Bab Fondasi DSA" />
        <div className="row-actions"><Link className="btn-primary" to="/belajar">Lanjut belajar</Link></div>
      </section>
    </div>
  )
}

export default function TrialHub() {
  const o = useOlymp()
  const best = useBest()
  const acc = useAccepted()
  if (!o) return <p className="muted">Memuat…</p>
  return (
    <TrialGate>
      <div className="page">
        <h1>🏆 Hashira Trial</h1>
        <p className="muted">Jalur olimpiade mengikuti jenjang resmi: Kabupaten → Provinsi → Nasional → Pelatnas → Internasional. Soal orisinal dinilai langsung dengan subtask; soal asli OSN/IOI dikerjakan di TLX TOKI dengan atribusi.</p>
        <ul className="tracks">
          {o.modules.stages.map(s => {
            const ps = o.problems.filter(p => p.stage === s.id)
            const ar = o.archive.problems.filter(a => a.stage === s.id)
            const obj = o.objective.filter(q => q.stage === s.id).length
            return (
              <li key={s.id}>
                <Link className="card track" to={`/olimpiade/tahap/${s.id}`}>
                  <span className="grow">
                    <b>{s.name} <small className="muted">({s.level})</small></b>
                    <small>{[ps.length && `${ps.filter(p => best.get(p.id) === 100).length}/${ps.length} soal orisinal`, ar.length && `${ar.filter(a => acc.has(a.id)).length}/${ar.length} soal asli`, obj && `${obj} soal objektif`].filter(Boolean).join(' · ')}</small>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="games">
          <Link className="card game-card" to="/olimpiade/kontes"><b>⏱️ Virtual Contest</b><small>{o.contests.length} simulasi ujian ber-timer</small></Link>
          <Link className="card game-card" to="/olimpiade/topik"><b>🗺️ Topic Tracker</b><small>Peta topik CP</small></Link>
          <Link className="card game-card" to="/olimpiade/cp"><b>⚙️ C++ untuk CP</b><small>STL, fast I/O, template</small></Link>
          <Link className="card game-card" to="/olimpiade/stei"><b>🎓 Menuju CS / STEI ITB</b><small>Diskrit, penalaran, readiness</small></Link>
        </div>
      </div>
    </TrialGate>
  )
}

export function TrialStage() {
  const { stage = '' } = useParams()
  const o = useOlymp()
  const best = useBest()
  const acc = useAccepted()
  if (!o) return null
  const s = o.modules.stages.find(x => x.id === stage)
  if (!s) return <Navigate to="/olimpiade" replace />
  const ps = o.problems.filter(p => p.stage === stage)
  const ar = [...o.archive.problems, ...o.archive.objective].filter(a => a.stage === stage)
  const obj = o.objective.filter(q => q.stage === stage)
  return (
    <TrialGate>
      <div className="page">
        <p><Link to="/olimpiade">← Hashira Trial</Link></p>
        <h1>{s.name} <small className="muted">{s.level}</small></h1>
        <p className="muted">{s.desc}</p>
        {obj.length > 0 && <Link className="btn-primary" to={`/olimpiade/objektif/${stage}`}>Latihan objektif ({obj.length} soal)</Link>}
        {ps.length > 0 && <ProblemList o={o} ids={ps.map(p => p.id)} best={best} title="Soal orisinal (dinilai di aplikasi)" />}
        {ar.length > 0 && <ArchiveList refs={ar} acc={acc} />}
      </div>
    </TrialGate>
  )
}

export function ProblemList({ o, ids, best, title }: { o: Olymp; ids: string[]; best: Map<string, number>; title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul className="tracks">
        {ids.map(id => o.problems.find(p => p.id === id)!).map(p => (
          <li key={p.id}>
            <Link className="card track" to={`/olimpiade/soal/${p.id}`}>
              <span className="grow"><b>{p.title}</b><small>{p.topics.join(', ')} · {p.subtasks.length} subtask</small></span>
              <span className={`score ${best.get(p.id) === 100 ? 'full' : ''}`}>{best.get(p.id) ?? '–'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ArchiveList({ refs, acc }: { refs: Olymp['archive']['problems']; acc: Set<string> }) {
  async function mark(id: string, on: boolean) {
    if (!on) return db.kv.delete(`arsip:${id}`)
    await db.transaction('rw', db.kv, db.attempts, async () => {
      await db.kv.put({ key: `arsip:${id}`, value: new Date().toISOString() })
      await db.attempts.add({ track: 'olymp', node: id, kind: 'arsip', date: new Date().toISOString(), correct: 1, total: 1, passed: true })
    })
  }
  const years = [...new Set(refs.map(r => r.source))]
  return (
    <section>
      <h2>Soal asli (arsip resmi)</h2>
      <p className="muted small">Soal milik TOKI/IOI, dikerjakan dan dinilai di <b>TLX TOKI</b>. Ringkasan ditulis ulang; baca soal lengkapnya di tautan, kirim jawabanmu di sana, lalu tandai <i>Accepted</i> di sini.</p>
      {years.map(y => (
        <details key={y} className="chapter">
          <summary>{y} <span className="muted">({refs.filter(r => r.source === y && acc.has(r.id)).length}/{refs.filter(r => r.source === y).length})</span></summary>
          <ul className="plain arsip">
            {refs.filter(r => r.source === y).map(r => (
              <li key={r.id} className="card">
                <b>{acc.has(r.id) && '✓ '}{r.title}</b> {r.tags?.map(t => <span key={t} className="badge">{t}</span>)}
                <p className="small">{r.summary}</p>
                <div className="row-actions">
                  <a className="btn-ghost" href={r.link} target="_blank" rel="noopener noreferrer">Buka di TLX ↗</a>
                  <button className="btn-ghost" aria-pressed={acc.has(r.id)} onClick={() => mark(r.id, !acc.has(r.id))}>{acc.has(r.id) ? '✓ Accepted' : 'Tandai Accepted'}</button>
                </div>
                <small className="muted">Sumber: {r.source} · {r.link.replace('https://', '')}</small>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  )
}

// ---- Latihan objektif: satu soal per layar, pembahasan langkah demi langkah setelah menjawab. ?menit=N → mode ber-timer.
export function TrialObjective() {
  const { key = '' } = useParams()
  const [q] = useSearchParams()
  const minutes = Number(q.get('menit') ?? 0)
  const o = useOlymp()
  if (!o) return null
  const pool = o.objective.filter(x => x.stage === key || x.topic === key)
  if (!pool.length) return <Navigate to="/olimpiade" replace />
  const title = { kabupaten: 'Objektif OSN-K', provinsi: 'Objektif OSN-P', diskrit: 'Matematika Diskrit', penalaran: 'Penalaran Matematika & Logika' }[key] ?? key
  return <TrialGate><ObjectiveSession key={key + minutes} pool={pool} count={10} minutes={minutes} title={title} back={key === 'diskrit' || key === 'penalaran' ? '/olimpiade/stei' : `/olimpiade/tahap/${key}`} /></TrialGate>
}

function ObjectiveSession({ pool, count, minutes, title, back }: { pool: Objective[]; count: number; minutes: number; title: string; back: string }) {
  const [qs] = useState(() => shuffle(pool).slice(0, count))
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [right, setRight] = useState(0)
  const [end] = useState(() => (minutes ? Date.now() + minutes * 60_000 : 0))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!end) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [end])
  const timeUp = end > 0 && now >= end
  const cur = qs[i]
  const opts = useMemo(() => (cur ? shuffle(cur.options) : []), [cur])
  async function answer(a: string) {
    if (picked !== null || timeUp) return
    setPicked(a)
    const ok = a === cur.options[0]
    if (ok) setRight(r => r + 1)
    await db.obj.add({ q: cur.id, topic: cur.topic, correct: ok, date: new Date().toISOString() })
  }
  if (i >= qs.length || timeUp)
    return (
      <div className="page">
        <h1>{title}: selesai</h1>
        <p className="score-big">{right}/{qs.length} benar</p>
        {timeUp && <p className="muted">Waktu habis.</p>}
        <div className="row-actions"><Link className="btn-primary" to={back}>Kembali</Link></div>
      </div>
    )
  return (
    <div className="page">
      <p><Link to={back}>← Kembali</Link></p>
      <small className="muted">{title} · soal {i + 1}/{qs.length} · {cur.topic}{end > 0 && <> · ⏱️ <b className="timer">{fmtTime(end - now)}</b></>}</small>
      <p className="prompt">{cur.prompt}</p>
      {cur.code && <pre className="code">{cur.code}</pre>}
      <div className="choices">
        {opts.map(t => (
          <button key={t} className="opt" disabled={picked !== null} data-state={picked === null ? undefined : t === cur.options[0] ? 'right' : t === picked ? 'wrong' : undefined} onClick={() => answer(t)}>{t}</button>
        ))}
      </div>
      {picked !== null && (
        <section className="card">
          <p className={`feedback ${picked === cur.options[0] ? '' : 'wrong'}`}><b>{picked === cur.options[0] ? 'Tepat!' : `Belum tepat. Jawaban: ${cur.options[0]}`}</b></p>
          <p><b>Pembahasan:</b> {cur.explain}</p>
          <button className="btn-primary" onClick={() => { setPicked(null); setI(i + 1) }}>{i + 1 < qs.length ? 'Soal berikutnya' : 'Lihat hasil'}</button>
        </section>
      )}
    </div>
  )
}

// ---- Topic Tracker
export function TrialTopics() {
  const o = useOlymp()
  const best = useBest()
  const acc = useAccepted()
  if (!o) return null
  const ts = topicStatus(o, best, acc)
  const rec = ts.find(t => !t.mastered && t.next)
  return (
    <TrialGate>
      <div className="page">
        <p><Link to="/olimpiade">← Hashira Trial</Link></p>
        <h1>🗺️ Topic Tracker</h1>
        <p className="muted">Topik dianggap dikuasai bila semua soal orisinalnya mendapat skor 100.</p>
        {rec && <Link className="btn-primary" to={`/olimpiade/soal/${rec.next}`}>Rekomendasi berikutnya: {o.problems.find(p => p.id === rec.next)!.title} ({rec.name})</Link>}
        <ul className="plain topics">
          {ts.map(t => (
            <li key={t.id} className="card">
              <b>{t.mastered ? '✓ ' : ''}{t.name}</b> <small className="muted">{t.full}/{t.total}</small>
              <Bar value={t.full} max={t.total} label={t.name} />
              {!t.mastered && t.next && <Link className="small" to={`/olimpiade/soal/${t.next}`}>Latih: {o.problems.find(p => p.id === t.next)!.title} →</Link>}
            </li>
          ))}
        </ul>
      </div>
    </TrialGate>
  )
}

// ---- C++ untuk CP
export function TrialCp() {
  const o = useOlymp()
  const best = useBest()
  if (!o) return null
  return (
    <TrialGate>
      <div className="page">
        <p><Link to="/olimpiade">← Hashira Trial</Link></p>
        <h1>⚙️ C++ untuk CP</h1>
        {o.modules.cp_lessons.map(l => (
          <section key={l.title} className="card">
            <h2>{l.title}</h2>
            <p>{l.text}</p>
            {l.code && <pre className="code">{l.code.trimEnd()}</pre>}
          </section>
        ))}
        <ProblemList o={o} ids={o.problems.filter(p => p.stage === 'cp').map(p => p.id)} best={best} title="Latihan" />
      </div>
    </TrialGate>
  )
}

// ---- Menuju CS / STEI ITB
const FORMULAS: [string, (p: boolean, q: boolean, r: boolean) => boolean][] = [
  ['p ∧ q', (p, q) => p && q], ['p ∨ q', (p, q) => p || q], ['p → q', (p, q) => !p || q], ['p ↔ q', (p, q) => p === q],
  ['¬(p ∧ q)', (p, q) => !(p && q)], ['¬p ∨ ¬q', (p, q) => !p || !q], ['(p → q) ∧ (q → r)', (p, q, r) => (!p || q) && (!q || r)], ['p → r', (p, _q, r) => !p || r],
]
function TruthLab() {
  const [v, setV] = useState({ p: true, q: false, r: true })
  return (
    <section className="card">
      <h2>Lab Logika Proposisi</h2>
      <p className="muted small">Ubah nilai p, q, r dan perhatikan: ¬(p ∧ q) selalu sama dengan ¬p ∨ ¬q (De Morgan), dan bila (p → q) ∧ (q → r) benar maka p → r juga benar (silogisme).</p>
      <div className="row-actions">
        {(['p', 'q', 'r'] as const).map(k => <button key={k} className="btn-ghost" aria-pressed={v[k]} onClick={() => setV({ ...v, [k]: !v[k] })}>{k} = {v[k] ? 'B' : 'S'}</button>)}
      </div>
      <table className="compare"><tbody>{FORMULAS.map(([f, fn]) => <tr key={f}><td>{f}</td><td><b>{fn(v.p, v.q, v.r) ? 'Benar' : 'Salah'}</b></td></tr>)}</tbody></table>
    </section>
  )
}
function Pascal() {
  const [n, setN] = useState(6)
  const rows = Array.from({ length: n + 1 }, (_, i) => { const r = [1]; for (let k = 1; k <= i; k++) r.push((r[k - 1] * (i - k + 1)) / k); return r })
  return (
    <section className="card">
      <h2>Segitiga Pascal & C(n, r)</h2>
      <label className="check">n = <input type="range" min={1} max={12} value={n} onChange={e => setN(+e.target.value)} /> <code>{n}</code></label>
      <pre className="code pascal">{rows.map(r => r.join(' ')).join('\n')}</pre>
      <p className="muted small">Baris n berisi C(n, 0) … C(n, n). Setiap angka = jumlah dua angka di atasnya: C(n, r) = C(n−1, r−1) + C(n−1, r). Jumlah satu baris = 2^n = {2 ** n}.</p>
    </section>
  )
}

export function TrialStei() {
  const o = useOlymp()
  const best = useBest()
  const ans = useLiveQuery(() => db.obj.toArray(), []) ?? []
  if (!o) return null
  const rate = (f: (t: string) => boolean) => { const xs = ans.filter(a => f(a.topic)).slice(-50); return xs.length ? Math.round((100 * xs.filter(a => a.correct).length) / xs.length) : 0 }
  const graded = o.problems.filter(p => p.stage !== 'cp')
  const parts = {
    objektif: rate(t => ['aritmetika', 'logika', 'algoritmika', 'kombinatorika', 'penalaran'].includes(t)),
    problem: Math.round(graded.reduce((s, p) => s + (best.get(p.id) ?? 0), 0) / graded.length),
    diskrit: rate(t => t === 'diskrit'),
  }
  const r = readiness(o.modules.stei.readiness.weights, parts)
  return (
    <TrialGate>
      <div className="page">
        <p><Link to="/olimpiade">← Hashira Trial</Link></p>
        <h1>🎓 Menuju CS / STEI ITB</h1>
        <section className="card">
          <h2>Readiness Meter: {r.total}/100 <span className="badge">{r.label}</span></h2>
          <Bar value={r.total} max={100} label="Kesiapan" />
          <p className="muted small">Objektif {parts.objektif}% (50 jawaban terakhir) · Problem solving {parts.problem}% (rata-rata skor terbaik soal orisinal) · Diskrit {parts.diskrit}%.</p>
        </section>
        <div className="games">
          <Link className="card game-card" to="/olimpiade/objektif/diskrit"><b>Matematika Diskrit</b><small>Himpunan, relasi, graf, modular, sarang merpati</small></Link>
          <Link className="card game-card" to="/olimpiade/objektif/penalaran?menit=15"><b>Penalaran ber-timer</b><small>10 soal · 15 menit</small></Link>
        </div>
        <TruthLab />
        <Pascal />
        <section className="card">
          <h2>Roadmap prestasi</h2>
          <ol>{o.modules.stei.roadmap.map(s => <li key={s.title}><b>{s.title}.</b> {s.text}</li>)}</ol>
          <p className="feedback">⚠️ {o.modules.stei.disclaimer}</p>
        </section>
      </div>
    </TrialGate>
  )
}
