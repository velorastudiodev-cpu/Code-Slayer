import { useEffect, useState } from 'react'
import { API, NEEDS_SERVER, type Lang } from '.'

export type ServerStatus = 'local' | 'checking' | 'online' | 'offline'

// Status server eksekusi untuk bahasa compiled; diperiksa ulang saat koneksi browser berubah.
export function useServerStatus(lang?: Lang): ServerStatus {
  const needs = !!lang && NEEDS_SERVER.includes(lang)
  const [s, setS] = useState<ServerStatus>(needs ? 'checking' : 'local')
  useEffect(() => {
    if (!needs) return setS('local')
    const check = () => {
      if (!navigator.onLine) return setS('offline')
      fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) }).then(r => setS(r.ok ? 'online' : 'offline'), () => setS('offline'))
    }
    check()
    addEventListener('online', check)
    addEventListener('offline', check)
    return () => { removeEventListener('online', check); removeEventListener('offline', check) }
  }, [needs])
  return s
}

export function ServerBanner({ status }: { status: ServerStatus }) {
  if (status === 'offline')
    return (
      <p className="feedback wrong" role="status">
        <b>Butuh koneksi.</b> Bahasa ini dikompilasi di server eksekusi, dan server tidak bisa dihubungi. Sambungkan internet, atau jalankan <code>npm run server</code> di komputermu.
      </p>
    )
  if (status === 'checking') return <p className="muted small">Memeriksa server eksekusi…</p>
  return null
}

export const NeedsNet = () => <span className="badge net" title="Bahasa compiled: dijalankan di server eksekusi">butuh koneksi</span>
