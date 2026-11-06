// Gulungan Pelajaran: materi dibawakan mentor kalimat demi kalimat, contoh kode "tebak dulu, baru jalankan",
// bisa diubah & dicoba di tempat, cek pemahaman, lalu selebrasi. Mode "tampilkan semua" untuk yang suka membaca sekaligus.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { Avatar, type Expr } from '../characters/rig'
import { useCompanion } from '../wallet'
import { highlight, mentorFor, sentences } from '../data/lesson'
import type { Exercise, Lesson } from '../data/content'
import { runMany, type Lang, type Run } from '../run'
import { norm } from '../run/exec'
import { Editor } from '../Editor'
import { HtmlPreview } from './HtmlPreview'
import { Quiz, ShortAnswer } from '../pages/tasks'
import { sfx } from '../sfx'

function Rich({ text, code }: { text: string; code?: string }) {
  return <>{highlight(text, code).map((s, i) => (s.code ? <code key={i} className="term">{s.t}</code> : <span key={i}>{s.t}</span>))}</>
}

// Contoh kode: tebak output → jalankan → bandingkan. Bisa diubah lalu dijalankan ulang.
function TryCode({ code, lang, setup, blocked }: { code: string; lang: Lang; setup: string; blocked: boolean }) {
  const [src, setSrc] = useState(code)
  const [edit, setEdit] = useState(false)
  const [guess, setGuess] = useState('')
  const [asking, setAsking] = useState(false)
  const [out, setOut] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [guessed, setGuessed] = useState<string | null>(null)
  if (lang === 'html') return (
    <div className="try">
      {edit ? <Editor value={src} lang="html" onChange={setSrc} label="Ubah contoh HTML" /> : <pre className="code">{src.trimEnd()}</pre>}
      <HtmlPreview code={src} />
      <button className="btn-ghost" onClick={() => setEdit(!edit)}>{edit ? 'Selesai mengubah' : '✏️ Ubah & lihat hasilnya'}</button>
    </div>
  )
  async function run() {
    setBusy(true)
    const r = (await runMany(lang, src, [setup], { header: true }))[0]
    setOut(r); setBusy(false)
    if (asking && guess.trim()) { setGuessed(guess); sfx(norm(guess) === norm(r.stdout) ? 'win' : 'click') }
    setAsking(false)
  }
  const right = guessed !== null && out && norm(guessed) === norm(out.stdout)
  return (
    <div className="try">
      <small className="muted">Contoh</small>
      {edit ? <Editor value={src} lang={lang} onChange={setSrc} label="Ubah contoh kode" /> : <pre className="code">{src.trimEnd()}</pre>}
      {asking && (
        <label className="field">
          <small className="muted">🤔 Menurutmu, apa outputnya? (boleh dikosongkan)</small>
          <textarea rows={2} className="mono" value={guess} onChange={e => setGuess(e.target.value)} spellCheck={false} autoCapitalize="off" />
        </label>
      )}
      <div className="row-actions start">
        {!asking && !out && !edit && <button className="btn-primary" disabled={blocked} onClick={() => setAsking(true)}>🤔 Tebak dulu, lalu jalankan</button>}
        {(asking || out || edit) && <button className="btn-primary" disabled={busy || blocked} onClick={run}>{busy ? 'Menjalankan…' : asking ? '▶ Jalankan & cocokkan' : '▶ Jalankan'}</button>}
        <button className="btn-ghost" onClick={() => { setEdit(!edit); setGuessed(null) }}>{edit ? 'Kembalikan contoh' : '✏️ Ubah & coba'}</button>
      </div>
      {edit && <button className="btn-link small" onClick={() => setSrc(code)}>Reset ke contoh asli</button>}
      {out && <pre className="code out" aria-live="polite">{out.stdout || (out.stderr ? '' : '(tidak ada output)')}{out.stderr && <span className="stderr-inline">{out.stderr}</span>}</pre>}
      {guessed !== null && out && <p className={`feedback ${right ? '' : 'wrong'}`}>{right ? '🎯 Tebakanmu tepat!' : 'Belum tepat — bandingkan tebakanmu dengan output di atas. Di mana bedanya?'}</p>}
    </div>
  )
}

function QuickPredict({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (ok: boolean) => void }) {
  const [v, setV] = useState('')
  return (
    <>
      <pre className="code">{ex.code?.trimEnd()}</pre>
      {ex.tests[0].input && <small className="muted">Input: <code>{ex.tests[0].input.trim()}</code></small>}
      <label className="field"><small className="muted">Tebakan output</small><textarea rows={2} className="mono" value={v} disabled={done} onChange={e => setV(e.target.value)} spellCheck={false} autoCapitalize="off" /></label>
      {!done && <button className="btn-ghost" disabled={!v.trim()} onClick={() => onCheck(norm(v) === norm(ex.tests[0].expected))}>Periksa</button>}
    </>
  )
}

type Props = { track: string; chapter: string; lessons: Lesson[]; lang: Lang; setup: string; blocked: boolean; checks: Exercise[]; mentor: string; nextHref?: string; nextLabel?: string }

export function LessonPlayer({ track, chapter, lessons, lang, setup, blocked, checks, mentor, nextHref, nextLabel }: Props) {
  const companion = useCompanion()
  const guide = mentorFor(mentor, companion)
  const key = `lesson:${track}:${chapter}`
  const saved = useLiveQuery(() => db.kv.get(key).then(r => (r?.value as number | undefined) ?? 0), [key])
  const all = useLiveQuery(() => db.kv.get('lesson:mode').then(r => r?.value === 'semua'), [])
  // Cek pemahaman: kuis/jawaban singkat bila ada, kalau tidak soal "tebak output" (predict) dari bab ini.
  const quick = useMemo(() => { const q = checks.filter(e => e.type === 'quiz' || e.type === 'answer'); return (q.length ? q : checks.filter(e => e.type === 'predict')).slice(0, 2) }, [checks])
  const total = lessons.length + (quick.length ? 1 : 0) // + langkah cek pemahaman
  const [step, setStep] = useState<number | null>(null)
  const [shown, setShown] = useState(1)
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  useEffect(() => { if (step === null && saved !== undefined) setStep(Math.min(saved, total)) }, [saved, step, total])
  if (step === null || all === undefined) return null

  const go = (n: number) => { setStep(n); setShown(1); void db.kv.put({ key, value: n }) }
  async function finish() {
    go(total)
    sfx('fanfare')
    const done = await db.attempts.where('track').equals(track).filter(a => a.kind === 'lesson' && a.node === chapter).count()
    if (!done) await db.attempts.add({ track, node: chapter, kind: 'lesson', date: new Date().toISOString(), correct: 1, total: 1, passed: true })
  }
  const toggle = () => db.kv.put({ key: 'lesson:mode', value: all ? 'langkah' : 'semua' })

  if (all) return (
    <section className="lesson-all">
      <div className="row"><small className="muted">Mode baca semua</small><button className="btn-link small" onClick={toggle}>Ganti ke mode langkah demi langkah</button></div>
      {lessons.map((l, i) => (
        <article key={i} className="card lesson">
          <p><Rich text={l.text} code={l.code} /></p>
          {l.code && <TryCode code={l.code} lang={lang} setup={setup} blocked={blocked} />}
        </article>
      ))}
    </section>
  )

  const segs = Array.from({ length: total }, (_, i) => i)
  const progress = (
    <div className="steps" role="progressbar" aria-label="Kemajuan pelajaran" aria-valuenow={Math.min(step, total)} aria-valuemax={total}>
      {segs.map(i => <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
    </div>
  )

  // Selesai
  if (step >= total) return (
    <section className="card lesson-done">
      {progress}
      <div className="mentor-row">
        <Avatar c={guide} expr="victory" size={88} />
        <div className="bubble"><p>Gulungan ini sudah kamu kuasai! Saatnya mengasah pedang di latihan.</p></div>
      </div>
      <p className="score-big">🎉 Pelajaran tuntas <small className="muted">+10 XP</small></p>
      <div className="row-actions start">
        {nextHref && <Link className="btn-primary" to={nextHref}>{nextLabel ?? 'Mulai latihan'}</Link>}
        <button className="btn-ghost" onClick={() => go(0)}>Ulangi dari awal</button>
      </div>
    </section>
  )

  // Cek pemahaman
  if (step === lessons.length) {
    const allDone = quick.every(q => answered[q.id] !== undefined)
    return (
      <section className="card lesson-step">
        {progress}
        <div className="mentor-row">
          <Avatar c={guide} expr={allDone ? (Object.values(answered).every(Boolean) ? 'happy' : 'encourage') : 'focus'} size={72} />
          <div className="bubble"><p>Sebelum lanjut, coba jawab ini. Tidak dinilai, hanya untuk memastikan kamu paham.</p></div>
        </div>
        {quick.map(q => (
          <div key={q.id} className="quick">
            <p className="prompt">{q.prompt}</p>
            {q.type === 'quiz' ? <Quiz ex={q} done={answered[q.id] !== undefined} onCheck={g => setAnswered(a => ({ ...a, [q.id]: g.every(x => x.pass) }))} />
              : q.type === 'answer' ? <ShortAnswer ex={q} done={answered[q.id] !== undefined} onCheck={g => setAnswered(a => ({ ...a, [q.id]: g.every(x => x.pass) }))} />
              : <QuickPredict ex={q} done={answered[q.id] !== undefined} onCheck={ok => setAnswered(a => ({ ...a, [q.id]: ok }))} />}
            {answered[q.id] !== undefined && <p className={`feedback ${answered[q.id] ? '' : 'wrong'}`}>{answered[q.id] ? 'Tepat! ' : 'Belum tepat. '}{q.type === 'predict' ? (answered[q.id] ? '' : `Output sebenarnya: ${q.tests[0].expected.trimEnd()}`) : q.explain}</p>}
          </div>
        ))}
        <div className="row-actions">
          <button className="btn-ghost" onClick={() => go(step - 1)}>◂ Kembali</button>
          <button className="btn-primary" disabled={!allDone} onClick={finish}>Selesaikan gulungan ▸</button>
        </div>
      </section>
    )
  }

  // Langkah materi
  const l = lessons[step]
  const ss = sentences(l.text)
  const full = shown >= ss.length
  const expr: Expr = step === 0 ? 'happy' : full && l.code ? 'focus' : 'idle'
  const next = () => (full ? (step + 1 === lessons.length && !quick.length ? finish() : go(step + 1)) : setShown(shown + 1))
  return (
    <section className="card lesson-step" onKeyDown={e => { if (e.key === 'ArrowRight' && (e.target as HTMLElement).tagName !== 'TEXTAREA') next() }}>
      {progress}
      <div className="row"><small className="muted">Langkah {step + 1}/{total}</small><button className="btn-link small" onClick={toggle}>Tampilkan semua sekaligus</button></div>
      <div className="mentor-row">
        <Avatar c={guide} expr={expr} size={72} />
        <div className={`bubble ${full ? '' : 'more'}`} aria-live="polite" onClick={() => !full && setShown(shown + 1)}>
          {ss.slice(0, shown).map((s, i) => <p key={i} className={i === shown - 1 ? 'new' : ''}><Rich text={s} code={l.code} /></p>)}
          {!full && <span className="tap" aria-hidden>ketuk ▸</span>}
        </div>
      </div>
      <small className="muted guide-name">{guide.name}</small>
      {full && l.code && <TryCode key={step} code={l.code} lang={lang} setup={setup} blocked={blocked} />}
      <div className="row-actions">
        <button className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>◂ Kembali</button>
        <button className="btn-primary" onClick={next}>{!full ? 'Lanjut ▸' : step + 1 === lessons.length ? (quick.length ? 'Cek pemahaman ▸' : 'Selesaikan gulungan ▸') : 'Langkah berikutnya ▸'}</button>
      </div>
    </section>
  )
}
