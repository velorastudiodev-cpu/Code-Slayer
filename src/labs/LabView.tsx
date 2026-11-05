// Tampilan lab sandbox: setiap jenis lab punya alatnya sendiri, semuanya berakhir di kolom flag yang divalidasi hash.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SqlJsStatic } from 'sql.js'
import { CRYPTO_OPS, HTML_APPS, hydrate, checkFlag, crackmeCheck, decFlag, filterPackets, htmlDoc, labShell, webRequest, type Packet, type Res } from './engine'
import { md5, sha256 } from '../term/hash'
import { Terminal } from '../components/Terminal'

export type Lab = {
  id: string; title: string; cat: string; points: number; kind: string; chapter?: string; story: string; task: string; hints: string[]
  config: Record<string, unknown>; writeup: string; fix?: string; flag_enc: string; flag_hash: string
}

let ctfCache: Promise<Lab[]> | null = null
export function useLabs() {
  const [labs, setLabs] = useState<Lab[] | null>(null)
  useEffect(() => { (ctfCache ??= import('../generated/meta/ctf.json').then(m => m.default.labs as unknown as Lab[])).then(setLabs) }, [])
  return labs
}

let sqlP: Promise<SqlJsStatic> | null = null
const loadSql = () => (sqlP ??= Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]).then(([{ default: init }, { default: wasm }]) => init({ locateFile: () => wasm })))

// ---------------- web: request builder ke server simulasi ----------------
function WebLab({ lab }: { lab: Lab }) {
  const start = (lab.config.start ?? {}) as { method?: string; url?: string; body?: string; cookie?: string }
  const [method, setMethod] = useState(start.method ?? 'GET')
  const [url, setUrl] = useState(start.url ?? '/')
  const [body, setBody] = useState(start.body ?? '')
  const [cookie, setCookie] = useState(start.cookie ?? '')
  const [headers, setHeaders] = useState('')
  const [res, setRes] = useState<(Res & { req: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  async function send() {
    setBusy(true)
    const h = Object.fromEntries(headers.split('\n').map(l => l.split(/:\s*/)).filter(x => x[0]?.trim() && x.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]))
    const SQL = String(lab.config.app).startsWith('sqli') ? await loadSql() : undefined
    const r = await webRequest(String(lab.config.app), { method, url, body, cookie, headers: h }, { flag: decFlag(lab.flag_enc), SQL })
    setRes({ ...r, req: `${method} ${url}` })
    setBusy(false)
  }
  return (
    <section className="card lab-web">
      <h2>🌐 Browser simulasi <small className="muted">(server rentan berjalan di perangkatmu)</small></h2>
      <div className="row-actions">
        <select aria-label="Metode" value={method} onChange={e => setMethod(e.target.value)}>{['GET', 'POST', 'PUT', 'DELETE'].map(m => <option key={m}>{m}</option>)}</select>
        <input className="grow mono" aria-label="URL" value={url} onChange={e => setUrl(e.target.value)} spellCheck={false} autoCapitalize="off" />
      </div>
      <label className="field"><small className="muted">Cookie</small><input className="mono" value={cookie} onChange={e => setCookie(e.target.value)} placeholder="nama=nilai; nama2=nilai2" spellCheck={false} autoCapitalize="off" /></label>
      <label className="field"><small className="muted">Header tambahan (satu per baris, Nama: nilai)</small><textarea className="mono" rows={2} value={headers} onChange={e => setHeaders(e.target.value)} spellCheck={false} autoCapitalize="off" /></label>
      {method !== 'GET' && <label className="field"><small className="muted">Body</small><textarea className="mono" rows={3} value={body} onChange={e => setBody(e.target.value)} spellCheck={false} autoCapitalize="off" /></label>}
      <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Mengirim…' : 'Kirim request'}</button>
      {res && (
        <div className="response" aria-live="polite">
          <small className="muted">{res.req}</small>
          <pre className={`code status-${Math.floor(res.status / 100)}`}>{`HTTP/1.1 ${res.status}\n${Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${res.body}`}</pre>
        </div>
      )}
    </section>
  )
}

// ---------------- html: XSS/CSRF di iframe sandbox ----------------
function HtmlLab({ lab }: { lab: Lab }) {
  const app = HTML_APPS[String(lab.config.app)]
  const [payload, setPayload] = useState('')
  const [doc, setDoc] = useState<string | null>(null)
  const [hit, setHit] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const msgs = useRef<{ type: string; data: unknown }[]>([])
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.lab !== 'slayer') return
      msgs.current.push(e.data)
      if (app.check(msgs.current)) setHit(true)
    }
    addEventListener('message', on)
    return () => removeEventListener('message', on)
  }, [app])
  return (
    <section className="card lab-html">
      <h2>🕸️ Halaman korban <small className="muted">(iframe sandbox: tidak bisa menyentuh aplikasi ini)</small></h2>
      <p className="small">{app.note}</p>
      <label className="field"><small className="muted">{app.input}</small><textarea className="mono" rows={4} value={payload} onChange={e => setPayload(e.target.value)} spellCheck={false} autoCapitalize="off" /></label>
      <button className="btn-primary" onClick={() => { msgs.current = []; setHit(false); setDoc(htmlDoc(String(lab.config.app), payload) + `<!-- ${Date.now()} -->`) }}>Kirim ke korban</button>
      {doc && <iframe ref={frame} title="Halaman korban (sandbox)" sandbox="allow-scripts" srcDoc={doc} className="victim" />}
      {hit && <p className="feedback">💥 Eksploit berhasil dijalankan di halaman korban! Flag: <code className="flag">{decFlag(lab.flag_enc)}</code></p>}
    </section>
  )
}

// ---------------- crypto: cipher playground ----------------
export function CipherPlayground({ initial, tools }: { initial: string; tools: string[] }) {
  const [text, setText] = useState(initial)
  const [op, setOp] = useState(tools[0])
  const [param, setParam] = useState('')
  const [log, setLog] = useState<string[]>([])
  const spec = CRYPTO_OPS[op]
  return (
    <section className="card cipher">
      <h2>🔐 Cipher Playground</h2>
      <label className="field"><small className="muted">Teks</small><textarea className="mono" rows={3} value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoCapitalize="off" /></label>
      <div className="row-actions">
        <select aria-label="Operasi" value={op} onChange={e => setOp(e.target.value)}>{tools.map(t => <option key={t} value={t}>{CRYPTO_OPS[t].name}</option>)}</select>
        {spec.param && <input aria-label={spec.param} placeholder={spec.param} value={param} onChange={e => setParam(e.target.value)} className="mono" />}
        <button className="btn-primary" onClick={() => { let r: string; try { r = spec.run(text, param) } catch { r = '(gagal: input tidak cocok untuk operasi ini)' } setLog(l => [...l, `${spec.name}${spec.param ? `(${param})` : ''}`]); setText(r) }}>Terapkan</button>
        <button className="btn-ghost" onClick={() => { setText(initial); setLog([]) }}>Reset</button>
      </div>
      {log.length > 0 && <small className="muted">Langkah: {log.join(' → ')}</small>}
    </section>
  )
}
function HashLab({ lab }: { lab: Lab }) {
  const c = lab.config as { algo: 'md5' | 'sha256'; hash: string; wordlist?: string[]; pins?: boolean }
  const H = c.algo === 'md5' ? md5 : sha256
  const [word, setWord] = useState('')
  const [found, setFound] = useState<string | null>(null)
  const [tried, setTried] = useState(0)
  function attack() {
    const cands = c.wordlist ?? Array.from({ length: 10000 }, (_, i) => String(i).padStart(4, '0'))
    let n = 0
    for (const w of cands) { n++; if (H(w) === c.hash) { setFound(w); setTried(n); return } }
    setTried(n); setFound('')
  }
  return (
    <section className="card">
      <h2>🔑 Hash bocor ({c.algo.toUpperCase()}, tanpa salt)</h2>
      <pre className="code">{c.hash}</pre>
      {c.wordlist && <p className="small">Wordlist: <code>{c.wordlist.join(', ')}</code></p>}
      <div className="row-actions">
        <input className="mono" aria-label="Kata untuk di-hash" placeholder="coba satu kata" value={word} onChange={e => setWord(e.target.value)} />
        <span className="small mono">{word && (H(word) === c.hash ? '✓ cocok!' : H(word).slice(0, 16) + '…')}</span>
      </div>
      <button className="btn-ghost" onClick={attack}>{c.wordlist ? 'Coba wordlist' : 'Coba semua PIN 0000–9999'}</button>
      {found !== null && <p className="feedback">{found ? `Cocok setelah ${tried} percobaan: "${found}". Flag = SLAYER{${found}}` : `Tidak ada yang cocok dari ${tried} kandidat.`}</p>}
    </section>
  )
}

// ---------------- crackme ----------------
function CrackmeLab({ lab }: { lab: Lab }) {
  const [key, setKey] = useState('')
  const [res, setRes] = useState<boolean | null>(null)
  return (
    <section className="card">
      <h2>🧩 Crackme <small className="muted">(dijalankan di perangkatmu)</small></h2>
      <pre className="code">{String(lab.config.code).trimEnd()}</pre>
      <div className="row-actions">
        <input className="mono grow" aria-label="Kunci" value={key} onChange={e => { setKey(e.target.value); setRes(null) }} placeholder="kunci" spellCheck={false} autoCapitalize="off" />
        <button className="btn-primary" onClick={() => setRes(crackmeCheck(String(lab.config.code), key))}>Coba kunci</button>
      </div>
      {res !== null && <p className={`feedback ${res ? '' : 'wrong'}`}>{res ? `periksa() → true. Flag = SLAYER{${key}}` : 'periksa() → false'}</p>}
    </section>
  )
}

// ---------------- packet viewer ----------------
function PacketLab({ lab }: { lab: Lab }) {
  const ps = lab.config.packets as Packet[]
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Packet | null>(null)
  const shown = useMemo(() => filterPackets(ps, q), [ps, q])
  return (
    <section className="card">
      <h2>📡 Packet viewer <small className="muted">(rekaman simulasi)</small></h2>
      <input className="mono" aria-label="Filter paket" placeholder="filter: http, dns, ip.src==10.0.0.5, teks…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="packets" role="group" aria-label="Daftar paket (klik untuk detail)">
        {shown.map(p => (
          <button key={p.no} className={`pkt ${sel?.no === p.no ? 'sel' : ''}`} onClick={() => setSel(p)}>
            <span>{p.no}</span><span>{p.t}</span><span>{p.src}</span><span>{p.dst}</span><span>{p.proto}</span><span>{p.info}</span>
          </button>
        ))}
      </div>
      {sel && <pre className="code">{sel.data ?? '(tidak ada payload)'}</pre>}
      <CipherPlayground initial="" tools={['b64d', 'hexd', 'rot13', 'reverse']} />
    </section>
  )
}

function OsintLab({ lab }: { lab: Lab }) {
  return (
    <section>
      <p className="muted small">⚠️ Semua data di berkas kasus ini FIKTIF.</p>
      {(lab.config.docs as { title: string; body: string }[]).map(d => <article key={d.title} className="card"><h2>{d.title}</h2><p>{d.body}</p></article>)}
    </section>
  )
}

export function LabTools({ lab: raw }: { lab: Lab }) {
  const lab = useMemo(() => ({ ...raw, config: hydrate(raw.config, decFlag(raw.flag_enc)) }), [raw])
  const shell = useMemo(() => (lab.kind === 'terminal' ? labShell(lab.config.files as never, lab.config.procs as never) : null), [lab])
  switch (lab.kind) {
    case 'web': return <WebLab lab={lab} />
    case 'html': return <HtmlLab lab={lab} />
    case 'terminal': return <Terminal shell={shell!} motd={`Lab ${lab.title}. Semua berkas di sini simulasi.`} label={`Terminal lab ${lab.title}`} />
    case 'crypto': return <><section className="card"><h2>Pesan tersandi</h2><pre className="code">{String(lab.config.cipher)}</pre></section><CipherPlayground initial={String(lab.config.cipher)} tools={lab.config.tools as string[]} /></>
    case 'hash': return <HashLab lab={lab} />
    case 'crackme': return <CrackmeLab lab={lab} />
    case 'packets': return <PacketLab lab={lab} />
    case 'osint': return <OsintLab lab={lab} />
  }
  return null
}

// Kolom flag: dicocokkan dengan hash SHA-256 (flag asli tidak disimpan sebagai teks biasa).
export function FlagForm({ lab, solved, onSolve }: { lab: Lab; solved: boolean; onSolve: () => void }) {
  const [v, setV] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <form className="card flag-form" onSubmit={e => { e.preventDefault(); if (checkFlag(v, lab.flag_hash)) { setMsg(''); onSolve() } else setMsg(/^SLAYER\{.+\}$/.test(v.trim()) ? 'Flag salah. Tetap tenang dan fokus, seperti Total Concentration.' : 'Format flag: SLAYER{...}') }}>
      <label className="field"><small className="muted">Flag</small><input className="mono" value={v} onChange={e => setV(e.target.value)} placeholder="SLAYER{...}" aria-label="Flag" spellCheck={false} autoCapitalize="off" autoComplete="off" disabled={solved} /></label>
      {!solved && <button className="btn-primary">Serahkan flag</button>}
      {msg && <p className="feedback wrong">{msg}</p>}
    </form>
  )
}

export function Writeup({ lab }: { lab: Lab }) {
  return (
    <section className="card win">
      <h2>Flag valid! 🦋</h2>
      <p><b>Pelajaran:</b> {lab.writeup}</p>
      {lab.fix && <><p><b>Perbaikan kode:</b></p><pre className="code">{lab.fix.trimEnd()}</pre></>}
    </section>
  )
}
