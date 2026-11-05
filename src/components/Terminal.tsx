// Terminal Linux simulasi: shell Bash buatan sendiri + virtual filesystem, berjalan sepenuhnya di browser (offline).
// Berbasis DOM (bukan kanvas) supaya keyboard HP, copy-paste, dan pembaca layar bekerja.
import { useEffect, useRef, useState } from 'react'
import { Shell } from '../term/shell'
import { BUILTINS } from '../term/shell'
import { COMMANDS } from '../term/coreutils'

type Line = { text: string; kind: 'in' | 'out' | 'err' | 'sys' }

export const promptOf = (sh: Shell) => {
  const home = sh.fs.user(sh.user).home
  const dir = sh.cwd === home ? '~' : sh.cwd.startsWith(home + '/') ? '~' + sh.cwd.slice(home.length) : sh.cwd
  return `${sh.user}@kisatsutai:${dir}${sh.user === 'root' ? '#' : '$'} `
}

// Tab completion: kata pertama = perintah, selanjutnya = path.
export function complete(sh: Shell, line: string): { line: string; options: string[] } {
  const m = /(\S*)$/.exec(line)!
  const word = m[1], before = line.slice(0, line.length - word.length)
  const first = !before.trim()
  let opts: string[]
  if (first && !word.includes('/')) opts = [...new Set([...Object.keys(COMMANDS), ...Object.keys(BUILTINS)])].filter(c => c.startsWith(word)).sort()
  else {
    const slash = word.lastIndexOf('/')
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : ''
    const base = word.slice(slash + 1)
    const home = sh.fs.user(sh.user).home
    const abs = dirPart.startsWith('/') ? dirPart : dirPart.startsWith('~') ? home + dirPart.slice(1) : `${sh.cwd}/${dirPart}`
    try {
      opts = sh.fs.list(sh.user, abs.replace(/\/+$/, '') || '/').filter(n => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')))
        .map(n => { const full = (abs.replace(/\/+$/, '') + '/' + n).replace(/^\/\//, '/'); const isDir = sh.fs.get(full)?.type === 'dir'; return dirPart + n + (isDir ? '/' : '') })
    } catch { opts = [] }
  }
  if (opts.length === 1) return { line: before + opts[0] + (opts[0].endsWith('/') ? '' : ' '), options: [] }
  if (opts.length > 1) {
    let p = opts[0]
    for (const o of opts) while (!o.startsWith(p)) p = p.slice(0, -1)
    return { line: before + p, options: opts }
  }
  return { line, options: [] }
}

export function Terminal({ shell, motd, onRun, label = 'Terminal Linux', height = 360 }: { shell: Shell; motd?: string; onRun?: (cmd: string, out: string) => void; label?: string; height?: number }) {
  const [lines, setLines] = useState<Line[]>(() => (motd ? [{ text: motd, kind: 'sys' }] : []))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const hist = useRef<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight) }, [lines, busy])

  async function run(cmd: string) {
    const p = promptOf(shell)
    setLines(l => [...l, { text: p + cmd, kind: 'in' }])
    setInput(''); hist.current = null
    if (!cmd.trim()) return
    shell.history.push(cmd)
    setBusy(true)
    const r = await shell.run(cmd)
    setBusy(false)
    if (shell.cleared) { shell.cleared = false; setLines([]); return }
    setLines(l => [...l, ...(r.stdout ? [{ text: r.stdout.replace(/\n$/, ''), kind: 'out' as const }] : []), ...(r.stderr ? [{ text: r.stderr.replace(/\n$/, ''), kind: 'err' as const }] : [])])
    onRun?.(cmd, r.stdout)
  }

  function key(e: React.KeyboardEvent<HTMLInputElement>) {
    const h = shell.history
    if (e.key === 'Enter') { e.preventDefault(); if (!busy) void run(input) }
    else if (e.key === 'ArrowUp' && h.length) { e.preventDefault(); const i = hist.current === null ? h.length - 1 : Math.max(0, hist.current - 1); hist.current = i; setInput(h[i]) }
    else if (e.key === 'ArrowDown' && hist.current !== null) { e.preventDefault(); const i = hist.current + 1; if (i >= h.length) { hist.current = null; setInput('') } else { hist.current = i; setInput(h[i]) } }
    else if (e.key === 'Tab') {
      e.preventDefault()
      const c = complete(shell, input)
      setInput(c.line)
      if (c.options.length) setLines(l => [...l, { text: promptOf(shell) + input, kind: 'in' }, { text: c.options.join('  '), kind: 'out' }])
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]) }
    else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) { e.preventDefault(); setLines(l => [...l, { text: promptOf(shell) + input + '^C', kind: 'in' }]); setInput('') }
  }

  return (
    <div className="terminal" role="region" aria-label={label} style={{ height }} onClick={() => { if (!window.getSelection()?.toString()) field.current?.focus() }} ref={box}>
      <div role="log" aria-live="polite">
        {lines.map((l, i) => <pre key={i} className={`t-${l.kind}`}>{l.text}</pre>)}
      </div>
      <label className="t-line">
        <span className="t-prompt" aria-hidden>{promptOf(shell)}</span>
        <input ref={field} value={input} onChange={e => setInput(e.target.value)} onKeyDown={key} disabled={busy} aria-label="Perintah" autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="send" />
      </label>
      <div className="t-keys" aria-label="Tombol bantu">
        {['Tab', '↑', '↓', '|', '>', '-', '/', '~', '$', '*'].map(k => (
          <button key={k} type="button" onMouseDown={e => e.preventDefault()} onClick={() => {
            if (k === 'Tab') key({ key: 'Tab', preventDefault() {}, ctrlKey: false } as React.KeyboardEvent<HTMLInputElement>)
            else if (k === '↑' || k === '↓') key({ key: k === '↑' ? 'ArrowUp' : 'ArrowDown', preventDefault() {}, ctrlKey: false } as React.KeyboardEvent<HTMLInputElement>)
            else setInput(v => v + k)
            field.current?.focus()
          }}>{k}</button>
        ))}
      </div>
    </div>
  )
}
