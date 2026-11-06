import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { saveSettings, useSettings, type Settings } from '../db'
import { Icon } from '../pixel'
import { FREEZE_MAX, activityDays, freezeDays, freezePrice, heatmap, streakState } from '../data/economy'
import { NotEnoughKoban, buy, useEconomy } from '../wallet'
import { setSoundEnabled, sfx } from '../sfx'
import { normalizeApi, setPublicCompiler, setUserApi } from '../run'

const THEMES: [Settings['theme'], string][] = [['system', 'Ikuti sistem'], ['dark', 'Malam'], ['light', 'Siang']]
const DAYS = ['Sen', '', 'Rab', '', 'Jum', '', 'Min']

function Heatmap({ frozen }: { frozen: string[] }) {
  const { attempts } = useEconomy()
  const weeks = heatmap(attempts)
  const lvl = (n: number) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4)
  return (
    <div className="heatmap" role="img" aria-label="Aktivitas 18 minggu terakhir">
      <div className="hm-days">{DAYS.map((d, i) => <small key={i}>{d}</small>)}</div>
      {weeks.map((w, i) => (
        <div key={i} className="hm-week">
          {w.map(c => <i key={c.day} title={`${c.day}: ${c.n} aktivitas`} className={c.future ? 'future' : frozen.includes(c.day) ? 'frozen' : `l${lvl(c.n)}`} />)}
        </div>
      ))}
    </div>
  )
}

export default function Profile() {
  // Tautan dari banner "Atur server eksekusi" (/profil#server) langsung menggulir ke bagiannya.
  useEffect(() => { if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView() }, [])
  const s = useSettings()
  const { level, xp, streak, koban, ach } = useEconomy()
  const [msg, setMsg] = useState('')
  const price = freezePrice(s.companion)
  async function buyFreeze() {
    setMsg('')
    try {
      await buy((_, sp, atts) => {
        if (streakState(activityDays(atts), freezeDays(sp)).held >= FREEZE_MAX) throw new Error('Freeze sudah penuh.')
        return [{ date: new Date().toISOString(), kind: 'freeze', cost: price }]
      })
      setMsg('Streak Freeze siap. Satu hari bolong akan tertutup otomatis.')
    } catch (e) { setMsg(e instanceof NotEnoughKoban ? 'Koban belum cukup.' : (e as Error).message) }
  }
  return (
    <div className="page">
      <h1>Profil</h1>
      <section className="card">
        <h2>Slayer Level {level.level}</h2>
        <div className="bar" role="progressbar" aria-label="XP" aria-valuenow={level.into} aria-valuemax={level.need}><i style={{ width: `${(level.into / level.need) * 100}%` }} /></div>
        <p className="muted small">{xp} XP · {level.need - level.into} XP lagi ke level {level.level + 1} · <Icon name="coin" size={14} /> {koban} Koban</p>
      </section>
      <section className="card">
        <h2>Streak <span className="streak"><b>{streak.current}</b> hari</span></h2>
        <p className="muted small">Rekor {streak.best} hari · <Icon name="freeze" size={14} /> Freeze {streak.held}/{FREEZE_MAX}{streak.frozen.length > 0 && ` · ${streak.frozen.length} hari diselamatkan`}</p>
        <Heatmap frozen={streak.frozen} />
        <button className="btn-ghost" disabled={streak.held >= FREEZE_MAX || koban < price} onClick={buyFreeze}>
          <Icon name="freeze" size={16} /> Beli Streak Freeze ({price} Koban)
        </button>
        {msg && <p className="feedback">{msg}</p>}
      </section>
      <Link className="card link" to="/pencapaian"><Icon name="medal" size={20} /> Pencapaian ({ach.filter(a => a.done).length}/{ach.length}) →</Link>
      <Link className="card link" to="/karakter">Karakter & Companion →</Link>
      <Link className="card link" to="/gacha"><Icon name="coin" size={20} /> Gacha & Lemari Kosmetik →</Link>
      <Link className="card link" to="/jalur">Ubah jalur belajar →</Link>
      <ServerSettings />
      <MentorSettings />
      <section className="card">
        <h2>Tema</h2>
        <div className="seg" role="radiogroup" aria-label="Tema">
          {THEMES.map(([v, label]) => (
            <button key={v} role="radio" aria-checked={s.theme === v} onClick={() => saveSettings({ theme: v })}>{label}</button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={s.reduceMotion} onChange={e => saveSettings({ reduceMotion: e.target.checked })} />
          Kurangi animasi
        </label>
        <label className="check">
          <input type="checkbox" checked={s.sound ?? true} onChange={e => { saveSettings({ sound: e.target.checked }); setSoundEnabled(e.target.checked); if (e.target.checked) sfx('coin') }} />
          Efek suara 8-bit
        </label>
        <label className="check">
          Ukuran font editor
          <input type="range" min={12} max={22} value={s.editorFont} onChange={e => saveSettings({ editorFont: +e.target.value })} />
          <code>{s.editorFont}px</code>
        </label>
      </section>
    </div>
  )
}

// AI Mentor opsional: mati secara default, key milik user sendiri, disimpan lokal.
function MentorSettings() {
  const s = useSettings()
  const [key, setKey] = useState<string | null>(null)
  const value = key ?? s.mentorKey ?? ''
  return (
    <section className="card">
      <h2>🦉 AI Mentor <small className="muted">(opsional)</small></h2>
      <p className="muted small">Tombol "Jelaskan kodeku" dan "Review kodeku" setelah menjalankan tes, memakai Claude dengan API key Anthropic milikmu sendiri. Semua fitur lain tetap jalan tanpa ini. Key hanya disimpan di browser ini dan dikirim langsung ke api.anthropic.com; biaya pemakaian ditanggung akunmu.</p>
      <label className="check">
        <input type="checkbox" checked={!!s.mentor} onChange={e => saveSettings({ mentor: e.target.checked })} />
        Aktifkan AI Mentor
      </label>
      {s.mentor && (
        <div className="row-actions">
          <input className="grow" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" aria-label="API key Anthropic" value={value} onChange={e => setKey(e.target.value)} />
          <button className="btn-ghost" disabled={value.trim() === (s.mentorKey ?? '')} onClick={() => { saveSettings({ mentorKey: value.trim() || undefined }); setKey(null) }}>Simpan</button>
          {s.mentorKey && <button className="btn-ghost" onClick={() => { saveSettings({ mentorKey: undefined }); setKey(null) }}>Hapus key</button>}
        </div>
      )}
      {s.mentor && !s.mentorKey && <p className="feedback">Isi API key dulu. Buat di console.anthropic.com.</p>}
    </section>
  )
}

// Server eksekusi untuk bahasa compiled (C, C++, Java, Go, Rust, C#, Kotlin). Tanpa ini, bahasa lain tetap jalan offline.
function ServerSettings() {
  const s = useSettings()
  const [url, setUrl] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const value = url ?? (s.execServer ?? '').replace(/\/api$/, '')
  async function test() {
    const api = normalizeApi(value)
    if (!/^https?:\/\//.test(api)) return setMsg({ ok: false, text: 'Tulis alamat lengkap, mis. https://slayer.domainmu.com' })
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${api}/health`, { signal: AbortSignal.timeout(10000) })
      const j = await r.json()
      if (!j.ok) throw new Error('respons tidak dikenal')
      await saveSettings({ execServer: api })
      setUserApi(api); setUrl(null)
      setMsg({ ok: true, text: `Terhubung (${(j.langs ?? []).join(', ')}). Bahasa compiled sekarang bisa dijalankan.` })
    } catch (e) {
      setMsg({ ok: false, text: `Gagal terhubung ke ${api}: ${(e as Error).message}. Pastikan server sudah di-deploy (lihat DEPLOY.md) dan memakai https.` })
    }
    setBusy(false)
  }
  return (
    <section className="card" id="server">
      <h2>🖥️ Server eksekusi</h2>
      <p className="muted small">C, C++, Java, Go, Rust, C#, dan Kotlin harus di-compile di server, karena HP/browser tidak bisa menjalankannya langsung. Python, JS, SQL, HTML, Bash, Git, materi, kuis, lab Cyber, dan CTF tetap jalan tanpa server.</p>
      <p className="small">Status: {s.execServer ? <b>{s.execServer}</b> : <span className="muted">{(window as unknown as { Capacitor?: unknown }).Capacitor ? ((s.publicCompiler ?? true) ? 'belum diatur, sementara memakai wandbox.org (kecuali Kotlin)' : 'belum diatur') : 'server bawaan (alamat yang sama dengan aplikasi web ini)'}</span>}</p>
      <div className="row-actions">
        <input className="grow mono" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="https://slayer.domainmu.com" aria-label="Alamat server eksekusi" value={value} onChange={e => setUrl(e.target.value)} />
        <button className="btn-primary" disabled={busy || !value.trim()} onClick={test}>{busy ? 'Menguji…' : 'Tes & simpan'}</button>
        {s.execServer && <button className="btn-ghost" onClick={() => { saveSettings({ execServer: undefined }); setUserApi(null); setUrl(null); setMsg(null) }}>Hapus</button>}
      </div>
      {msg && <p className={`feedback ${msg.ok ? '' : 'wrong'}`}>{msg.text}</p>}
      <label className="check">
        <input type="checkbox" checked={s.publicCompiler ?? true} onChange={e => { saveSettings({ publicCompiler: e.target.checked }); setPublicCompiler(e.target.checked) }} />
        Pakai layanan publik wandbox.org bila belum ada server sendiri
      </label>
      <p className="muted small">Untuk C, C++, Java, Go, Rust, dan C#: kodemu dan inputnya dikirim ke wandbox.org (layanan gratis pihak ketiga) untuk di-compile. Jangan tulis data pribadi di kode. Kotlin dan juri Hashira Trial tetap butuh server sendiri.</p>
    </section>
  )
}
