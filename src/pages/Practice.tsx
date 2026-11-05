import { Link } from 'react-router-dom'
import { useAllProgress, useAttempts } from '../db'
import { TYPE_LABEL, exerciseTracks, useTrackContent } from '../data/content'
import { isOpen, nodesOf } from '../data/curriculum'
import { trackById } from '../data/tracks'
import { dayKey, kataDone, raidBoss, weekKey } from '../data/game'
import { useDueCount } from '../data/useCards'

// Latihan per track yang sudah dimulai; hanya bab yang terbuka (sudah lulus atau bab berikutnya).
function TrackExercises({ track, passed, solved }: { track: string; passed: string[]; solved: Set<string> }) {
  const content = useTrackContent(track)
  const t = trackById(track)
  const nodes = nodesOf(track)
  const open = nodes.filter(n => !n.boss && isOpen(nodes, passed, n.id) && content?.chapters[n.id]?.exercises.length)
  return (
    <section style={{ '--c': t.color } as React.CSSProperties}>
      <h2>{t.emoji} {t.name}</h2>
      {!open.length && <p className="muted">Belum ada bab terbuka dengan latihan.</p>}
      {open.map(n => {
        const list = content!.chapters[n.id].exercises
        return (
          <details key={n.id} className="chapter" open={!passed.includes(n.id)}>
            <summary>{n.title} <span className="muted">({list.filter(e => solved.has(e.id)).length}/{list.length})</span></summary>
            <ul className="tracks">
              {list.map(ex => (
                <li key={ex.id}>
                  <Link className="card track" to={`/latihan/${track}/${ex.id}`}>
                    <span className="grow"><b>{solved.has(ex.id) && '✓ '}{ex.title}</b><small>{TYPE_LABEL[ex.type]} · {'★'.repeat(ex.difficulty)}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )
      })}
    </section>
  )
}

export default function Practice() {
  const attempts = useAttempts()
  const solved = new Set(attempts.filter(a => a.kind === 'exercise' && a.passed).map(a => a.node))
  const best = (k: string) => Math.max(0, ...attempts.filter(a => a.kind === k).map(a => a.correct))
  const progress = useAllProgress()
  const started = exerciseTracks.filter(t => progress.some(p => p.track === t))
  const due = useDueCount()
  const forged = new Set(attempts.filter(a => a.kind === 'project' && a.passed && a.meta?.type === 'final').map(a => a.node.split(':')[0])).size
  return (
    <div className="page">
      <h1>Latihan</h1>
      <h2>Mode Game</h2>
      <div className="games">
        <Link className="card game-card" to="/game/kata"><b>Daily Kata</b><small>{kataDone(attempts, dayKey()) ? '✓ selesai hari ini' : '1 soal kode hari ini'}</small></Link>
        <Link className="card game-card" to="/game/castle"><b>Infinity Castle</b><small>Rekor lantai {best('castle')}</small></Link>
        <Link className="card game-card" to="/game/raid"><b>Boss Raid</b><small>{raidBoss(weekKey()).name} minggu ini</small></Link>
        <Link className="card game-card" to="/game/time"><b>Time Attack</b><small>Rekor {best('timeattack')} benar</small></Link>
        <Link className="card game-card" to="/game/rush"><b>Bug Rush</b><small>Rekor skor {best('bugrush')}</small></Link>
      </div>
      <h2>Desa, Mansion & Hashira Trial</h2>
      <div className="games">
        <Link className="card game-card" to="/desa"><b>⚒️ Swordsmith Village</b><small>Project bertahap · {forged} tuntas</small></Link>
        <Link className="card game-card" to="/olimpiade"><b>🏆 Hashira Trial</b><small>Jalur olimpiade OSN → IOI</small></Link>
        <Link className="card game-card" to="/ctf"><b>🏴 CTF Arena</b><small>Lab sandbox: web, crypto, forensics</small></Link>
        <Link className="card game-card" to="/terminal"><b>🐗 Terminal Linux</b><small>Shell simulasi + filesystem</small></Link>
        <Link className="card game-card" to="/mansion"><b>🦋 Butterfly Mansion</b><small>{due ? `${due} review jatuh tempo` : 'Review & Mistake Journal'}</small></Link>
      </div>
      <h2>Latihan per bab</h2>
      <p className="muted">Kode dijalankan langsung di perangkatmu dan dinilai dengan test case.</p>
      {started.map(t => <TrackExercises key={t} track={t} passed={progress.find(p => p.track === t)!.passed} solved={solved} />)}
      {!started.length && <Link className="btn-primary" to="/belajar">Mulai sebuah track dulu di Belajar</Link>}
    </div>
  )
}
