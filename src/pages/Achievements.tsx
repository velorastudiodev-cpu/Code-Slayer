import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../pixel'
import { TIER_KOBAN, TIER_NAME } from '../data/achievements'
import { useEconomy } from '../wallet'

export default function Achievements() {
  const { ach, achKoban } = useEconomy()
  const [filter, setFilter] = useState<'all' | 'done' | 'todo'>('all')
  const done = ach.filter(a => a.done).length
  const marks = ach.filter(a => a.tier === 4)
  const list = ach.filter(a => a.tier !== 4 && (filter === 'all' || (filter === 'done') === a.done)).sort((a, b) => +b.done - +a.done)
  return (
    <div className="page">
      <small className="muted"><Link to="/profil">← Profil</Link></small>
      <h1>Pencapaian</h1>
      <p className="muted"><b>{done}</b>/{ach.length} terbuka · total hadiah <b>{achKoban}</b> Koban</p>
      <section className="card marks">
        <h2><Icon name="mark" size={24} /> Demon Slayer Mark</h2>
        <ul className="ach-list">
          {marks.map(a => (
            <li key={a.id} className={a.done ? 'done' : ''}>
              <Icon name={a.done ? 'mark' : 'lock'} size={22} />
              <div className="grow"><b>{a.name}</b><small>{a.desc}</small>
                {!a.done && a.target > 1 && <div className="bar thin"><i style={{ width: `${(a.current / a.target) * 100}%` }} /></div>}
              </div>
              <small>{a.done ? '✓' : `${a.current}/${a.target}`}</small>
            </li>
          ))}
        </ul>
      </section>
      <div className="seg" role="radiogroup" aria-label="Saring">
        {([['all', 'Semua'], ['done', 'Terbuka'], ['todo', 'Belum']] as const).map(([v, l]) => (
          <button key={v} role="radio" aria-checked={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <ul className="ach-list card">
        {list.map(a => (
          <li key={a.id} className={a.done ? 'done' : ''}>
            <Icon name={a.done ? 'medal' : 'lock'} size={22} />
            <div className="grow">
              <b>{a.name}</b>
              <small>{a.desc} · {TIER_NAME[a.tier]} +{TIER_KOBAN[a.tier]}</small>
              {!a.done && a.target > 1 && <div className="bar thin"><i style={{ width: `${(a.current / a.target) * 100}%` }} /></div>}
            </div>
            <small>{a.done ? '✓' : `${a.current}/${a.target}`}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}
