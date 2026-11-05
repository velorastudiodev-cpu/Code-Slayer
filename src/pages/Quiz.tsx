import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db, useProgress } from '../db'
import { useCompanion } from '../wallet'
import { Avatar, Chibi, type Expr } from '../characters/rig'
import { demonById } from '../characters/demons'
import { examItems, shuffle, useBank, useTrackContent, type Mcq } from '../data/content'
import { Task } from './Exercise'
import { canTakeExam, nodesOf, passedFromPlacement, placeable } from '../data/curriculum'
import { trackById } from '../data/tracks'
import { answer, probe, startPlacement } from '../engine'

const PASS = 0.75

function Question({ q, onPick, onNext }: { q: Mcq; onPick: (ok: boolean) => void; onNext: (ok: boolean) => void }) {
  const opts = useMemo(() => shuffle(q.options.map((t, i) => ({ t, ok: i === 0 }))), [q])
  const [pick, setPick] = useState<number | null>(null)
  const ok = pick !== null && opts[pick].ok
  return (
    <section className="question">
      <p className="prompt">{q.prompt}</p>
      {q.code && <pre className="code">{q.code.trimEnd()}</pre>}
      <div className="choices">
        {opts.map((o, i) => (
          <button key={i} className="opt" disabled={pick !== null}
            data-state={pick === null ? undefined : o.ok ? 'right' : i === pick ? 'wrong' : undefined}
            onClick={() => { setPick(i); onPick(o.ok) }}>
            <code>{o.t}</code>
          </button>
        ))}
      </div>
      {pick !== null && (
        <>
          <p className={`feedback ${ok ? 'right' : 'wrong'}`} role="status">
            <b>{ok ? 'Tebasan tepat!' : 'Meleset.'}</b> {q.explain}
          </p>
          <button className="btn-primary" autoFocus onClick={() => onNext(ok)}>Lanjut</button>
        </>
      )}
    </section>
  )
}

// Iblis lawan ujian: Lower Moon = Rui/Enmu, Upper Moon per level, Muzan di level terakhir.
const UPPER: Record<string, string> = { 'f-boss': 'akaza', 'm-boss': 'doma', 'l-boss': 'kokushibo', 'p-boss': 'muzan' }
export const examDemon = (node: string) => demonById(UPPER[node] ?? ([...node].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 2 ? 'rui' : 'enmu'))

function Frame({ title, sub, expr, children, demon }: { title: string; sub: string; expr: Expr; children: React.ReactNode; demon?: string }) {
  const c = useCompanion()
  return (
    <div className="page">
      <section className="hero">
        <Avatar c={c} expr={expr} size={96} />
        <div className="grow"><h1>{title}</h1><p className="muted">{sub}</p></div>
        {demon && <Chibi c={examDemon(demon)} expr={expr === 'victory' ? 'encourage' : expr === 'encourage' ? 'victory' : 'idle'} size={72} />}
      </section>
      {children}
    </div>
  )
}

const Bar = ({ value }: { value: number }) => <div className="bar" role="progressbar" aria-valuenow={Math.round(value * 100)}><i style={{ width: `${value * 100}%` }} /></div>

export function Placement() {
  const { track = '' } = useParams()
  const bank = useBank(track)
  const nodes = nodesOf(track)
  const chs = placeable(nodes)
  const [p, setP] = useState(() => startPlacement(chs.length))
  const [asked, setAsked] = useState<string[]>([])
  const [mood, setMood] = useState<Expr>('focus')
  const t = trackById(track)
  const mid = probe(p)

  if (!bank) return null
  if (mid === null) {
    const start = nodes.find(n => !passedFromPlacement(nodes, p.lo).includes(n.id))!
    return (
      <Frame title="Final Selection selesai" sub={`${t.emoji} ${t.name}`} expr={p.lo > 0 ? 'victory' : 'encourage'}>
        <section className="card">
          <p>Kamu lulus seleksi! {p.lo > 0 ? `${p.lo} bab sudah kamu kuasai.` : 'Kita mulai dari dasar, pelan tapi pasti.'}</p>
          <p>Mulai di: <b>{start.title}</b> ({start.level})</p>
        </section>
        <Link className="btn-primary" to={`/belajar/${track}`}>Lihat Skill Tree</Link>
      </Frame>
    )
  }

  const pool = bank.filter(q => q.chapter === chs[mid].id)
  const q = pool.find(q => !asked.includes(q.id))!
  const next = (ok: boolean) => {
    const np = answer(p, ok, Math.min(2, pool.length))
    if (probe(np) === null) {
      db.transaction('rw', db.progress, db.attempts, () => {
        db.progress.put({ track, passed: passedFromPlacement(nodes, np.lo) })
        db.attempts.add({ track, node: 'placement', kind: 'placement', date: new Date().toISOString(), correct: np.lo, total: chs.length, passed: true })
      })
    }
    setAsked([...asked, q.id])
    setMood('focus')
    setP(np)
  }
  return (
    <Frame title="Final Selection" sub={`${t.emoji} ${t.name} · soal ${asked.length + 1}, maks ±8`} expr={mood}>
      <Bar value={Math.min(asked.length / 8, 1)} />
      <Question key={q.id} q={q} onPick={ok => setMood(ok ? 'happy' : 'encourage')} onNext={next} />
    </Frame>
  )
}

export function Exam() {
  const { track = '', node = '' } = useParams()
  const bank = useBank(track)
  const content = useTrackContent(track)
  const prog = useProgress(track)
  const nodes = nodesOf(track)
  const n = nodes.find(x => x.id === node)
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [mood, setMood] = useState<Expr>('focus')
  const items = useMemo(() => (bank && content ? examItems(track, node, bank, content) : []), [bank, content, track, node])

  if (!bank || !content || prog === undefined) return null
  const title = n?.boss ? n.title : `Lower Moon: ${n?.title}`
  const done = items.length > 0 && i === items.length
  if (done) {
    const ok = correct / items.length >= PASS
    return (
      <Frame title={ok ? 'Iblis tertebas!' : 'Belum tertebas'} sub={title} expr={ok ? 'victory' : 'encourage'} demon={node}>
        <section className="card">
          <p>Skor <b>{correct}/{items.length}</b> (lulus ≥ {PASS * 100}%).</p>
          <p className="muted">{ok ? 'Node berikutnya terbuka.' : 'Ulangi kapan saja. Kesalahan adalah guru.'}</p>
        </section>
        <Link className="btn-primary" to={`/belajar/${track}`}>Kembali ke Skill Tree</Link>
      </Frame>
    )
  }
  // Gerbang progres: hanya node berikutnya yang bisa diuji.
  if (!n || !prog || !canTakeExam(nodes, prog.passed, n.id))
    return <Frame title="Terkunci" sub="Selesaikan node sebelumnya dulu." expr="encourage"><Link className="btn-primary" to={`/belajar/${track}`}>Kembali</Link></Frame>
  if (!items.length)
    return <Frame title={title} sub="Soal ujian bab ini datang bersama kontennya." expr="encourage"><Link className="btn-primary" to={`/belajar/${track}`}>Kembali</Link></Frame>

  const next = (ok: boolean) => {
    const c = correct + (ok ? 1 : 0)
    if (i + 1 === items.length) {
      const passed = c / items.length >= PASS
      db.transaction('rw', db.progress, db.attempts, async () => {
        const cur = await db.progress.get(track)
        if (passed && cur && canTakeExam(nodes, cur.passed, n.id)) await db.progress.put({ track, passed: [...cur.passed, n.id] })
        await db.attempts.add({ track, node: n.id, kind: 'exam', date: new Date().toISOString(), correct: c, total: items.length, passed })
      })
    }
    setCorrect(c)
    setAnswered(null)
    setMood('focus')
    setI(i + 1)
  }
  const item = items[i]
  return (
    <Frame title={title} sub={`Soal ${i + 1} dari ${items.length} · melawan ${examDemon(node).name}`} expr={mood} demon={node}>
      <Bar value={i / items.length} />
      {'mcq' in item
        ? <Question key={item.mcq.id} q={item.mcq} onPick={ok => setMood(ok ? 'happy' : 'encourage')} onNext={next} />
        : (
          <>
            <Task key={item.ex.id} ex={item.ex} once onMood={setMood} onResult={r => { const ok = r.every(x => x.pass); setAnswered(ok); setMood(ok ? 'happy' : 'encourage') }} />
            {answered !== null && <button className="btn-primary" onClick={() => next(answered)}>Lanjut</button>}
          </>
        )}
    </Frame>
  )
}
