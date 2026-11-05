import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { db, useProfile } from '../db'
import { useCompanion } from '../wallet'
import { Avatar } from '../characters/rig'
import { EXPERIENCE, GOALS, MINUTES, TRACKS, recommendPath, trackById } from '../data/tracks'

function Choices<T extends string | number>({ items, isOn, onPick }: { items: [T, string][]; isOn: (v: T) => boolean; onPick: (v: T) => void }) {
  return (
    <div className="choices">
      {items.map(([v, label]) => (
        <button key={v} className="opt" aria-pressed={isOn(v)} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  )
}

export function PathEditor({ path, onChange }: { path: string[]; onChange: (p: string[]) => void }) {
  const move = (i: number, d: number) => {
    const p = [...path]
    ;[p[i], p[i + d]] = [p[i + d], p[i]]
    onChange(p)
  }
  const rest = TRACKS.filter(t => !path.includes(t.id))
  return (
    <>
      <ol className="path">
        {path.map((id, i) => {
          const t = trackById(id)
          return (
            <li key={id} className="card" style={{ '--c': t.color } as React.CSSProperties}>
              <span>{i + 1}. {t.emoji} {t.name}</span>
              <span className="tools">
                <button aria-label={`Naikkan ${t.name}`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button aria-label={`Turunkan ${t.name}`} disabled={i === path.length - 1} onClick={() => move(i, 1)}>▼</button>
                <button aria-label={`Hapus ${t.name}`} disabled={path.length === 1} onClick={() => onChange(path.filter(x => x !== id))}>✕</button>
              </span>
            </li>
          )
        })}
      </ol>
      {rest.length > 0 && (
        <select value="" aria-label="Tambah track" onChange={e => onChange([...path, e.target.value])}>
          <option value="">+ Tambah track…</option>
          {rest.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
        </select>
      )}
    </>
  )
}

export default function Onboarding() {
  const profile = useProfile()
  const c = useCompanion()
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState('')
  const [experience, setExperience] = useState(-1)
  const [minutes, setMinutes] = useState(0)
  const [interests, setInterests] = useState<string[]>([])
  const [path, setPath] = useState<string[]>([])

  const steps = [
    { q: 'Apa tujuanmu belajar ngoding?', ok: !!goal, body: <Choices items={GOALS.map(g => [g.id, g.label])} isOn={v => v === goal} onPick={setGoal} /> },
    { q: 'Seberapa jauh pengalamanmu?', ok: experience >= 0, body: <Choices items={EXPERIENCE.map((e, i) => [i, e])} isOn={v => v === experience} onPick={setExperience} /> },
    { q: 'Berapa menit per hari kamu bisa latihan?', ok: minutes > 0, body: <Choices items={MINUTES.map(m => [m, `${m} menit`])} isOn={v => v === minutes} onPick={setMinutes} /> },
    {
      q: 'Bahasa apa yang bikin kamu penasaran? Boleh lebih dari satu, boleh juga dilewati.', ok: true,
      body: <Choices items={TRACKS.map(t => [t.id, `${t.emoji} ${t.name}`])} isOn={v => interests.includes(v)}
        onPick={v => setInterests(interests.includes(v) ? interests.filter(x => x !== v) : [...interests, v])} />,
    },
    { q: 'Ini jalur yang disusun gagak untukmu. Urutannya boleh kamu ubah.', ok: path.length > 0, body: <PathEditor path={path} onChange={setPath} /> },
  ]
  // Pindah ke Beranda begitu profil tersimpan terbaca (navigate langsung bisa balik ke /mulai sebelum live query update).
  if (profile) return <Navigate to="/" replace />
  const s = steps[step]
  const last = step === steps.length - 1

  async function next() {
    if (step === 3) setPath(recommendPath(goal, interests))
    if (!last) return setStep(step + 1)
    await db.profile.put({ id: 'me', goal, experience, minutesPerDay: minutes, interests, path })
  }

  return (
    <div className="page">
      <section className="hero">
        <Avatar c={c} expr={last ? 'happy' : 'idle'} size={96} />
        <div className="bubble">
          <small>Langkah {step + 1} dari {steps.length}</small>
          <p>{s.q}</p>
        </div>
      </section>
      {s.body}
      <div className="row-actions">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Kembali</button>}
        <button className="btn-primary" disabled={!s.ok} onClick={next}>{last ? 'Mulai perjalanan' : 'Lanjut'}</button>
      </div>
    </div>
  )
}

// Ubah jalur setelah onboarding (dari Profil / Belajar).
export function PathPage() {
  const profile = useProfile()
  const [path, setPath] = useState<string[] | null>(null)
  const nav = useNavigate()
  if (!profile) return null
  const p = path ?? profile.path
  return (
    <div className="page">
      <h1>Jalurmu</h1>
      <PathEditor path={p} onChange={setPath} />
      <div className="row-actions">
        <Link className="btn-ghost" to="/belajar">Batal</Link>
        <button className="btn-primary" onClick={() => db.profile.update('me', { path: p }).then(() => nav('/belajar'))}>Simpan</button>
      </div>
    </div>
  )
}
