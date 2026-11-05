import { Link } from 'react-router-dom'
import { useAllProgress, useProfile } from '../db'
import { RANKS, chapterCount, nodesOf, rankOf } from '../data/curriculum'
import { TRACKS, trackById } from '../data/tracks'
import { NeedsNet } from '../run/status'

function TrackRow({ id, passed }: { id: string; passed?: string[] }) {
  const t = trackById(id)
  const nodes = nodesOf(id)
  const done = passed ? nodes.filter(n => !n.boss && passed.includes(n.id)).length : 0
  return (
    <li>
      <Link className="card track" to={`/belajar/${id}`} style={{ '--c': t.color } as React.CSSProperties}>
        <span className="emoji" aria-hidden>{t.emoji}</span>
        <span className="grow">
          <b>{t.name}</b> {t.server && <NeedsNet />}
          <small>{passed ? `${RANKS[rankOf(nodes, passed)]} · ${done}/${chapterCount(nodes)} bab` : 'Belum mulai'}</small>
          {passed && <span className="bar thin"><i style={{ width: `${(done / chapterCount(nodes)) * 100}%` }} /></span>}
        </span>
      </Link>
    </li>
  )
}

export default function Learn() {
  const profile = useProfile()
  const progress = useAllProgress()
  const passedOf = (id: string) => progress.find(p => p.track === id)?.passed
  const path = profile?.path ?? []
  return (
    <div className="page">
      <div className="row"><h1>Jalurmu</h1><Link to="/jalur" className="btn-ghost">Ubah jalur</Link></div>
      <Link className="card link" to="/visual">☀️ Visualizer DSA: sort, search, stack, heap, BFS/DFS →</Link>
      <ul className="tracks">{path.map(id => <TrackRow key={id} id={id} passed={passedOf(id)} />)}</ul>
      <h2>Pernapasan lain</h2>
      <ul className="tracks">{TRACKS.filter(t => !path.includes(t.id)).map(t => <TrackRow key={t.id} id={t.id} passed={passedOf(t.id)} />)}</ul>
    </div>
  )
}
