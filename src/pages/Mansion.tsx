// Butterfly Mansion: review berjadwal (FSRS) + Mistake Journal + Rehab Quest.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db, useAttempts, type Card } from '../db'
import { useCards } from '../data/useCards'
import { dueCards, mistakes, ratingOf, review } from '../data/srs'
import { allExercises, loadTrack, useTrackContent, TYPE_LABEL, type Exercise } from '../data/content'
import { trackById } from '../data/tracks'
import { Avatar } from '../characters/rig'
import { useCompanion } from '../wallet'
import type { Graded } from '../run'
import { Task } from './Exercise'

const ERR: Record<string, string> = { syntax: 'salah sintaks', error: 'error saat jalan', wrong: 'output salah', timeout: 'waktu habis', segfault: 'segfault' }
const fmtDue = (iso: string) => {
  const d = Math.ceil((Date.parse(iso) - Date.now()) / 864e5)
  return d <= 0 ? 'hari ini' : d === 1 ? 'besok' : `${d} hari lagi`
}

// Judul soal lintas track (muat JSON track yang dibutuhkan saja).
function useExercises(tracks: string[]) {
  const [map, setMap] = useState(new Map<string, Exercise>())
  const key = [...new Set(tracks)].sort().join()
  useEffect(() => {
    Promise.all(key.split(',').filter(Boolean).map(t => loadTrack(t).then(c => allExercises(c, t)))).then(l => setMap(new Map(l.flat().map(e => [e.id, e]))))
  }, [key])
  return map
}

export default function Mansion() {
  const cards = useCards() ?? []
  const attempts = useAttempts()
  const [tab, setTab] = useState<'review' | 'journal'>('review')
  const due = dueCards(cards)
  const journal = mistakes(attempts)
  const open = journal.filter(m => !m.fixed)
  const rehab = cards.filter(c => c.source === 'mistake')
  const ex = useExercises([...journal.map(m => m.track), ...cards.map(c => c.track)])
  const upcoming = [...cards].filter(c => !due.includes(c)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5)
  return (
    <div className="page">
      <h1>🦋 Butterfly Mansion</h1>
      <p className="muted">Tempat memulihkan diri. Soal yang pernah kamu kerjakan kembali sesuai jadwal pengulangan berjarak (FSRS) supaya tidak lupa; kesalahan lama dirawat di Rehab Quest.</p>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>Review ({due.length})</button>
        <button role="tab" aria-selected={tab === 'journal'} onClick={() => setTab('journal')}>Mistake Journal ({open.length})</button>
      </div>
      {tab === 'review' && (
        <>
          <section className="card">
            <h2>{due.length ? `${due.length} kartu jatuh tempo` : 'Tidak ada yang jatuh tempo'}</h2>
            <p className="muted small">{cards.length} kartu tersimpan · {rehab.length} dari kesalahan. Nilai review otomatis: lulus langsung = Good, lulus setelah gagal/hint = Hard, menyerah = Again.</p>
            {due.length > 0 ? <Link className="btn-primary" to="/mansion/sesi/review">Mulai review</Link> : <p className="muted">Kaa! Semua ingatan masih segar. Kembali lagi nanti.</p>}
          </section>
          <section className="card">
            <h2>Rehab Quest</h2>
            <p className="muted small">Ulangi soal-soal yang pernah membuatmu gagal, tanpa menunggu jadwal. {open.length} kesalahan belum diperbaiki.</p>
            <Link className={rehab.length ? 'btn-primary' : 'btn-ghost'} aria-disabled={!rehab.length} to={rehab.length ? '/mansion/sesi/rehab' : '#'}>Mulai Rehab Quest</Link>
          </section>
          {upcoming.length > 0 && (
            <section className="card">
              <h2>Jadwal berikutnya</h2>
              <ul className="plain">{upcoming.map(c => <li key={c.id}>{trackById(c.track).emoji} {ex.get(c.id)?.title ?? c.id} <span className="muted small">· {fmtDue(c.due)}</span></li>)}</ul>
            </section>
          )}
        </>
      )}
      {tab === 'journal' && (
        <section>
          {!journal.length && <p className="muted">Belum ada kesalahan tercatat. Setiap soal yang gagal akan masuk ke sini bersama pesan error-nya.</p>}
          <ul className="tracks">
            {journal.map(m => {
              const e = ex.get(m.id)
              return (
                <li key={m.id}>
                  <Link className="card track" to={`/latihan/${m.track}/${m.id}`}>
                    <span className="emoji" aria-hidden>{trackById(m.track).emoji}</span>
                    <span className="grow">
                      <b>{m.fixed ? '✓ ' : ''}{e?.title ?? m.id}</b>
                      <small>{e && `${TYPE_LABEL[e.type]} · `}gagal {m.fails}×{m.err && ` · ${ERR[m.err] ?? m.err}`} · {m.fixed ? 'sudah diperbaiki' : 'belum diperbaiki'}</small>
                      {m.msg && <code className="small">{m.msg}</code>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

// Sesi review/rehab: antrean dibekukan saat sesi dimulai.
export function MansionSession() {
  const { mode = 'review' } = useParams()
  const cards = useCards()
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!cards || queue) return
    setQueue(mode === 'rehab' ? cards.filter(c => c.source === 'mistake').sort((a, b) => b.lapses - a.lapses || a.due.localeCompare(b.due)).slice(0, 10) : dueCards(cards).slice(0, 20))
  }, [cards, queue, mode])
  if (!queue) return null
  const title = mode === 'rehab' ? 'Rehab Quest' : 'Review'
  if (i >= queue.length)
    return (
      <div className="page">
        <h1>🦋 {title} selesai</h1>
        <p>{queue.length ? `${queue.length} kartu dirawat. Shinobu tersenyum puas.` : 'Tidak ada kartu untuk sesi ini.'}</p>
        <Link className="btn-primary" to="/mansion">Kembali ke Mansion</Link>
      </div>
    )
  return <ReviewCard key={queue[i].id} card={queue[i]} n={i + 1} total={queue.length} title={title} onNext={() => setI(i + 1)} />
}

function ReviewCard({ card, n, total, title, onNext }: { card: Card; n: number; total: number; title: string; onNext: () => void }) {
  const c = useCompanion()
  const content = useTrackContent(card.track)
  const [fails, setFails] = useState(0)
  const [hints, setHints] = useState(0)
  const [done, setDone] = useState<null | { passed: boolean; next: string }>(null)
  if (!content) return null
  const ex = allExercises(content, card.track).find(e => e.id === card.id)
  async function rate(passed: boolean) {
    const g = ratingOf({ passed, failedRuns: fails, hints, difficulty: ex?.difficulty ?? 2 })
    const next = review(card, g)
    await db.transaction('rw', db.cards, db.attempts, async () => {
      await db.cards.put(next)
      await db.attempts.add({ track: card.track, node: card.id, kind: 'review', date: new Date().toISOString(), correct: passed ? 1 : 0, total: 1, passed, meta: { type: card.source } })
    })
    setDone({ passed, next: next.due })
  }
  function onResult(r: Graded[]) {
    if (done) return
    if (r.every(x => x.pass)) rate(true)
    else setFails(f => f + 1)
  }
  if (!ex) {
    // Soal sudah tidak ada di konten (diganti/dihapus): buang kartunya.
    return <div className="page"><p className="muted">Soal {card.id} tidak ditemukan lagi.</p><button className="btn-primary" onClick={() => db.cards.delete(card.id).then(onNext)}>Lewati</button></div>
  }
  return (
    <div className="page">
      <section className="hero">
        <Avatar c={c} expr={done ? (done.passed ? 'victory' : 'encourage') : 'focus'} size={80} />
        <div>
          <small className="muted">🦋 {title} {n}/{total} · {card.source === 'mistake' ? 'pernah gagal' : 'pengingat'} · {trackById(card.track).emoji} {TYPE_LABEL[ex.type]}</small>
          <h1>{ex.title}</h1>
        </div>
      </section>
      <Task ex={ex} onResult={onResult} />
      {!done && (
        <section className="hints">
          {ex.hints.slice(0, hints).map((h, k) => <p key={k} className="feedback"><b>Hint {k + 1}:</b> {h}</p>)}
          <div className="row-actions">
            {hints < ex.hints.length && <button className="btn-ghost" onClick={() => setHints(hints + 1)}>Hint ({hints + 1}/{ex.hints.length}) · gratis, nilai jadi Hard</button>}
            <button className="btn-ghost" onClick={() => rate(false)}>Menyerah (Again)</button>
          </div>
        </section>
      )}
      {done && (
        <section className={`card ${done.passed ? 'win' : ''}`}>
          <h2>{done.passed ? 'Pulih!' : 'Tidak apa-apa. Kartu ini akan kembali lebih cepat.'}</h2>
          {!done.passed && ex.solutions[0] && <details open><summary>Solusi referensi</summary><pre className="code">{ex.solutions[0].trimEnd()}</pre></details>}
          <p className="muted small">Muncul lagi {fmtDue(done.next)}.</p>
          <button className="btn-primary" onClick={onNext}>{n < total ? 'Kartu berikutnya' : 'Selesai'}</button>
        </section>
      )}
    </div>
  )
}
