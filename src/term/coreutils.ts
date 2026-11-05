// Perintah "eksternal" terminal simulasi. Format output mengikuti GNU coreutils (LC_ALL=C), karena soal divalidasi terhadap bash asli.
import { BUILTINS, breToJs, ereToJs, escapeRe, globToRe, readAll, type Command, type Ctx } from './shell.ts'
import { FsError, VFS, modeString, type FNode } from './vfs.ts'
import { awk, AwkError } from './awk.ts'
import { b64decode, b64encode, md5, sha256 } from './hash.ts'
import { git } from './git.ts'

// ---------------------------------------------------------------- utilitas
type Opts = { flags: Set<string>; vals: Record<string, string[]>; rest: string[] }
// spec: huruf flag; huruf diikuti ':' butuh nilai. Mendukung -abc, -n5, -n 5, --.
function opts(args: string[], spec: string, numeric = false): Opts {
  const withVal = new Set([...spec.matchAll(/(\w):/g)].map(m => m[1]))
  const o: Opts = { flags: new Set(), vals: {}, rest: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') { o.rest.push(...args.slice(i + 1)); break }
    if (numeric && /^-\d+$/.test(a)) { (o.vals.n ??= []).push(a.slice(1)); continue }
    if (a.startsWith('-') && a.length > 1 && !a.startsWith('--')) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j]
        if (withVal.has(f)) { const v = j + 1 < a.length ? a.slice(j + 1) : args[++i]; (o.vals[f] ??= []).push(v ?? ''); break }
        o.flags.add(f)
      }
    } else if (a.startsWith('--') && a.length > 2) {
      const [k, v] = a.slice(2).split('=')
      o.flags.add(k)
      if (v !== undefined) (o.vals[k] ??= []).push(v)
    } else o.rest.push(a)
  }
  return o
}
const lines = (s: string) => { const l = s.split('\n'); if (l[l.length - 1] === '') l.pop(); return l }
const nl = (xs: string[]) => xs.map(x => x + '\n').join('')
// Baca file argumen (atau stdin kalau kosong / '-'). Error per file dilaporkan, lanjut file berikutnya.
function inputs(c: Ctx, files: string[]): { name: string; data: string; regular: boolean }[] {
  if (!files.length) return [{ name: '-', data: readAll(c.stdin), regular: !!c.stdin.regular }]
  const out: { name: string; data: string; regular: boolean }[] = []
  for (const f of files) {
    if (f === '-') { out.push({ name: '-', data: readAll(c.stdin), regular: !!c.stdin.regular }); continue }
    try { out.push({ name: f, data: c.sh.fs.read(c.sh.user, c.sh.abs(f)), regular: true }) }
    catch (e) { c.err(`${c.name}: ${f}: ${(e as FsError).reason ?? e}\n`); failed.add(c) }
  }
  return out
}
const failed = new WeakSet<Ctx>()
const status = (c: Ctx, ok = 0) => (failed.has(c) ? (failed.delete(c), ok || 1) : ok)
const fsErr = (c: Ctx, what: string, e: unknown) => { c.err(`${c.name}: ${what}: ${(e as FsError).reason ?? (e as Error).message}\n`); return 1 }
const quote = (s: string) => `'${s}'`

function regex(pat: string, o: { ere?: boolean; fixed?: boolean; icase?: boolean; word?: boolean; line?: boolean; global?: boolean }) {
  let src = o.fixed ? escapeRe(pat) : o.ere ? ereToJs(pat) : breToJs(pat)
  if (o.word) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`
  if (o.line) src = `^(?:${src})$`
  return new RegExp(src, (o.icase ? 'i' : '') + (o.global ? 'g' : ''))
}

// Daftar field cut: "1,3", "2-", "-3", "1-2,5"
function ranges(spec: string) {
  return spec.split(',').map(r => {
    const m = /^(\d*)(-?)(\d*)$/.exec(r)!
    const a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : Infinity) : a
    return [a, b] as const
  })
}
const inRanges = (rs: (readonly [number, number])[], i: number) => rs.some(([a, b]) => i >= a && i <= b)

// tr: perluas himpunan karakter (rentang, kelas POSIX, escape).
function trSet(s: string): string[] {
  const out: string[] = []
  s = s.replace(/\\(n|t|\\|r)/g, (_, e) => ({ n: '\n', t: '\t', '\\': '\\', r: '\r' } as Record<string, string>)[e])
  for (let i = 0; i < s.length; i++) {
    const cls = /^\[:(\w+):\]/.exec(s.slice(i))
    if (cls) {
      const map: Record<string, string> = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digit: '0123456789', space: ' \t\n\r\f\v', blank: ' \t', punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~' }
      map.alpha = map.upper + map.lower; map.alnum = map.alpha + map.digit
      out.push(...(map[cls[1]] ?? ''))
      i += cls[0].length - 1
      continue
    }
    if (s[i + 1] === '-' && i + 2 < s.length) {
      for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c))
      i += 2
      continue
    }
    out.push(s[i])
  }
  return out
}

// ---------------------------------------------------------------- sed
type SedCmd = { a1?: string; a2?: string; neg: boolean; cmd: string; arg?: string; re?: RegExp; rep?: string; flags?: string; nth?: number; inRange?: boolean; y?: [string, string] }
function sedParse(script: string, ere: boolean): SedCmd[] {
  const cmds: SedCmd[] = []
  let i = 0
  const s = script
  const ws = () => { while (i < s.length && /[ \t]/.test(s[i])) i++ }
  const addr = (): string | undefined => {
    if (s[i] === '$') { i++; return '$' }
    const m = /^\d+/.exec(s.slice(i))
    if (m) { i += m[0].length; return m[0] }
    if (s[i] === '/' || s[i] === '\\') {
      const d = s[i] === '\\' ? s[++i] : '/'
      i++
      let re = ''
      while (i < s.length && s[i] !== d) { if (s[i] === '\\' && s[i + 1] === d) { re += d; i += 2 } else if (s[i] === '\\') { re += s[i] + s[i + 1]; i += 2 } else re += s[i++] }
      i++
      return '/' + re
    }
  }
  const delimited = (d: string) => {
    let out = ''
    while (i < s.length && s[i] !== d) {
      if (s[i] === '\\' && s[i + 1] === d) { out += d; i += 2 }
      else if (s[i] === '\\' && s[i + 1] === 'n') { out += '\n'; i += 2 }
      else if (s[i] === '\\') { out += s[i] + s[i + 1]; i += 2 }
      else out += s[i++]
    }
    i++
    return out
  }
  while (i < s.length) {
    ws()
    if (s[i] === ';' || s[i] === '\n') { i++; continue }
    const c: SedCmd = { neg: false, cmd: '' }
    c.a1 = addr()
    if (c.a1 && s[i] === ',') { i++; c.a2 = addr() }
    ws()
    if (s[i] === '!') { c.neg = true; i++; ws() }
    c.cmd = s[i++]
    if (c.cmd === undefined) break
    if (c.cmd === 's') {
      const d = s[i++]
      const pat = delimited(d)
      c.rep = delimited(d)
      const fm = /^[gpiIw0-9]*/.exec(s.slice(i))![0]
      i += fm.length
      c.flags = fm
      c.nth = +(fm.match(/\d+/)?.[0] ?? 0)
      c.re = new RegExp(ere ? ereToJs(pat) : breToJs(pat), 'g' + (/[iI]/.test(fm) ? 'i' : ''))
    } else if (c.cmd === 'y') {
      const d = s[i++]
      c.y = [delimited(d), delimited(d)]
    } else if ('aic'.includes(c.cmd)) {
      if (s[i] === '\\') { i++; if (s[i] === '\n') i++ }
      ws()
      let t = ''
      while (i < s.length && s[i] !== '\n') t += s[i++]
      c.arg = t
    } else if (c.cmd === 'q' || c.cmd === 'Q') { const m = /^\s*\d+/.exec(s.slice(i)); if (m) { c.arg = m[0].trim(); i += m[0].length } }
    else if (!'dpPn=hHgGxlN{}'.includes(c.cmd)) throw new Error(`unknown command: \`${c.cmd}'`)
    cmds.push(c)
  }
  return cmds
}
function sedRun(cmds: SedCmd[], input: string, quiet: boolean, ere: boolean) {
  const ls = lines(input)
  const noNl = input !== '' && !input.endsWith('\n')
  let out = ''
  const match = (a: string, line: string, n: number) => a === '$' ? n === ls.length : a.startsWith('/') ? new RegExp(ere ? ereToJs(a.slice(1)) : breToJs(a.slice(1))).test(line) : n === +a
  const active = (c: SedCmd, line: string, n: number) => {
    let hit: boolean
    if (!c.a1) hit = true
    else if (!c.a2) hit = match(c.a1, line, n)
    else if (c.inRange) { hit = true; if (/^\d+$/.test(c.a2) ? n >= +c.a2 : match(c.a2, line, n)) c.inRange = false }
    else if (match(c.a1, line, n)) { hit = true; c.inRange = !(/^\d+$/.test(c.a2) && n >= +c.a2) && !(c.a2 !== '$' && !/^\d+$/.test(c.a2) ? false : c.a2 === '$' ? n === ls.length : false) }
    else hit = false
    return hit !== c.neg
  }
  let hold = ''
  for (let n = 1; n <= ls.length; n++) {
    let ps = ls[n - 1]
    let del = false, quit: string | null = null
    const after: string[] = []
    for (let k = 0; k < cmds.length && !del; k++) {
      const c = cmds[k]
      if (!active(c, ps, n)) continue
      switch (c.cmd) {
        case 's': {
          let count = 0, did = false
          ps = ps.replace(c.re!, (m: string, ...g: unknown[]) => {
            count++
            if (c.nth ? count !== c.nth : !c.flags!.includes('g') && count > 1) return m
            did = true
            const groups = g.slice(0, -2) as (string | undefined)[]
            return c.rep!.replace(/\\(\d)|\\&|\\n|&|\\\\/g, (x, d) => d ? groups[+d - 1] ?? '' : x === '\\&' ? '&' : x === '\\n' ? '\n' : x === '\\\\' ? '\\' : m)
          })
          if (did && c.flags!.includes('p')) out += ps + '\n'
          break
        }
        case 'y': { const [a, b] = c.y!; ps = [...ps].map(ch => { const i = a.indexOf(ch); return i < 0 ? ch : b[i] }).join(''); break }
        case 'd': del = true; break
        case 'p': out += ps + '\n'; break
        case '=': out += n + '\n'; break
        case 'a': after.push(c.arg!); break
        case 'i': out += c.arg + '\n'; break
        case 'c': if (!c.a2 || !c.inRange) out += c.arg + '\n'; del = true; break
        case 'q': quit = 'q'; break
        case 'Q': quit = 'Q'; del = true; break
        case 'h': hold = ps; break
        case 'H': hold += '\n' + ps; break
        case 'g': ps = hold; break
        case 'G': ps += '\n' + hold; break
        case 'x': [ps, hold] = [hold, ps]; break
        case 'n': if (!quiet) out += ps + '\n'; if (n < ls.length) ps = ls[n++]; break
      }
      if (quit) break
    }
    if (!del && !quiet) out += ps + (n === ls.length && noNl ? '' : '\n')
    for (const a of after) out += a + '\n'
    if (quit) break
  }
  return out
}

// ---------------------------------------------------------------- sort
function sortLines(ls: string[], o: Opts): string[] {
  const t = o.vals.t?.[0]
  const keys = (o.vals.k ?? []).map(k => { const [a, b] = k.split(','); const fa = parseInt(a), fb = b ? parseInt(b) : Infinity; return { fa, fb, n: /n/.test(k.replace(/^[\d.]+/, '')) || o.flags.has('n'), r: /r/.test(k.replace(/^[\d.,]+/, '')) } })
  const field = (s: string, f: number, end: number) => {
    if (t !== undefined) { const p = s.split(t); return p.slice(f - 1, end === Infinity ? undefined : end).join(t) }
    // Tanpa -t: field = blank di depan + non-blank (GNU).
    const parts = s.match(/[ \t]*[^ \t]+/g) ?? []
    return parts.slice(f - 1, end === Infinity ? undefined : end).join('')
  }
  const num = (s: string) => { const m = /^\s*(-?\d*\.?\d+)/.exec(s); return m ? parseFloat(m[1]) : 0 }
  const fold = o.flags.has('f')
  const cmpStr = (a: string, b: string) => { if (fold) { a = a.toUpperCase(); b = b.toUpperCase() } return a < b ? -1 : a > b ? 1 : 0 }
  const cmpKey = (a: string, b: string) => {
    if (keys.length) {
      for (const k of keys) {
        const x = field(a, k.fa, k.fb), y = field(b, k.fa, k.fb)
        let c = k.n ? num(x) - num(y) : cmpStr(x, y)
        if (k.r) c = -c
        if (c) return Math.sign(c)
      }
      return 0
    }
    return o.flags.has('n') ? Math.sign(num(a) - num(b)) : cmpStr(a, b)
  }
  const rev = o.flags.has('r') ? -1 : 1
  const last = !(o.flags.has('s') || o.flags.has('u'))
  const sorted = ls.map((l, i) => [l, i] as const).sort(([a, i], [b, j]) => {
    const c = cmpKey(a, b)
    if (c) return c * rev
    if (last) { const d = a < b ? -1 : a > b ? 1 : 0; return d * rev }
    return i - j
  }).map(([l]) => l)
  if (o.flags.has('u')) return sorted.filter((l, i) => i === 0 || cmpKey(sorted[i - 1], l) !== 0)
  return sorted
}

// ---------------------------------------------------------------- ls & find
function lsLong(n: FNode, name: string, size = 0) {
  const links = n.type === 'dir' ? 2 + [...n.children.values()].filter(c => c.type === 'dir').length : 1
  return `${modeString(n)} ${links} ${n.owner} ${n.group} ${String(size).padStart(4)} Oct 30 09:00 ${name}`
}
const sizeOf = (n: FNode) => (n.type === 'dir' ? 4096 : n.content.length)

function chmodApply(mode: number, spec: string, isDir: boolean): number {
  if (/^[0-7]+$/.test(spec)) return parseInt(spec, 8)
  for (const part of spec.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(part)
    if (!m) throw new Error(`invalid mode: ${quote(spec)}`)
    const who = m[1] || 'a'
    let bits = 0
    for (const p of m[3]) {
      const b = p === 'r' ? 4 : p === 'w' ? 2 : p === 'x' || (p === 'X' && (isDir || mode & 0o111)) ? 1 : 0
      for (const w of who === 'a' ? 'ugo' : who) bits |= b << (w === 'u' ? 6 : w === 'g' ? 3 : 0)
      if (p === 's') bits |= (who.includes('u') || who === 'a' ? 0o4000 : 0) | (who.includes('g') ? 0o2000 : 0)
      if (p === 't') bits |= 0o1000
    }
    if (m[2] === '+') mode |= bits
    else if (m[2] === '-') mode &= ~bits
    else { let clear = 0; for (const w of who === 'a' ? 'ugo' : who) clear |= 7 << (w === 'u' ? 6 : w === 'g' ? 3 : 0); mode = (mode & ~clear) | bits }
  }
  return mode
}

// ---------------------------------------------------------------- perintah
const C: Record<string, Command> = {}

C.cat = c => {
  const o = opts(c.args, 'nbAsE')
  let out = '', n = 0
  for (const f of inputs(c, o.rest)) {
    if (o.flags.has('n') || o.flags.has('b')) {
      const ls = f.data.split('\n')
      const tail = ls.pop()
      out += ls.map(l => (o.flags.has('b') && !l ? '' : `${String(++n).padStart(6)}\t`) + l + '\n').join('')
      if (tail) out += `${String(++n).padStart(6)}\t${tail}`
    } else out += f.data
  }
  c.out(out)
  return status(c)
}
C.fold = c => {
  const o = opts(c.args, 'w:s')
  const w = +(o.vals.w?.[0] ?? 80)
  for (const f of inputs(c, o.rest)) c.out(f.data.split('\n').map(l => l.match(new RegExp(`.{1,${w}}`, 'g'))?.join('\n') ?? l).join('\n'))
  return status(c)
}
C.tac = c => { for (const f of inputs(c, c.args)) c.out(nl(lines(f.data).reverse())); return status(c) }
C.rev = c => { for (const f of inputs(c, c.args)) c.out(nl(lines(f.data).map(l => [...l].reverse().join('')))); return status(c) }
C.nl = c => {
  let n = 0
  for (const f of inputs(c, c.args)) c.out(nl(lines(f.data).map(l => (l ? `${String(++n).padStart(6)}\t${l}` : '       '.slice(0, 7)))))
  return status(c)
}
const headTail = (tail: boolean): Command => c => {
  const o = opts(c.args, 'n:c:qvf', true)
  const nv = o.vals.n?.[0] ?? '10'
  const files = inputs(c, o.rest)
  files.forEach((f, i) => {
    if (files.length > 1) c.out(`${i ? '\n' : ''}==> ${f.name === '-' ? 'standard input' : f.name} <==\n`)
    if (o.vals.c) { const k = +o.vals.c[0]; c.out(tail ? f.data.slice(-k) : f.data.slice(0, k)); return }
    const ls = f.data.split('\n')
    const endsNl = f.data.endsWith('\n')
    if (endsNl) ls.pop()
    let pick: string[]
    if (tail) pick = nv.startsWith('+') ? ls.slice(Math.max(0, +nv.slice(1) - 1)) : ls.slice(Math.max(0, ls.length - Math.abs(+nv)))
    else pick = nv.startsWith('-') ? ls.slice(0, Math.max(0, ls.length - +nv.slice(1))) : ls.slice(0, +nv)
    const lastIncluded = pick.length && (tail || pick.length === ls.length)
    c.out(pick.join('\n') + (pick.length && (endsNl || !lastIncluded) ? '\n' : ''))
  })
  return status(c)
}
C.head = headTail(false)
C.tail = headTail(true)
C.wc = c => {
  const o = opts(c.args, 'lwcmL')
  let sel = ['l', 'w', 'c'].filter(f => o.flags.has(f) || (f === 'c' && o.flags.has('m')))
  if (!sel.length) sel = ['l', 'w', 'c']
  const files = inputs(c, o.rest)
  const rows = files.map(f => ({ name: f.name, l: (f.data.match(/\n/g) ?? []).length, w: (f.data.match(/\S+/g) ?? []).length, c: new TextEncoder().encode(f.data).length, regular: f.regular }))
  if (rows.length > 1) rows.push({ name: 'total', l: rows.reduce((s, r) => s + r.l, 0), w: rows.reduce((s, r) => s + r.w, 0), c: rows.reduce((s, r) => s + r.c, 0), regular: true })
  let width = 1
  if (sel.length > 1 || rows.length > 1) {
    const reg = files.filter(f => f.regular).reduce((s, f) => s + new TextEncoder().encode(f.data).length, 0)
    width = String(reg).length
    if (files.some(f => !f.regular)) width = Math.max(width, 7)
  }
  for (const r of rows) c.out(sel.map(k => String(r[k as 'l']).padStart(width)).join(' ') + (r.name === '-' && !o.rest.length ? '' : ' ' + r.name) + '\n')
  return status(c)
}
C.grep = c => {
  const o = opts(c.args, 'ivnclLohHqrRwxEFsAe:m:B:C:')
  const pats = o.vals.e ?? (o.rest.length ? [o.rest.shift()!] : [])
  if (!pats.length) { c.err('Usage: grep [OPTION]... PATTERNS [FILE]...\n'); return 2 }
  const ere = o.flags.has('E')
  const res = pats.flatMap(p => p.split('\n')).map(p => { try { return regex(p, { ere, fixed: o.flags.has('F'), icase: o.flags.has('i'), word: o.flags.has('w'), line: o.flags.has('x') }) } catch { return null } })
  if (res.some(r => !r)) { c.err('grep: Invalid regular expression\n'); return 2 }
  const recursive = o.flags.has('r') || o.flags.has('R')
  let targets = o.rest
  if (recursive && !targets.length) targets = ['.']
  const files: { name: string; data: string }[] = []
  if (recursive) {
    const walk = (p: string) => {
      const abs = c.sh.abs(p)
      let n
      try { n = c.sh.fs.stat(c.sh.user, abs) } catch (e) { c.err(`grep: ${p}: ${(e as FsError).reason}\n`); failed.add(c); return }
      if (n.type === 'file') { try { files.push({ name: p, data: c.sh.fs.read(c.sh.user, abs) }) } catch (e) { c.err(`grep: ${p}: ${(e as FsError).reason}\n`); failed.add(c) } return }
      let names: string[]
      try { names = c.sh.fs.list(c.sh.user, abs) } catch (e) { c.err(`grep: ${p}: ${(e as FsError).reason}\n`); failed.add(c); return }
      for (const nm of names) walk(p === '.' && !o.rest.length ? nm : `${p.replace(/\/$/, '')}/${nm}`)
    }
    targets.forEach(walk)
  } else for (const f of inputs(c, targets)) files.push(f)
  const prefix = !o.flags.has('h') && (o.flags.has('H') || files.length > 1 || recursive)
  let any = false
  const max = o.vals.m ? +o.vals.m[0] : Infinity
  for (const f of files) {
    const ls = lines(f.data)
    let count = 0
    for (let i = 0; i < ls.length && count < max; i++) {
      const l = ls[i]
      const hit = res.some(r => r!.test(l)) !== o.flags.has('v')
      if (!hit) continue
      count++
      any = true
      if (o.flags.has('q')) return 0
      if (o.flags.has('c') || o.flags.has('l') || o.flags.has('L')) continue
      const pre = (prefix ? f.name + ':' : '') + (o.flags.has('n') ? i + 1 + ':' : '')
      if (o.flags.has('o') && !o.flags.has('v')) {
        for (const r of res) for (const m of l.matchAll(new RegExp(r!.source, r!.flags + 'g'))) if (m[0]) c.out(pre + m[0] + '\n')
      } else c.out(pre + l + '\n')
    }
    if (o.flags.has('c')) c.out((prefix ? f.name + ':' : '') + count + '\n')
    if (o.flags.has('l') && count) c.out(f.name + '\n')
    if (o.flags.has('L') && !count) c.out(f.name + '\n')
  }
  return failed.has(c) ? (failed.delete(c), 2) : any ? 0 : 1
}
C.egrep = c => C.grep({ ...c, args: ['-E', ...c.args], name: 'grep' })
C.sort = c => {
  const o = opts(c.args, 'nrufbsk:t:o:hV')
  const all = inputs(c, o.rest).flatMap(f => lines(f.data))
  const out = nl(sortLines(all, o))
  if (o.vals.o) { try { c.sh.fs.write(c.sh.user, c.sh.abs(o.vals.o[0]), out) } catch (e) { return fsErr(c, o.vals.o[0], e) } }
  else c.out(out)
  return status(c)
}
C.uniq = c => {
  const o = opts(c.args, 'cdui')
  const [f] = inputs(c, o.rest.slice(0, 1))
  if (!f) return 1
  const ls = lines(f.data)
  const groups: [string, number][] = []
  const eq = (a: string, b: string) => (o.flags.has('i') ? a.toLowerCase() === b.toLowerCase() : a === b)
  for (const l of ls) { const g = groups[groups.length - 1]; if (g && eq(g[0], l)) g[1]++; else groups.push([l, 1]) }
  const out = groups.filter(([, n]) => (o.flags.has('d') ? n > 1 : o.flags.has('u') ? n === 1 : true)).map(([l, n]) => (o.flags.has('c') ? `${String(n).padStart(7)} ${l}` : l))
  c.out(nl(out))
  return 0
}
C.cut = c => {
  const o = opts(c.args, 'd:f:c:b:s')
  const d = o.vals.d?.[0] ?? '\t'
  for (const f of inputs(c, o.rest)) {
    for (const l of lines(f.data)) {
      if (o.vals.c || o.vals.b) { const rs = ranges((o.vals.c ?? o.vals.b)[0]); c.out([...l].filter((_, i) => inRanges(rs, i + 1)).join('') + '\n'); continue }
      if (!o.vals.f) { c.err('cut: you must specify a list of bytes, characters, or fields\n'); return 1 }
      if (!l.includes(d)) { if (!o.flags.has('s')) c.out(l + '\n'); continue }
      const rs = ranges(o.vals.f[0])
      c.out(l.split(d).filter((_, i) => inRanges(rs, i + 1)).join(d) + '\n')
    }
  }
  return status(c)
}
C.paste = c => {
  const o = opts(c.args, 'd:s')
  const d = (o.vals.d?.[0] ?? '\t').replace(/\\t/g, '\t').replace(/\\n/g, '\n')
  const fs = inputs(c, o.rest).map(f => lines(f.data))
  if (o.flags.has('s')) { for (const ls of fs) c.out(ls.map((l, i) => (i ? d[(i - 1) % d.length] : '') + l).join('') + '\n'); return 0 }
  const n = Math.max(0, ...fs.map(f => f.length))
  for (let i = 0; i < n; i++) c.out(fs.map((f, j) => (j ? d[(j - 1) % d.length] : '') + (f[i] ?? '')).join('') + '\n')
  return 0
}
C.tr = c => {
  const o = opts(c.args, 'dsc')
  let set1 = trSet(o.rest[0] ?? '')
  const set2 = trSet(o.rest[1] ?? '')
  const data = readAll(c.stdin)
  const comp = o.flags.has('c') || o.flags.has('C')
  const inSet1 = (ch: string) => set1.includes(ch) !== comp
  let out = ''
  if (o.flags.has('d')) {
    for (const ch of data) if (!inSet1(ch)) out += ch
    if (o.flags.has('s') && set2.length) out = out.replace(new RegExp(`([${set2.map(escapeRe).join('')}])\\1+`, 'g'), '$1')
  } else if (set2.length) {
    if (comp) set1 = []
    for (const ch of data) {
      if (comp) { out += set1.includes(ch) || !inSet1(ch) ? ch : set2[set2.length - 1]; continue }
      const i = set1.indexOf(ch)
      out += i < 0 ? ch : set2[Math.min(i, set2.length - 1)]
    }
    if (o.flags.has('s')) out = out.replace(new RegExp(`([${set2.map(escapeRe).join('')}])\\1+`, 'g'), '$1')
  } else if (o.flags.has('s')) out = data.replace(new RegExp(`([${set1.map(escapeRe).join('')}])\\1+`, 'g'), '$1')
  else out = data
  c.out(out)
  return 0
}
C.sed = c => {
  const scripts: string[] = []
  let quiet = false, ere = false, inplace = false
  const files: string[] = []
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i]
    if (a === '-e') scripts.push(c.args[++i])
    else if (a === '-n') quiet = true
    else if (a === '-E' || a === '-r') ere = true
    else if (a === '-i') inplace = true
    else if (/^-[nEri]+$/.test(a)) { if (a.includes('n')) quiet = true; if (/[Er]/.test(a)) ere = true; if (a.includes('i')) inplace = true }
    else if (!scripts.length && !c.args.slice(0, i).includes('-e')) scripts.push(a)
    else files.push(a)
  }
  let cmds
  try { cmds = sedParse(scripts.join('\n'), ere) } catch (e) { c.err(`sed: -e expression #1: ${(e as Error).message}\n`); return 1 }
  if (inplace) {
    for (const f of files) { try { const abs = c.sh.abs(f); c.sh.fs.write(c.sh.user, abs, sedRun(cmds.map(x => ({ ...x })), c.sh.fs.read(c.sh.user, abs), quiet, ere)) } catch (e) { return fsErr(c, f, e) } }
    return 0
  }
  const data = inputs(c, files).map(f => f.data).join('')
  c.out(sedRun(cmds, data, quiet, ere))
  return status(c)
}
C.awk = c => {
  const vars: Record<string, string> = {}
  let fs: string | undefined, prog: string | undefined
  const files: string[] = []
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i]
    if (a === '-F') fs = c.args[++i]
    else if (a.startsWith('-F')) fs = a.slice(2)
    else if (a === '-v') { const [k, ...v] = c.args[++i].split('='); vars[k] = v.join('=') }
    else if (prog === undefined) prog = a
    else files.push(a)
  }
  if (fs === 't' || fs === '\\t') fs = '\t'
  try {
    const r = awk(prog ?? '', inputs(c, files).map(f => ({ name: f.name === '-' ? '' : f.name, data: f.data })), { fs, vars })
    c.out(r.out)
    for (const [name, f] of Object.entries(r.files)) c.sh.fs.write(c.sh.user, c.sh.abs(name), f.data, f.append)
    return r.code || status(c)
  } catch (e) {
    if (e instanceof AwkError) { c.err(`awk: ${e.message}\n`); return 2 }
    throw e
  }
}
C.gawk = C.awk
C.tee = c => {
  const o = opts(c.args, 'a')
  const data = readAll(c.stdin)
  for (const f of o.rest) { try { c.sh.fs.write(c.sh.user, c.sh.abs(f), data, o.flags.has('a')) } catch (e) { fsErr(c, f, e) } }
  c.out(data)
  return 0
}
C.seq = c => {
  const o = opts(c.args.filter(a => !/^-\d/.test(a) || c.args.indexOf(a) > 0), 's:w')
  const nums = c.args.filter(a => /^-?\d+(\.\d+)?$/.test(a)).map(Number)
  const [first, inc, last] = nums.length === 1 ? [1, 1, nums[0]] : nums.length === 2 ? [nums[0], 1, nums[1]] : nums
  const sep = o.vals.s?.[0] ?? '\n'
  const out: string[] = []
  for (let x = first; inc > 0 ? x <= last : x >= last; x += inc) out.push(String(Math.round(x * 1e9) / 1e9))
  const w = o.flags.has('w') ? Math.max(...out.map(s => s.length)) : 0
  if (out.length) c.out(out.map(s => s.padStart(w, '0')).join(sep) + '\n')
  return 0
}
C.expr = c => {
  const a = c.args
  let r: string
  if (a[0] === 'length') r = String(a[1]?.length ?? 0)
  else if (a.length === 1) r = a[0]
  else {
    const [x, op, y] = a
    const nx = +x, ny = +y
    switch (op) {
      case '+': r = String(nx + ny); break
      case '-': r = String(nx - ny); break
      case '*': r = String(nx * ny); break
      case '/': if (!ny) { c.err('expr: division by zero\n'); return 2 } r = String(Math.trunc(nx / ny)); break
      case '%': r = String(nx % ny); break
      case '=': r = String(+(x === y)); break
      case '!=': r = String(+(x !== y)); break
      case '<': r = String(+(isNaN(nx) || isNaN(ny) ? x < y : nx < ny)); break
      case '>': r = String(+(isNaN(nx) || isNaN(ny) ? x > y : nx > ny)); break
      case '<=': r = String(+(nx <= ny)); break
      case '>=': r = String(+(nx >= ny)); break
      default: c.err('expr: syntax error\n'); return 2
    }
  }
  c.out(r + '\n')
  return r === '0' || r === '' ? 1 : 0
}
C.basename = c => { const [p, suf] = c.args; let b = VFS.base(p.replace(/\/+$/, '') || '/'); if (suf && b.endsWith(suf) && b !== suf) b = b.slice(0, -suf.length); c.out(b + '\n'); return 0 }
C.dirname = c => { const p = c.args[0].replace(/\/+$/, ''); const i = p.lastIndexOf('/'); c.out((i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i)) + '\n'); return 0 }
C.realpath = c => { for (const a of c.args) c.out(c.sh.abs(a) + '\n'); return 0 }
C.readlink = c => { for (const a of c.args.filter(x => !x.startsWith('-'))) c.out(c.sh.abs(a) + '\n'); return 0 }

C.ls = c => {
  const o = opts(c.args, 'alAhRd1rtS')
  const targets = o.rest.length ? o.rest : ['.']
  const fs = c.sh.fs
  let st = 0
  const showAll = o.flags.has('a'), almost = o.flags.has('A')
  const fileArgs: string[] = [], dirArgs: string[] = []
  for (const t of targets) {
    try { const n = fs.stat(c.sh.user, c.sh.abs(t)); (n.type === 'dir' && !o.flags.has('d') ? dirArgs : fileArgs).push(t) }
    catch (e) { c.err(`ls: cannot access ${quote(t)}: ${(e as FsError).reason}\n`); st = 2 }
  }
  const render = (entries: { name: string; n: FNode }[]) => {
    if (o.flags.has('r')) entries.reverse()
    if (o.flags.has('l')) return entries.map(e => lsLong(e.n, e.name, sizeOf(e.n)) + '\n').join('')
    return entries.map(e => e.name + '\n').join('')
  }
  c.out(render(fileArgs.sort().map(f => ({ name: f, n: fs.stat(c.sh.user, c.sh.abs(f)) }))))
  dirArgs.sort().forEach((d, i) => {
    const abs = c.sh.abs(d)
    let names: string[]
    try { names = fs.list(c.sh.user, abs) } catch (e) { c.err(`ls: cannot open directory ${quote(d)}: ${(e as FsError).reason}\n`); st = 2; return }
    const dn = fs.get(abs)!
    const entries = [...(showAll ? [{ name: '.', n: dn }, { name: '..', n: fs.get(VFS.parent(abs))! }] : []), ...names.filter(nm => showAll || almost || !nm.startsWith('.')).map(nm => ({ name: nm, n: dn.children.get(nm)! }))]
    if (dirArgs.length + fileArgs.length > 1) c.out(`${i || fileArgs.length ? '\n' : ''}${d}:\n`)
    if (o.flags.has('l')) c.out(`total ${entries.reduce((s, e) => s + (e.n.type === 'dir' ? 4 : Math.ceil(e.n.content.length / 4096) * 4), 0)}\n`)
    c.out(render(entries))
  })
  return st
}
C.dir = C.ls
C.touch = c => {
  for (const f of c.args.filter(a => !a.startsWith('-'))) {
    const abs = c.sh.abs(f)
    try { if (!c.sh.fs.get(abs)) c.sh.fs.write(c.sh.user, abs, ''); else c.sh.fs.stat(c.sh.user, abs).mtime = Date.UTC(2026, 9, 30, 9, 0) }
    catch (e) { c.err(`touch: cannot touch ${quote(f)}: ${(e as FsError).reason}\n`); return 1 }
  }
  return 0
}
C.mkdir = c => {
  const o = opts(c.args, 'pvm:')
  let st = 0
  for (const d of o.rest) {
    try { c.sh.fs.mkdir(c.sh.user, c.sh.abs(d), o.flags.has('p')); if (o.flags.has('v')) c.out(`mkdir: created directory ${quote(d)}\n`) }
    catch (e) { c.err(`mkdir: cannot create directory ${quote(d)}: ${(e as FsError).reason}\n`); st = 1 }
  }
  return st
}
C.rmdir = c => { for (const d of c.args) { try { c.sh.fs.rmdir(c.sh.user, c.sh.abs(d)) } catch (e) { c.err(`rmdir: failed to remove ${quote(d)}: ${(e as FsError).reason}\n`); return 1 } } return 0 }
C.rm = c => {
  const o = opts(c.args, 'rRfiv')
  const rec = o.flags.has('r') || o.flags.has('R')
  let st = 0
  for (const f of o.rest) {
    const abs = c.sh.abs(f)
    if (!c.sh.fs.get(abs)) { if (!o.flags.has('f')) { c.err(`rm: cannot remove ${quote(f)}: No such file or directory\n`); st = 1 } continue }
    if (c.sh.fs.get(abs)!.type === 'dir' && !rec) { c.err(`rm: cannot remove ${quote(f)}: Is a directory\n`); st = 1; continue }
    try { c.sh.fs.remove(c.sh.user, abs, rec); if (o.flags.has('v')) c.out(`removed ${quote(f)}\n`) } catch (e) { c.err(`rm: cannot remove ${quote(f)}: ${(e as FsError).reason}\n`); st = 1 }
  }
  return st
}
C.cp = c => {
  const o = opts(c.args, 'rRaivpf')
  const [dst, ...srcs] = [...o.rest].reverse()
  if (!srcs.length) { c.err(`cp: missing destination file operand after ${quote(dst ?? '')}\n`); return 1 }
  for (const s of srcs.reverse()) {
    try {
      if (c.sh.fs.stat(c.sh.user, c.sh.abs(s)).type === 'dir' && !(o.flags.has('r') || o.flags.has('R') || o.flags.has('a'))) { c.err(`cp: -r not specified; omitting directory ${quote(s)}\n`); return 1 }
      c.sh.fs.copy(c.sh.user, c.sh.abs(s), c.sh.abs(dst), true)
    } catch (e) { c.err(`cp: cannot stat ${quote(s)}: ${(e as FsError).reason}\n`); return 1 }
  }
  return 0
}
C.mv = c => {
  const o = opts(c.args, 'fivn')
  const [dst, ...srcs] = [...o.rest].reverse()
  for (const s of srcs.reverse()) { try { c.sh.fs.move(c.sh.user, c.sh.abs(s), c.sh.abs(dst)) } catch (e) { c.err(`mv: cannot move ${quote(s)}: ${(e as FsError).reason}\n`); return 1 } }
  return 0
}
C.chmod = c => {
  const o = opts(c.args.filter(a => !/^[-+=][rwxXst]+$/.test(a)), 'Rv')
  const symbolic = c.args.find(a => /^[-+=][rwxXst]+$/.test(a))
  const [spec, ...files] = symbolic ? [symbolic, ...o.rest] : o.rest
  for (const f of files) {
    try {
      const n = c.sh.fs.stat(c.sh.user, c.sh.abs(f))
      if (c.sh.user !== 'root' && n.owner !== c.sh.user) { c.err(`chmod: changing permissions of ${quote(f)}: Operation not permitted\n`); return 1 }
      const apply = (x: FNode) => { x.mode = chmodApply(x.mode, spec, x.type === 'dir'); if (o.flags.has('R') && x.type === 'dir') x.children.forEach(apply) }
      apply(n)
    } catch (e) { if (e instanceof FsError) { c.err(`chmod: cannot access ${quote(f)}: ${e.reason}\n`); return 1 } c.err(`chmod: ${(e as Error).message}\n`); return 1 }
  }
  return 0
}
C.chown = c => {
  const o = opts(c.args, 'R')
  const [spec, ...files] = o.rest
  const [u, g] = spec.split(':')
  for (const f of files) {
    try {
      const n = c.sh.fs.stat(c.sh.user, c.sh.abs(f))
      if (c.sh.user !== 'root') { c.err(`chown: changing ownership of ${quote(f)}: Operation not permitted\n`); return 1 }
      if (u) n.owner = u
      if (g) n.group = g
    } catch (e) { return fsErr(c, `cannot access ${quote(f)}`, e) }
  }
  return 0
}
C.stat = c => {
  const o = opts(c.args, 'c:')
  for (const f of o.rest) {
    let n: FNode
    try { n = c.sh.fs.stat(c.sh.user, c.sh.abs(f)) } catch (e) { c.err(`stat: cannot statx ${quote(f)}: ${(e as FsError).reason}\n`); return 1 }
    if (o.vals.c) {
      c.out(o.vals.c[0].replace(/%([aAUGnsFi])/g, (_, k) => ({ a: (n.mode & 0o7777).toString(8), A: modeString(n), U: n.owner, G: n.group, n: f, s: String(sizeOf(n)), F: n.type === 'dir' ? 'directory' : n.content ? 'regular file' : 'regular empty file', i: '1' } as Record<string, string>)[k]) + '\n')
    } else c.out(`  File: ${f}\n  Size: ${sizeOf(n)}\n Access: (${(n.mode & 0o7777).toString(8).padStart(4, '0')}/${modeString(n)})  Uid: ${n.owner}  Gid: ${n.group}\n`)
  }
  return 0
}
C.find = c => {
  const args = c.args
  const paths: string[] = []
  let i = 0
  while (i < args.length && !args[i].startsWith('-') && args[i] !== '!' && args[i] !== '(') paths.push(args[i++])
  if (!paths.length) paths.push('.')
  type Test = (p: string, n: FNode, depth: number) => boolean
  let maxdepth = Infinity, mindepth = 0
  const actions: ((p: string, n: FNode) => Promise<void> | void)[] = []
  // Ekspresi: tes digabung AND, -o untuk OR, ! / -not untuk negasi.
  const orGroups: Test[][] = [[]]
  let negate = false
  const add = (t: Test) => { const neg = negate; negate = false; orGroups[orGroups.length - 1].push(neg ? (p, n, d) => !t(p, n, d) : t) }
  for (; i < args.length; i++) {
    const a = args[i]
    switch (a) {
      case '!': case '-not': negate = true; break
      case '-o': case '-or': orGroups.push([]); break
      case '-a': case '-and': break
      case '-name': { const re = new RegExp(`^${globToRe(args[++i])}$`); add(p => re.test(VFS.base(p))); break }
      case '-iname': { const re = new RegExp(`^${globToRe(args[++i])}$`, 'i'); add(p => re.test(VFS.base(p))); break }
      case '-path': { const re = new RegExp(`^${globToRe(args[++i])}$`); add(p => re.test(p)); break }
      case '-type': { const t = args[++i]; add((_, n) => (t === 'd' ? n.type === 'dir' : t === 'f' ? n.type === 'file' : false)); break }
      case '-maxdepth': maxdepth = +args[++i]; break
      case '-mindepth': mindepth = +args[++i]; break
      case '-user': { const u = args[++i]; add((_, n) => n.owner === u); break }
      case '-group': { const g = args[++i]; add((_, n) => n.group === g); break }
      case '-empty': add((_, n) => (n.type === 'dir' ? n.children.size === 0 : n.content.length === 0)); break
      case '-perm': {
        const s = args[++i]
        const body = s.replace(/^[-/]/, '')
        // Angka oktal (644) atau simbolik (o=r, u+s, g=w,o=w) seperti GNU find.
        const mode = /^[0-7]+$/.test(body) ? parseInt(body, 8) : body.split(',').reduce((m, part) => {
          const x = /^([ugoa]*)[=+]([rwxst]*)$/.exec(part)
          if (!x) return m
          const who = x[1] || 'a', bits = x[2]
          for (const w of who === 'a' ? 'ugo' : who) {
            const shift = { u: 6, g: 3, o: 0 }[w as 'u' | 'g' | 'o']
            for (const b of bits) m |= b === 'r' ? 4 << shift : b === 'w' ? 2 << shift : b === 'x' ? 1 << shift : b === 's' ? (w === 'u' ? 0o4000 : w === 'g' ? 0o2000 : 0) : b === 't' ? 0o1000 : 0
          }
          return m
        }, 0)
        add((_, n) => (s[0] === '-' ? (n.mode & mode) === mode : s[0] === '/' ? (n.mode & mode) !== 0 : (n.mode & 0o7777) === mode))
        break
      }
      case '-size': {
        const s = args[++i]
        const m = /^([-+]?)(\d+)([ckM]?)$/.exec(s)
        if (!m) break
        const unit = m[3] === 'c' ? 1 : m[3] === 'k' ? 1024 : m[3] === 'M' ? 1048576 : 512
        add((_, n) => { const sz = Math.ceil(sizeOf(n) / unit); return m[1] === '+' ? sz > +m[2] : m[1] === '-' ? sz < +m[2] : sz === +m[2] })
        break
      }
      case '-print': break
      case '-delete': actions.push(p => { c.sh.fs.remove(c.sh.user, c.sh.abs(p), true) }); break
      case '-exec': {
        const cmd: string[] = []
        while (++i < args.length && args[i] !== ';' && args[i] !== '+') cmd.push(args[i])
        actions.push(async p => { await c.sh.invoke(cmd.map(x => x.replace('{}', p)), c) })
        break
      }
      default: c.err(`find: unknown predicate ${quote(a)}\n`); return 1
    }
  }
  const match: Test = (p, n, d) => orGroups.some(g => g.every(t => t(p, n, d)))
  const found: [string, FNode][] = []
  let st = 0
  const walk = (p: string, n: FNode, depth: number) => {
    if (depth >= mindepth && match(p, n, depth)) found.push([p, n])
    if (n.type !== 'dir' || depth >= maxdepth) return
    if (!c.sh.fs.can(c.sh.user, n, 4) || !c.sh.fs.can(c.sh.user, n, 1)) { c.err(`find: ${quote(p)}: Permission denied\n`); st = 1; return }
    for (const k of [...n.children.keys()].sort()) walk(p === '/' ? '/' + k : `${p.replace(/\/$/, '')}/${k}`, n.children.get(k)!, depth + 1)
  }
  for (const p of paths) {
    try { walk(p, c.sh.fs.stat(c.sh.user, c.sh.abs(p)), 0) } catch (e) { c.err(`find: ${quote(p)}: ${(e as FsError).reason}\n`); st = 1 }
  }
  return (async () => {
    for (const [p, n] of found) {
      if (actions.length) { for (const a of actions) await a(p, n) } else c.out(p + '\n')
    }
    return st
  })()
}
C.xargs = async c => {
  // Opsi xargs berhenti di nama perintah pertama (opsi milik perintah itu, mis. rm -r, tidak ikut diparse).
  let k = 0
  while (k < c.args.length && c.args[k].startsWith('-')) k += /^-[nI]$/.test(c.args[k]) ? 2 : 1
  const o = { ...opts(c.args.slice(0, k), 'n:I:0'), rest: c.args.slice(k) }
  const cmd = o.rest.length ? o.rest : ['echo']
  const data = readAll(c.stdin)
  const items = o.vals.I ? lines(data) : data.split(/\s+/).filter(Boolean)
  let st = 0
  if (o.vals.I) { for (const it of items) st = await c.sh.invoke(cmd.map(x => x.split(o.vals.I[0]).join(it)), c) || st; return st }
  const n = o.vals.n ? +o.vals.n[0] : items.length || 1
  for (let i = 0; i < Math.max(items.length, 1); i += n) st = await c.sh.invoke([...cmd, ...items.slice(i, i + n)], c) || st
  return st
}
C.whoami = c => { c.out(c.sh.user + '\n'); return 0 }
C.id = c => {
  const u = c.sh.fs.user(c.args[0] ?? c.sh.user)
  const gid = (g: string) => (g === 'root' ? 0 : g === u.name ? u.uid : 1000 + c.sh.fs.users.flatMap(x => x.groups).indexOf(g))
  c.out(`uid=${u.uid}(${u.name}) gid=${gid(u.groups[0])}(${u.groups[0]}) groups=${u.groups.map(g => `${gid(g)}(${g})`).join(',')}\n`)
  return 0
}
C.groups = c => { c.out(c.sh.fs.user(c.args[0] ?? c.sh.user).groups.join(' ') + '\n'); return 0 }
C.hostname = c => { c.out('kisatsutai\n'); return 0 }
C.uname = c => { c.out(c.args.includes('-a') ? 'Linux kisatsutai 6.8.0-slayer #1 SMP x86_64 GNU/Linux\n' : c.args.includes('-r') ? '6.8.0-slayer\n' : 'Linux\n'); return 0 }
C.env = c => { if (c.args.length) return c.sh.invoke(c.args, c); for (const [k, v] of Object.entries(c.sh.env()).sort()) c.out(`${k}=${v}\n`); return 0 }
C.printenv = c => { const e = c.sh.env(); if (c.args.length) { const v = e[c.args[0]]; if (v === undefined) return 1; c.out(v + '\n'); return 0 } for (const [k, v] of Object.entries(e).sort()) c.out(`${k}=${v}\n`); return 0 }
C.which = c => { let st = 0; for (const a of c.args) { if (C[a] || c.sh.binaries[a]) c.out(`/usr/bin/${a}\n`); else st = 1 } return st }
C.date = c => {
  const d = new Date()
  const f = c.args.find(a => a.startsWith('+'))
  const p = (n: number) => String(n).padStart(2, '0')
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (f) c.out(f.slice(1).replace(/%([YmdHMSjaAbBsF%T])/g, (_, k) => ({ Y: String(d.getFullYear()), m: p(d.getMonth() + 1), d: p(d.getDate()), H: p(d.getHours()), M: p(d.getMinutes()), S: p(d.getSeconds()), a: DAYS[d.getDay()], b: MON[d.getMonth()], s: String(Math.floor(d.getTime() / 1000)), F: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, T: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, '%': '%' } as Record<string, string>)[k] ?? k) + '\n')
  else c.out(`${DAYS[d.getDay()]} ${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} WIB ${d.getFullYear()}\n`)
  return 0
}
C.sleep = () => 0
C.clear = c => { c.sh.cleared = true; return 0 }
C.yes = c => { const s = (c.args.join(' ') || 'y') + '\n'; c.out(s.repeat(1000)); return 0 }
C.sha256sum = c => { for (const f of inputs(c, c.args.filter(a => !a.startsWith('-')))) c.out(`${sha256(f.data)}  ${f.name}\n`); return status(c) }
C.md5sum = c => { for (const f of inputs(c, c.args.filter(a => !a.startsWith('-')))) c.out(`${md5(f.data)}  ${f.name}\n`); return status(c) }
C.base64 = c => {
  const o = opts(c.args, 'dw:i')
  const data = inputs(c, o.rest).map(f => f.data).join('')
  if (o.flags.has('d')) { try { c.out(b64decode(data)) } catch { c.err('base64: invalid input\n'); return 1 } return 0 }
  const enc = b64encode(data)
  const w = o.vals.w ? +o.vals.w[0] : 76
  c.out((w ? enc.match(new RegExp(`.{1,${w}}`, 'g'))?.join('\n') ?? '' : enc) + '\n')
  return 0
}
C.xxd = c => {
  const o = opts(c.args, 'pr')
  const data = inputs(c, o.rest).map(f => f.data).join('')
  if (o.flags.has('r') && o.flags.has('p')) { c.out(data.replace(/\s/g, '').match(/../g)?.map(h => String.fromCharCode(parseInt(h, 16))).join('') ?? ''); return 0 }
  const hx = (ch: string) => (ch.charCodeAt(0) & 255).toString(16).padStart(2, '0')
  if (o.flags.has('p')) { c.out(([...data].map(hx).join('').match(/.{1,60}/g) ?? []).join('\n') + '\n'); return 0 }
  for (let off = 0; off < data.length; off += 16) {
    const chunk = data.slice(off, off + 16)
    const hex = [...chunk].map(hx).join('').match(/.{1,4}/g)!.join(' ')
    const asc = [...chunk].map(ch => { const b = ch.charCodeAt(0); return b >= 32 && b < 127 ? ch : '.' }).join('')
    c.out(`${off.toString(16).padStart(8, '0')}: ${hex.padEnd(39)}  ${asc}\n`)
  }
  return 0
}
C.strings = c => {
  const o = opts(c.args, 'n:')
  const min = +(o.vals.n?.[0] ?? 4)
  for (const f of inputs(c, o.rest)) for (const m of f.data.matchAll(new RegExp(`[\\x20-\\x7e\\t]{${min},}`, 'g'))) c.out(m[0] + '\n')
  return status(c)
}
C.file = c => {
  for (const f of c.args) {
    let n: FNode
    try { n = c.sh.fs.stat(c.sh.user, c.sh.abs(f)) } catch (e) { c.out(`${f}: cannot open \`${f}' (${(e as FsError).reason})\n`); continue }
    const d = n.content
    const kind = n.type === 'dir' ? 'directory' : n.bin || d.startsWith('\x7fELF') ? 'ELF 64-bit LSB executable, x86-64, dynamically linked, stripped'
      : d.startsWith('\x89PNG') ? 'PNG image data' : d.startsWith('\xff\xd8\xff') ? 'JPEG image data, JFIF standard 1.01' : d.startsWith('PK\x03\x04') ? 'Zip archive data'
        : d.startsWith('%PDF') ? 'PDF document' : d.startsWith('#!') ? `${d.slice(2, d.indexOf('\n')).trim()} script, ASCII text executable` : !d ? 'empty' : /[^\x09\x0a\x0d\x20-\x7e]/.test(d) ? 'data' : 'ASCII text'
    c.out(`${f}: ${kind}\n`)
  }
  return 0
}
C.ps = c => {
  const full = c.args.some(a => /a|e/.test(a))
  const ps = full ? c.sh.procs : c.sh.procs.filter(p => p.user === c.sh.user)
  if (c.args.some(a => a.includes('u'))) { c.out('USER         PID COMMAND\n'); for (const p of ps) c.out(`${p.user.padEnd(10)} ${String(p.pid).padStart(5)} ${p.cmd}\n`) }
  else { c.out('    PID TTY          TIME CMD\n'); for (const p of ps) c.out(`${String(p.pid).padStart(7)} pts/0    00:00:00 ${p.cmd.split(' ')[0].split('/').pop()}\n`) }
  return 0
}
C.kill = c => {
  for (const a of c.args.filter(x => /^\d+$/.test(x))) {
    const p = c.sh.procs.find(x => x.pid === +a)
    if (!p) { c.err(`${c.sh.name}: kill: (${a}) - No such process\n`); return 1 }
    if (p.user !== c.sh.user && c.sh.user !== 'root') { c.err(`${c.sh.name}: kill: (${a}) - Operation not permitted\n`); return 1 }
    c.sh.procs.splice(c.sh.procs.indexOf(p), 1)
  }
  return 0
}
C.pgrep = c => { const re = new RegExp(c.args[c.args.length - 1]); let any = false; for (const p of c.sh.procs) if (re.test(p.cmd)) { c.out(p.pid + '\n'); any = true } return any ? 0 : 1 }
C.ss = c => {
  c.out('Netid State  Local Address:Port  Process\n')
  for (const p of c.sh.procs.filter(x => x.port)) c.out(`tcp   LISTEN 0.0.0.0:${p.port}${' '.repeat(Math.max(1, 13 - String(p.port).length))}${p.cmd.split(' ')[0]} (pid ${p.pid})\n`)
  return 0
}
C.netstat = C.ss
C.sudo = async c => {
  if (c.args[0] === '-l') { c.out(c.sh.fs.user(c.sh.user).groups.includes('sudo') ? `User ${c.sh.user} may run the following commands on kisatsutai:\n    (ALL : ALL) ALL\n` : `Sorry, user ${c.sh.user} may not run sudo on kisatsutai.\n`); return 0 }
  if (!c.sh.fs.user(c.sh.user).groups.includes('sudo') && c.sh.user !== 'root') { c.err(`${c.sh.user} is not in the sudoers file.  This incident will be reported.\n`); return 1 }
  const root = Object.assign(c.sh.subshell(), { user: 'root' })
  return root.invoke(c.args, c)
}
for (const n of ['ping', 'curl', 'wget', 'ssh', 'scp', 'nc', 'nmap', 'apt', 'apt-get', 'systemctl', 'python3', 'node', 'vim', 'nano', 'less', 'more', 'top', 'crontab'])
  C[n] = c => { c.err(`${n}: tidak tersedia di terminal simulasi (sandbox tanpa jaringan & tanpa program interaktif)${n === 'crontab' ? '. Pelajari formatnya di bab Cron.' : ''}\n`); return 127 }
C.test = c => BUILTINS.test(c)
C.git = c => git(c) // referensi malas: git.ts ↔ shell.ts saling impor
C.man = c => {
  const d = MAN[c.args[0]]
  if (!d) { c.err(`No manual entry for ${c.args[0] ?? ''}\n`); return 16 }
  c.out(`${c.args[0]} — ${d}\n`)
  return 0
}

export const MAN: Record<string, string> = {
  ls: 'tampilkan isi direktori. -l format panjang, -a termasuk file tersembunyi.', cd: 'pindah direktori (builtin).', pwd: 'tampilkan direktori kerja sekarang.',
  cat: 'gabungkan & tampilkan isi file. -n beri nomor baris.', echo: 'cetak teks. -n tanpa newline, -e tafsirkan escape (\\n, \\t).', mkdir: 'buat direktori. -p buat induknya juga.',
  touch: 'buat file kosong atau perbarui waktunya.', rm: 'hapus file. -r rekursif (direktori), -f tanpa error.', cp: 'salin file. -r untuk direktori.', mv: 'pindah atau ganti nama.',
  head: 'tampilkan baris awal. -n N.', tail: 'tampilkan baris akhir. -n N, -n +N mulai baris N.', wc: 'hitung baris (-l), kata (-w), byte (-c).',
  grep: 'cari baris yang cocok pola. -i abaikan huruf besar, -v kebalikan, -n nomor baris, -c hitung, -r rekursif, -E regex extended, -o hanya bagian cocok.',
  sort: 'urutkan baris. -n angka, -r terbalik, -u unik, -k N kolom, -t pemisah.', uniq: 'buang baris duplikat yang BERURUTAN. -c hitung.', cut: 'ambil kolom. -d pemisah, -f nomor field, -c karakter.',
  tr: 'terjemahkan/hapus karakter. -d hapus, -s rapatkan.', sed: 'edit aliran teks. s/pola/ganti/g, -n + p, d hapus baris, -i ubah file.', awk: 'bahasa pemrosesan kolom. -F pemisah, $1 kolom pertama, NR nomor baris.',
  find: 'cari file. -name pola, -type f/d, -perm, -user, -size, -exec.', chmod: 'ubah permission: angka (755) atau simbol (u+x).', chown: 'ubah pemilik (hanya root).',
  ps: 'daftar proses. aux semua proses.', kill: 'hentikan proses (PID).', whoami: 'nama user sekarang.', id: 'uid, gid, dan grup user.', sudo: 'jalankan sebagai root (kalau diizinkan).',
  tee: 'salin input ke file sekaligus ke layar.', xargs: 'ubah input jadi argumen perintah.', seq: 'cetak deret angka.', base64: 'encode/decode base64. -d decode.',
  sha256sum: 'hash SHA-256.', md5sum: 'hash MD5 (lemah, jangan untuk password!).', strings: 'tampilkan teks yang bisa dibaca di file biner.', xxd: 'hex dump.', file: 'tebak jenis file dari isinya.',
  stat: 'detail file. -c %a permission angka, %U pemilik.', history: 'riwayat perintah.', export: 'jadikan variabel environment.', read: 'baca satu baris input ke variabel.',
  printf: 'cetak dengan format (%s, %d, %5.2f).', test: 'evaluasi kondisi; sama dengan [ ... ].', ss: 'socket yang mendengarkan (port terbuka).', clear: 'bersihkan layar.',
}

export const COMMANDS: Record<string, Command> = C
