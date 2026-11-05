// Solution Gallery: setelah lulus, bandingkan solusimu dengan referensi & alternatif (idiomatic / fastest / readable).
import { useState } from 'react'
import type { Exercise } from '../data/content'

const STYLE: Record<string, string> = { idiomatic: 'Paling idiomatis', fastest: 'Paling efisien', readable: 'Paling mudah dibaca' }
const COMMENT = /^\s*(#|\/\/|--|\/\*|\*)/

// Metrik sederhana yang jujur: baris kode (tanpa baris kosong/komentar) dan karakter non-spasi.
export function metrics(code: string) {
  const lines = code.split('\n').filter(l => l.trim() && !COMMENT.test(l)).length
  return { lines, chars: code.replace(/\s/g, '').length }
}

export function Gallery({ ex, mine }: { ex: Exercise; mine: string }) {
  const [pick, setPick] = useState(1)
  if (!['write', 'translate', 'refactor', 'bughunt'].includes(ex.type) || !ex.solutions[0]) return null
  const items = [
    { name: 'Solusimu', note: 'Kode yang baru saja kamu serahkan.', code: mine },
    { name: 'Referensi', note: 'Solusi dari penulis soal.', code: ex.solutions[0] },
    ...(ex.gallery ?? []).map(a => ({ name: STYLE[a.style] ?? a.style, note: a.note, code: a.code })),
  ]
  const m = items.map(x => metrics(x.code))
  const sel = items[pick]
  return (
    <section className="card gallery">
      <h2>🗡️ Solution Gallery</h2>
      <p className="muted small">Semua solusi di bawah lolos tes yang sama. Bandingkan pendekatannya, bukan hanya panjangnya.</p>
      <table className="compare">
        <thead><tr><th>Solusi</th><th>Baris</th><th>Karakter</th></tr></thead>
        <tbody>
          {items.map((x, i) => (
            <tr key={i} className={i === pick ? 'current' : ''}>
              <td>{i === 0 ? <b>{x.name}</b> : <button className="link" aria-pressed={i === pick} onClick={() => setPick(i)}>{x.name}</button>}</td>
              <td>{m[i].lines}</td>
              <td>{m[i].chars}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="feedback"><b>{sel.name}:</b> {sel.note}</p>
      <div className="diff">
        <div><small>Solusimu</small><pre>{mine.trimEnd()}</pre></div>
        <div><small>{sel.name}</small><pre>{sel.code.trimEnd()}</pre></div>
      </div>
    </section>
  )
}
