import { Link, Navigate, useParams } from 'react-router-dom'
import { db, useAttempts, useProfile, useProgress } from '../db'
import { examItems, hasBank, useBank, useTrackContent } from '../data/content'
import { LEVELS, RANKS, chapterCount, currentIndex, nodesOf, rankOf } from '../data/curriculum'
import { TRACKS } from '../data/tracks'
import { pace } from '../engine'
import { Icon } from '../pixel'
import { NeedsNet } from '../run/status'

const fmt = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export default function Track() {
  const { track = '' } = useParams()
  const t = TRACKS.find(x => x.id === track)
  const prog = useProgress(track)
  const profile = useProfile()
  const attempts = useAttempts(track)
  const bank = useBank(track)
  const content = useTrackContent(track)
  if (!t) return <Navigate to="/belajar" replace />
  if (prog === undefined || profile === undefined) return null

  const nodes = nodesOf(track)
  const passed = prog?.passed ?? []
  const cur = prog ? currentIndex(nodes, passed) : -2
  const rank = rankOf(nodes, passed)
  const remaining = chapterCount(nodes) - nodes.filter(n => !n.boss && passed.includes(n.id)).length
  const p = pace(remaining, profile?.minutesPerDay ?? 30, attempts)

  return (
    <div className="page" style={{ '--c': t.color } as React.CSSProperties}>
      <header>
        <h1>{t.emoji} {t.name} {t.server && <NeedsNet />}</h1>
        <p className="muted">{t.breath === '—' ? '' : `${t.breath} Breathing · `}Mentor {t.mentor}</p>
      </header>

      <section className="card">
        <div className="row"><h2>Rank: {RANKS[rank]}</h2><span className="muted">{rank + 1}/10</span></div>
        <div className="bar"><i style={{ width: `${(rank + 1) * 10}%` }} /></div>
        {prog && (
          <p className="muted small">
            Perkiraan sampai Kinoe: <b>{fmt(p.eta)}</b> ({p.measured ? 'dari laju nyatamu' : `dari target ${profile?.minutesPerDay ?? 30} mnt/hari`}).
            Hari ini: {p.newMin} mnt materi baru · {p.reviewMin} mnt review.
          </p>
        )}
      </section>

      {!prog && (
        <section className="card">
          <h2>Final Selection</h2>
          <p className="muted">Ujian adaptif ±8 soal untuk menentukan bab awalmu. Bab yang sudah kamu kuasai otomatis dilewati.</p>
          <div className="row-actions">
            <button className="btn-ghost" onClick={() => db.progress.put({ track, passed: [] })}>Mulai dari Bab 1</button>
            {hasBank(track)
              ? <Link className="btn-primary" to={`/belajar/${track}/seleksi`}>Ikut Final Selection</Link>
              : <span className="muted small">Soal seleksi track ini datang bersama kontennya.</span>}
          </div>
        </section>
      )}

      {LEVELS.map(level => (
        <section key={level}>
          <h2 className="level">{level}</h2>
          <ol className="tree">
            {nodes.map((n, i) => n.level === level && (
              <li key={n.id} className={`node ${n.boss ? 'boss' : ''} ${passed.includes(n.id) ? 'done' : i === cur ? 'current' : 'locked'}`}>
                <span className="tile"><Icon name={passed.includes(n.id) ? 'check' : n.boss ? 'moon' : i === cur ? 'sword' : 'lock'} size={20} /></span>
                {passed.includes(n.id) || i === cur
                  ? n.boss ? <span className="title">{n.title}</span> : <Link className="title" to={`/belajar/${track}/bab/${n.id}`}>{n.title}</Link>
                  : <span className="title">{n.title}</span>}
                {i === cur && !n.boss && <Link className="btn-primary small" to={`/belajar/${track}/bab/${n.id}`}>Buka bab</Link>}
                {i === cur && n.boss && (bank && content && examItems(track, n.id, bank, content).length
                  ? <Link className="btn-primary small" to={`/belajar/${track}/ujian/${n.id}`}>Lawan Upper Moon</Link>
                  : <span className="muted small">Upper Moon level ini datang bersama kontennya.</span>)}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <ol className="tree">
        <li className={`node boss ${cur === -1 ? 'current' : 'locked'}`}>
          <span className="tile"><Icon name="moon" size={20} /></span>
          <span className="title">Hashira Exam</span>
          {cur === -1 && <span className="muted small">Dibuka di milestone berikutnya.</span>}
        </li>
      </ol>
    </div>
  )
}
