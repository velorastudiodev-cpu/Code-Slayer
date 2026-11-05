import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ALGOS, GRAPH, type ArrFrame, type Frame, type GraphFrame, type ListFrame } from '../data/visual'
import { nodesOf } from '../data/curriculum'

// Posisi simpul graf contoh (viewBox 100×60).
const POS = [[10, 30], [30, 12], [30, 48], [52, 6], [55, 30], [52, 54], [78, 16], [80, 44]]

function Bars({ f }: { f: ArrFrame }) {
  const max = Math.max(...f.arr, 1)
  const ptrAt = (i: number) => Object.entries(f.ptr).filter(([, v]) => v === i).map(([k]) => k).join(',')
  return (
    <div className="bars" role="img" aria-label={`Array: ${f.arr.join(', ')}`}>
      {f.arr.map((v, i) => (
        <div key={i} className={`bar-col ${f.mark[i] ?? ''}`}>
          <div className="bar-fill" style={{ height: `${(v / max) * 100}%` }} />
          <span className="val">{v}</span>
          <span className="ptr">{ptrAt(i)}</span>
        </div>
      ))}
    </div>
  )
}

function HeapTree({ f }: { f: ArrFrame }) {
  const at = (i: number) => { const d = Math.floor(Math.log2(i + 1)), k = i + 1 - 2 ** d; return [((k + 0.5) / 2 ** d) * 100, 10 + d * 18] }
  return (
    <svg viewBox="0 0 100 70" className="tree" role="img" aria-label="Pohon heap">
      {f.arr.map((_, i) => i > 0 && <line key={'e' + i} x1={at(i)[0]} y1={at(i)[1]} x2={at((i - 1) >> 1)[0]} y2={at((i - 1) >> 1)[1]} />)}
      {f.arr.map((v, i) => (
        <g key={i} className={f.mark[i] ?? ''}>
          <rect x={at(i)[0] - 5} y={at(i)[1] - 5} width="10" height="10" />
          <text x={at(i)[0]} y={at(i)[1] + 2.5}>{v}</text>
        </g>
      ))}
    </svg>
  )
}

function ListView({ f }: { f: ListFrame }) {
  return (
    <div className={`listview ${f.style}`}>
      {f.style === 'queue' && <small className="muted">depan →</small>}
      {f.style === 'linked' && <small className="muted">head →</small>}
      {f.items.map((v, i) => (
        <span key={i} className="node-wrap">
          <span className={`box ${f.mark[i] ?? ''}`}>{v}</span>
          {f.style === 'linked' && <span className="arrow">→</span>}
        </span>
      ))}
      {f.style === 'linked' && <small className="muted">null</small>}
      {f.style === 'stack' && <small className="muted">← top</small>}
      {!f.items.length && <small className="muted">(kosong)</small>}
    </div>
  )
}

function GraphView({ f }: { f: GraphFrame }) {
  const state = (u: number) => (u === f.current ? 'win' : f.visited.includes(u) ? 'done' : f.frontier.includes(u) ? 'hit' : '')
  return (
    <svg viewBox="0 0 100 60" className="graph" role="img" aria-label={`Graf, dikunjungi: ${f.visited.join(', ')}`}>
      {GRAPH.flatMap((ns, u) => ns.filter(v => v > u).map(v => <line key={`${u}-${v}`} x1={POS[u][0]} y1={POS[u][1]} x2={POS[v][0]} y2={POS[v][1]} />))}
      {POS.map(([x, y], u) => (
        <g key={u} className={state(u)}>
          <rect x={x - 4} y={y - 4} width="8" height="8" />
          <text x={x} y={y + 2}>{u}</text>
        </g>
      ))}
    </svg>
  )
}

function View({ f }: { f: Frame }) {
  if (f.kind === 'graph') return <GraphView f={f} />
  if (f.kind === 'list') return <ListView f={f} />
  return <>{f.kind === 'heap' && <HeapTree f={f} />}<Bars f={f} /></>
}

export default function Visual() {
  const { algo = '' } = useParams()
  const a = ALGOS.find(x => x.id === algo)
  const [seed, setSeed] = useState(7)
  const [i, setI] = useState(0)
  const [play, setPlay] = useState(false)
  const [speed, setSpeed] = useState(700)
  const frames = useMemo(() => a?.frames(seed) ?? [], [a, seed])
  useEffect(() => { setI(0); setPlay(false) }, [algo, seed])
  useEffect(() => {
    if (!play) return
    if (i >= frames.length - 1) return setPlay(false)
    const t = setTimeout(() => setI(i + 1), speed)
    return () => clearTimeout(t)
  }, [play, i, frames.length, speed])

  const dsa = nodesOf('dsa')
  if (!a)
    return (
      <div className="page">
        <h1>Visualizer DSA</h1>
        <p className="muted">Tonton struktur data dan algoritma bekerja langkah demi langkah.</p>
        <ul className="tracks">
          {ALGOS.map(x => (
            <li key={x.id}><Link className="card track" to={`/visual/${x.id}`}><span className="grow"><b>{x.name}</b><small>{dsa.find(n => n.id === x.chapter)?.title}</small></span></Link></li>
          ))}
        </ul>
      </div>
    )
  const f = frames[i]
  return (
    <div className="page">
      <header>
        <small className="muted"><Link to="/visual">Visualizer</Link></small>
        <h1>{a.name}</h1>
      </header>
      <section className="card visual">
        <View f={f} />
        <p className="vnote" aria-live="polite">{f.note}</p>
      </section>
      <div className="dbg-controls">
        <button onClick={() => setI(Math.max(0, i - 1))} aria-label="Mundur">◀</button>
        <button onClick={() => setPlay(!play)} aria-label={play ? 'Jeda' : 'Putar'}>{play ? '⏸' : '▶'}</button>
        <button onClick={() => setI(Math.min(frames.length - 1, i + 1))} aria-label="Maju">▶|</button>
        <span className="muted small">{i + 1}/{frames.length}</span>
        <button onClick={() => setSeed(s => s + 1)} aria-label="Input acak baru">🎲</button>
      </div>
      <label className="check">Kecepatan
        <input type="range" min={150} max={1500} step={50} value={1650 - speed} onChange={e => setSpeed(1650 - +e.target.value)} />
      </label>
      <Link className="btn-ghost" to={`/belajar/dsa/bab/${a.chapter}`}>Pelajari babnya →</Link>
    </div>
  )
}
