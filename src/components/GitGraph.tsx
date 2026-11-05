import { useEffect, useState } from 'react'
import type { Snapshot } from '../term/git'

// Graf commit: satu baris per commit (terbaru di atas), satu lajur per jalur paralel.
function layout(s: Snapshot) {
  const lanes: (string | null)[] = []
  const rows = s.commits.map(c => {
    let lane = lanes.indexOf(c.id)
    if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) lane = lanes.length; lanes[lane] = c.id }
    // Bersihkan lajur lain yang juga menunggu commit ini (cabang yang bertemu).
    for (let i = 0; i < lanes.length; i++) if (i !== lane && lanes[i] === c.id) lanes[i] = null
    lanes[lane] = c.parents[0] ?? null
    for (const p of c.parents.slice(1)) if (!lanes.includes(p)) { const free = lanes.indexOf(null); if (free < 0) lanes.push(p); else lanes[free] = p }
    return { ...c, lane }
  })
  const pos = new Map(rows.map((r, i) => [r.id, { x: r.lane, y: i }]))
  return { rows, pos, width: Math.max(1, ...rows.map(r => r.lane + 1)) }
}

const COLORS = ['var(--accent)', '#e2452c', '#3b8fd1', '#e8a90f', '#9b6fd1', '#2f8f5b']

export function GitGraph({ snap }: { snap: Snapshot }) {
  if (!snap.commits.length) return <p className="muted small">Belum ada commit.</p>
  const { rows, pos, width } = layout(snap)
  const X = (l: number) => 14 + l * 22, Y = (i: number) => 16 + i * 30
  const labels = (id: string) => [
    ...Object.entries(snap.branches).filter(([, v]) => v === id).map(([b]) => (snap.head.ref === b ? `HEAD → ${b}` : b)),
    ...(snap.head.id === id ? ['HEAD'] : []),
    ...Object.entries(snap.tags).filter(([, v]) => v === id).map(([t]) => `tag: ${t}`),
  ]
  const w = X(width) + 8
  return (
    <div className="gitgraph" role="img" aria-label={`Graf commit: ${rows.map(r => r.msg).join(', ')}`}>
      <svg width={w} height={Y(rows.length - 1) + 16} className="gg-lines">
        {rows.flatMap(r => r.parents.map(p => {
          const a = pos.get(r.id)!, b = pos.get(p)
          if (!b) return null
          return <path key={r.id + p} d={`M${X(a.x)},${Y(a.y)} C${X(a.x)},${Y(a.y) + 15} ${X(b.x)},${Y(b.y) - 15} ${X(b.x)},${Y(b.y)}`} stroke={COLORS[Math.max(a.x, b.x) % COLORS.length]} />
        }))}
        {rows.map((r, i) => <rect key={r.id} x={X(r.lane) - 5} y={Y(i) - 5} width={10} height={10} fill={r.parents.length > 1 ? 'var(--card)' : COLORS[r.lane % COLORS.length]} stroke={COLORS[r.lane % COLORS.length]} strokeWidth={2} />)}
      </svg>
      <ol className="gg-rows">
        {rows.map(r => (
          <li key={r.id} style={{ height: 30 }}>
            <code>{r.id.slice(0, 7)}</code> {labels(r.id).map(l => <span key={l} className={`badge ${l.startsWith('HEAD') ? '' : 'ref'}`}>{l}</span>)} {r.msg}
          </li>
        ))}
      </ol>
    </div>
  )
}

// Jalankan skrip di terminal simulasi (main thread) lalu ambil potret repo di direktori terakhir.
export function useGitSnapshot(script: string | null) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    if (script === null) return
    let alive = true
    ;(async () => {
      const [{ Shell }, { snapshot }] = await Promise.all([import('../term/shell.ts'), import('../term/git.ts')])
      const sh = new Shell({ maxSteps: 20000 })
      await sh.run(script)
      if (alive) setSnap(snapshot(sh.fs, sh.cwd))
    })()
    return () => { alive = false }
  }, [script])
  return snap
}
