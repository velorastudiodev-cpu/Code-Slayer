// Tombol AI Mentor di bawah hasil tes. Hanya muncul kalau user menyalakannya & mengisi API key sendiri.
import { useRef, useState } from 'react'
import { useSettings } from '../db'
import type { Exercise } from '../data/content'
import type { Graded } from '../run'
import type { MentorMode } from '../run/mentor'

export function Mentor({ ex, code, results }: { ex: Exercise; code: string; results: Graded[] }) {
  const s = useSettings()
  const [mode, setMode] = useState<MentorMode | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController>(null)
  if (!s.mentor || !s.mentorKey) return null

  async function ask(m: MentorMode) {
    abort.current?.abort()
    const ctl = (abort.current = new AbortController())
    setMode(m); setText(''); setErr(''); setBusy(true)
    const n = results.filter(r => r.pass).length
    const bad = results.find(r => !r.pass && !r.hidden)
    const outcome = n === results.length ? `lulus semua (${n}/${n})` : `${n}/${results.length} lolos.${bad ? ` Contoh gagal: diharapkan ${JSON.stringify(bad.expected.trimEnd())}, didapat ${JSON.stringify(bad.run.stdout.trimEnd())}${bad.run.stderr ? `, stderr: ${bad.run.stderr.trim().slice(-400)}` : ''}` : ''}`
    try {
      const { askMentor } = await import('../run/mentor')
      await askMentor(s.mentorKey!, m, ex, code, outcome, setText, ctl.signal)
    } catch (e) { if (!ctl.signal.aborted) setErr((e as Error).message) }
    if (abort.current === ctl) setBusy(false)
  }

  return (
    <section className="card mentor">
      <h3>🦉 AI Mentor</h3>
      <div className="row-actions">
        <button className="btn-ghost" disabled={busy} onClick={() => ask('explain')}>Jelaskan kodeku</button>
        <button className="btn-ghost" disabled={busy} onClick={() => ask('review')}>Review kodeku</button>
        {busy && <button className="btn-ghost" onClick={() => { abort.current?.abort(); setBusy(false) }}>Batal</button>}
      </div>
      {mode && (busy || text) && <div className="mentor-text" aria-live="polite">{text || 'Mentor sedang membaca kodemu…'}</div>}
      {err && <p className="feedback wrong">{err}</p>}
      <p className="muted small">Dikirim langsung ke API Anthropic memakai key-mu sendiri (biaya ditanggung akunmu). Jawaban AI bisa keliru; tes tetap jadi penentu.</p>
    </section>
  )
}
