import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NEEDS_SERVER, apiBase, setPublicCompiler, setUserApi, usesPublic, type Lang } from '.'
import { useSettings } from '../db'

// public = belum ada server sendiri, tapi dijalankan lewat layanan publik wandbox.org.
export type ServerStatus = 'local' | 'checking' | 'online' | 'offline' | 'none' | 'public'

// Status server eksekusi untuk bahasa compiled; diperiksa ulang saat koneksi browser berubah.
// allowPublic=false untuk juri olimpiade (butuh server sendiri).
export function useServerStatus(lang?: Lang, allowPublic = true): ServerStatus {
  const needs = !!lang && NEEDS_SERVER.includes(lang)
  const [s, setS] = useState<ServerStatus>(needs ? 'checking' : 'local')
  const { execServer: custom, publicCompiler } = useSettings()
  const pub = publicCompiler ?? true
  useEffect(() => {
    if (!needs) return setS('local')
    setUserApi(custom || null)
    setPublicCompiler(pub)
    const check = () => {
      const api = apiBase()
      if (!api) return setS(allowPublic && usesPublic(lang) ? (navigator.onLine ? 'public' : 'offline') : 'none')
      if (!navigator.onLine) return setS('offline')
      fetch(`${api}/health`, { signal: AbortSignal.timeout(5000) }).then(async r => setS(r.ok && (await r.json().catch(() => null))?.ok ? 'online' : 'offline'), () => setS('offline'))
    }
    check()
    addEventListener('online', check)
    addEventListener('offline', check)
    return () => { removeEventListener('online', check); removeEventListener('offline', check) }
  }, [needs, custom, pub, lang, allowPublic])
  return s
}

export function ServerBanner({ status }: { status: ServerStatus }) {
  if (status === 'none')
    return (
      <p className="feedback wrong" role="status">
        <b>Belum ada server eksekusi.</b> Bahasa ini di-compile di server, bukan di HP, dan aplikasi ini belum diatur ke server mana pun. Ini <b>bukan</b> masalah internetmu. <Link to="/profil#server">Atur server eksekusi →</Link>
      </p>
    )
  if (status === 'offline')
    return (
      <p className="feedback wrong" role="status">
        <b>Server eksekusi tidak bisa dihubungi.</b> Bahasa ini di-compile di server, bukan di HP. Periksa internet, atau alamat server di <Link to="/profil#server">Profil → Server eksekusi</Link>.
      </p>
    )
  if (status === 'public')
    return (
      <p className="muted small" role="status">
        🌐 Dijalankan di <b>wandbox.org</b> (layanan compiler publik gratis), karena belum ada server sendiri. Kodemu dikirim ke sana. Bisa lebih lambat atau sedang sibuk. <Link to="/profil#server">Pengaturan →</Link>
      </p>
    )
  if (status === 'checking') return <p className="muted small">Memeriksa server eksekusi…</p>
  return null
}

export const NeedsNet = () => <span className="badge net" title="Bahasa compiled: di-compile di server eksekusi, bukan di HP">butuh server</span>
