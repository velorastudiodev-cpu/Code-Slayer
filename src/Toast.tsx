import { sfx } from './sfx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { Icon } from './pixel'
import { TIER_KOBAN } from './data/achievements'
import { useEconomy } from './wallet'

type Shown = { names: string[]; koban: number; mark: boolean }

// Pencapaian baru: satu toast ringkas yang hilang sendiri (tidak memblokir, tidak beruntun).
export function AchievementToast() {
  const { ach } = useEconomy()
  const seen = useLiveQuery(() => db.kv.get('ach:seen').then(r => (r?.value as string[] | undefined) ?? null), [])
  const [show, setShow] = useState<Shown | null>(null)
  const done = ach.filter(a => a.done)
  const fresh = seen !== undefined ? done.filter(a => !(seen ?? []).includes(a.id)) : []
  const key = fresh.map(a => a.id).join()
  useEffect(() => {
    if (!fresh.length) return
    // Gabungan, bukan timpa: saat data baru separuh termuat, `done` bisa lebih sedikit dari yang pernah terlihat.
    db.kv.put({ key: 'ach:seen', value: [...new Set([...(seen ?? []), ...done.map(a => a.id)])] })
    setShow({ names: fresh.map(a => a.name), koban: fresh.reduce((s, a) => s + TIER_KOBAN[a.tier], 0), mark: fresh.some(a => a.tier === 4) })
    if (seen !== null) sfx('fanfare') // bukan saat pertama kali memuat data lama
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(null), 6000)
    return () => clearTimeout(t)
  }, [show])
  if (!show) return null
  return (
    <div className={`toast ${show.mark ? 'mark' : ''}`} role="status">
      <Icon name={show.mark ? 'mark' : 'medal'} size={28} />
      <Link to="/pencapaian" onClick={() => setShow(null)}>
        <b>{show.names.length === 1 ? show.names[0] : `${show.names.length} pencapaian baru`}</b>
        <small>{show.mark ? 'Demon Slayer Mark! ' : 'Pencapaian terbuka · '}+{show.koban} Koban</small>
      </Link>
      <button className="x" aria-label="Tutup" onClick={() => setShow(null)}>×</button>
    </div>
  )
}
