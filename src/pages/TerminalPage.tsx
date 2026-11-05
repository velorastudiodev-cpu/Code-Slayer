// Terminal Linux bebas: shell simulasi dengan filesystem yang tersimpan di perangkat (IndexedDB).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { Shell } from '../term/shell'
import { VFS } from '../term/vfs'
import { MAN } from '../term/coreutils'
import { Terminal } from '../components/Terminal'

const KEY = 'term:state'
export const STARTER_FILES = {
  'README.txt': 'Selamat datang di Markas Kisatsutai.\nCoba: ls -la, cat misi/laporan.txt, grep -i iblis misi/*.txt, man grep\n',
  'misi/laporan.txt': 'Hari 1: Gunung Natagumo. Iblis laba-laba terlihat.\nHari 2: Regu Tanjiro tiba.\nHari 3: Iblis bulan bawah tertebas.\n',
  'misi/regu.csv': 'nama,napas,rank\nTanjiro,Air,Kanoe\nZenitsu,Petir,Kanoe\nInosuke,Binatang,Kanoe\nKanao,Bunga,Tsuguko\n',
  'misi/.rahasia': 'Kaa! File tersembunyi hanya terlihat dengan ls -a.\n',
  'skrip/halo.sh': { content: '#!/bin/bash\necho "Halo, $USER! Hari ini tanggal $(date +%d)."\n', mode: '755' },
  '/var/log/auth.log': 'Nov  5 10:01:12 kisatsutai sshd[812]: Accepted password for slayer from 10.0.0.5\nNov  5 10:03:40 kisatsutai sshd[830]: Failed password for root from 10.0.0.66\nNov  5 10:03:42 kisatsutai sshd[831]: Failed password for root from 10.0.0.66\n',
}
const MOTD = 'Code Slayer Terminal — Bash simulasi, semua berjalan di perangkatmu. Ketik `help` atau `man <perintah>`. Tab melengkapi, ↑↓ riwayat.'

function fresh() {
  return new Shell({ fs: new VFS().load(STARTER_FILES), interactive: true })
}

export default function TerminalPage() {
  const [sh, setSh] = useState<Shell | null>(null)
  useEffect(() => {
    db.kv.get(KEY).then(r => {
      const s = r?.value as { fs: never; cwd: string; history: string[] } | undefined
      if (!s) return setSh(fresh())
      const shell = new Shell({ fs: VFS.fromJSON(s.fs), cwd: s.cwd, interactive: true })
      shell.history = s.history ?? []
      setSh(shell)
    }).catch(() => setSh(fresh()))
  }, [])
  const save = () => sh && db.kv.put({ key: KEY, value: { fs: sh.fs.toJSON(), cwd: sh.cwd, history: sh.history.slice(-200) } })
  async function reset() {
    if (!window.confirm('Kembalikan filesystem ke keadaan awal? Semua file buatanmu terhapus.')) return
    await db.kv.delete(KEY)
    setSh(fresh())
  }
  return (
    <div className="page">
      <h1>🐗 Terminal Linux</h1>
      <p className="muted">Shell Bash simulasi dengan filesystem virtual: aman dicoba apa pun, tidak menyentuh sistem asli. Isinya tersimpan otomatis di perangkat ini.</p>
      {sh && <Terminal key={String(sh.fs.root === undefined)} shell={sh} motd={MOTD} onRun={() => void save()} height={420} />}
      <div className="row-actions">
        <button className="btn-ghost" onClick={reset}>Reset filesystem</button>
        <Link className="btn-ghost" to="/belajar/bash">Track Bash & Linux →</Link>
      </div>
      <details className="card">
        <summary>Perintah yang tersedia ({Object.keys(MAN).length})</summary>
        <dl className="man">{Object.entries(MAN).map(([k, v]) => <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>)}</dl>
      </details>
    </div>
  )
}
