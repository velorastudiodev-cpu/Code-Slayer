import { Link } from 'react-router-dom'
import { useAllProgress, useAttempts, useProfile } from '../db'
import { useCompanion, useEconomy } from '../wallet'
import { Avatar } from '../characters/rig'
import { currentIndex, nodesOf } from '../data/curriculum'
import { trackById } from '../data/tracks'
import { dayKey, missionStatus } from '../data/game'
import { Icon } from '../pixel'
import { useDueCount } from '../data/useCards'

const MISSION_LINK: Record<string, string> = {
  kata: '/game/kata', latihan3: '/latihan', bug2: '/latihan', castle5: '/game/castle', time8: '/game/time', rush10: '/game/rush', raid: '/game/raid', moon: '/belajar',
}

export default function Home() {
  const c = useCompanion()
  const profile = useProfile()
  const progress = useAllProgress()
  const attempts = useAttempts()
  const { streak } = useEconomy()
  const missions = missionStatus(dayKey(), attempts)
  const due = useDueCount()
  if (!profile) return null

  // Track pertama di jalur yang belum tuntas.
  const id = profile.path.find(id => { const p = progress.find(x => x.track === id); return !p || currentIndex(nodesOf(id), p.passed) !== -1 }) ?? profile.path[0]
  const t = trackById(id)
  const prog = progress.find(x => x.track === id)
  const nodes = nodesOf(id)
  const next = prog && nodes[currentIndex(nodes, prog.passed)]
  const [label, line] = !prog
    ? [`Final Selection: ${t.name}`, `Ujian pertamamu menanti di ${t.emoji} ${t.name}.`]
    : next ? [`Lanjut: ${next.title}`, `${t.emoji} ${t.name}, ${next.level}. Jangan kendur!`]
      : [`Buka ${t.name}`, 'Semua bab tuntas. Hashira Exam menantimu.']

  return (
    <div className="page">
      <h1 className="sr-only">Beranda</h1>
      <section className="hero">
        <Avatar c={c} expr="idle" size={128} />
        <div className="bubble">
          <small><Icon name="crow" size={24} /> Gagak Kasugai</small>
          <p>Kaa! {line}</p>
        </div>
      </section>
      <Link className="btn-primary" to={`/belajar/${id}`}>{label}</Link>
      <section className="card">
        <h2>Misi Harian {missions.every(m => m.done) && <span className="badge">tuntas</span>}</h2>
        <ul className="missions">
          {missions.map(m => (
            <li key={m.id} className={m.done ? 'done' : ''}>
              <Link to={MISSION_LINK[m.id]}>{m.done ? '✓' : '○'} {m.text}</Link>
              <span className="muted small">{m.value}/{m.target}</span>
            </li>
          ))}
        </ul>
        {missions.every(m => m.done) && <p className="muted small">Kaa! Semua misi hari ini tuntas. Sampai besok, Slayer.</p>}
        {due > 0 && <p className="small"><Link to="/mansion">🦋 {due} review jatuh tempo di Butterfly Mansion →</Link></p>}
      </section>
      <section className="card row">
        <h2>Streak</h2>
        <span className="streak"><b>{streak.current}</b> hari{streak.held > 0 && <small className="muted"> <Icon name="freeze" size={14} />×{streak.held}</small>}</span>
      </section>
    </div>
  )
}
