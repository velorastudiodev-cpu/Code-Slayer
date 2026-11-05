import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAttempts, useProgress } from '../db'
import { TYPE_LABEL, useTrackContent, type Lesson } from '../data/content'
import { canTakeExam, isOpen, nodesOf } from '../data/curriculum'
import { trackById } from '../data/tracks'
import { runMany, type Lang, type Run } from '../run'
import { HtmlPreview } from '../components/HtmlPreview'
import { ServerBanner, useServerStatus } from '../run/status'
import { ALGOS } from '../data/visual'

// Kartu konsep: 3–5 kalimat + contoh yang bisa langsung dijalankan.
function LessonCard({ l, lang, setup, blocked }: { l: Lesson; lang: Lang; setup: string; blocked: boolean }) {
  const [out, setOut] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <section className="card lesson">
      <p>{l.text}</p>
      {l.code && (
        <>
          <pre className="code">{l.code.trimEnd()}</pre>
          {lang === 'html' ? <HtmlPreview code={l.code} /> : <button className="btn-ghost" disabled={busy || blocked} onClick={async () => { setBusy(true); setOut((await runMany(lang, l.code!, [setup], { header: true }))[0]); setBusy(false) }}>
            {busy ? 'Menjalankan…' : '▶ Jalankan contoh'}
          </button>}
          {out && <pre className="code out">{out.stdout}{out.stderr && <span className="stderr-inline">{out.stderr}</span>}</pre>}
        </>
      )}
    </section>
  )
}

export default function ChapterPage() {
  const { track = '', chapter = '' } = useParams()
  const content = useTrackContent(track)
  const prog = useProgress(track)
  const solved = new Set(useAttempts(track).filter(a => a.kind === 'exercise' && a.passed).map(a => a.node))
  const nodes = nodesOf(track)
  const node = nodes.find(n => n.id === chapter && !n.boss)
  const lang: Lang = content?.chapters[chapter]?.exercises[0]?.lang ?? (track === 'js' ? 'javascript' : track === 'sql' ? 'sql' : 'python')
  const server = useServerStatus(lang)
  if (!node) return <Navigate to={`/belajar/${track}`} replace />
  if (!content || prog === undefined) return null
  if (!prog || !isOpen(nodes, prog.passed, chapter)) return <Navigate to={`/belajar/${track}`} replace />

  const t = trackById(track)
  const ch = content.chapters[chapter]
  const exercises = ch?.exercises ?? []
  const nextEx = exercises.find(e => !solved.has(e.id))
  const examOpen = canTakeExam(nodes, prog.passed, chapter)
  return (
    <div className="page" style={{ '--c': t.color } as React.CSSProperties}>
      <header>
        <small className="muted"><Link to={`/belajar/${track}`}>{t.emoji} {t.name}</Link> · {node.level}</small>
        <h1>{node.title}</h1>
      </header>
      <ServerBanner status={server} />
      {track === 'dsa' && ALGOS.some(a => a.chapter === chapter) && (
        <div className="row-actions start">{ALGOS.filter(a => a.chapter === chapter).map(a => <Link key={a.id} className="btn-ghost" to={`/visual/${a.id}`}>▶ Visualisasi {a.name}</Link>)}</div>
      )}
      {ch?.lesson.map((l, i) => <LessonCard key={i} l={l} lang={lang} setup={exercises[0]?.setup ?? ''} blocked={server === 'offline' || server === 'checking'} />)}
      {!ch && <p className="muted">Materi bab ini belum tersedia.</p>}
      {nextEx && <Link className="btn-primary" to={`/latihan/${track}/${nextEx.id}`}>Latihan: {nextEx.title}</Link>}
      {exercises.length > 0 && (
        <section>
          <h2>Latihan ({exercises.filter(e => solved.has(e.id)).length}/{exercises.length})</h2>
          <ul className="tracks">
            {exercises.map(e => (
              <li key={e.id}>
                <Link className="card track" to={`/latihan/${track}/${e.id}`}>
                  <span className="grow"><b>{solved.has(e.id) && '✓ '}{e.title}</b><small>{TYPE_LABEL[e.type]} · {'★'.repeat(e.difficulty)}</small></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {examOpen && exercises.length >= 2 && (
        <section className="card">
          <h2>Lower Moon: {node.title}</h2>
          <p className="muted">4 soal, satu kali serah per soal. Lulus ≥ 75% membuka bab berikutnya. Sudah yakin? Langsung saja (Skip Exam).</p>
          <Link className={nextEx ? 'btn-ghost' : 'btn-primary'} to={`/belajar/${track}/ujian/${chapter}`}>Hadapi Lower Moon</Link>
        </section>
      )}
    </div>
  )
}
