// Lexer + parser Bash (subset yang cukup untuk belajar): quoting, $var/${..}/$(..)/$((..)), pipeline, && ||,
// if/for/while/until/case, fungsi, [[ ]], (( )), subshell, redirection, heredoc, here-string.
export type Part =
  | { t: 'lit'; v: string; q: boolean } // q = dikutip: tidak di-glob/split
  | { t: 'var'; name: string; q: boolean }
  | { t: 'param'; src: string; q: boolean }
  | { t: 'cmd'; src: string; q: boolean }
  | { t: 'arith'; src: string; q: boolean }
  | { t: 'tilde'; user: string }
  | { t: 'array'; src: string }
  | { t: 'procsub'; src: string }
export type Word = { parts: Part[]; raw: string }
export type Redir = { op: string; fd?: number; target: Word; here?: { body: string; quoted: boolean; strip: boolean } }
export type Assign = { name: string; index?: Word; append: boolean; value: Word }
export type Node =
  | { k: 'simple'; assigns: Assign[]; words: Word[]; redirs: Redir[]; line: number }
  | { k: 'pipe'; cmds: Node[]; bang: boolean }
  | { k: 'andor'; first: Node; rest: ['&&' | '||', Node][] }
  | { k: 'list'; items: Node[] }
  | { k: 'if'; clauses: [Node, Node][]; else?: Node; redirs: Redir[] }
  | { k: 'for'; name: string; words?: Word[]; body: Node; redirs: Redir[] }
  | { k: 'cfor'; init: string; cond: string; step: string; body: Node; redirs: Redir[] }
  | { k: 'while'; cond: Node; body: Node; until: boolean; redirs: Redir[] }
  | { k: 'case'; word: Word; items: { pats: Word[]; body: Node; fall: string }[]; redirs: Redir[] }
  | { k: 'group'; body: Node; redirs: Redir[] }
  | { k: 'subshell'; body: Node; redirs: Redir[] }
  | { k: 'func'; name: string; body: Node }
  | { k: 'test'; args: Word[]; redirs: Redir[] }
  | { k: 'arith'; src: string; redirs: Redir[] }

type Tok = { k: 'word'; w: Word } | { k: 'op'; v: string; fd?: number } | { k: 'arith'; src: string } | { k: 'eof' }

export class SyntaxError_ extends Error {}
const META = ' \t\n;&|<>()'
const OPS = ['&&', '||', ';;&', ';;', ';&', '&>>', '&>', '<<<', '<<-', '<<', '>>', '>&', '<&', '>|', ';', '&', '|', '(', ')', '<', '>', '\n']

class Lexer {
  i = 0
  line = 1
  pending: Redir[] = []
  s: string
  constructor(s: string) { this.s = s }

  private balanced(open: string, close: string) {
    // Dipanggil setelah karakter pembuka; mengembalikan isi sampai penutup yang seimbang.
    let depth = 1, out = ''
    while (this.i < this.s.length) {
      const c = this.s[this.i]
      if (c === '\\') { out += c + (this.s[this.i + 1] ?? ''); this.i += 2; continue }
      if (c === "'" && open !== '{') { const j = this.s.indexOf("'", this.i + 1); const e = j < 0 ? this.s.length : j; out += this.s.slice(this.i, e + 1); this.i = e + 1; continue }
      if (c === '"') { const st = this.i; this.i++; while (this.i < this.s.length && this.s[this.i] !== '"') this.i += this.s[this.i] === '\\' ? 2 : 1; this.i++; out += this.s.slice(st, this.i); continue }
      if (c === open) depth++
      else if (c === close && --depth === 0) { this.i++; return out }
      out += c
      this.i++
    }
    throw new SyntaxError_(`unexpected EOF while looking for matching \`${close}'`)
  }

  private dollar(q: boolean): Part {
    const s = this.s
    // this.i menunjuk setelah '$'
    if (s.startsWith('((', this.i)) {
      this.i += 2
      const src = this.balanced('(', ')')
      if (s[this.i] !== ')') throw new SyntaxError_('expected `))`')
      this.i++
      return { t: 'arith', src: src, q }
    }
    if (s[this.i] === '(') { this.i++; return { t: 'cmd', src: this.balanced('(', ')'), q } }
    if (s[this.i] === '{') { this.i++; return { t: 'param', src: this.balanced('{', '}'), q } }
    if (s[this.i] === "'" && !q) {
      this.i++
      let v = ''
      while (this.i < s.length && s[this.i] !== "'") {
        if (s[this.i] === '\\') { v += ansiEscape(s[this.i + 1]); this.i += 2 } else v += s[this.i++]
      }
      this.i++
      return { t: 'lit', v, q: true }
    }
    const m = /^([A-Za-z_]\w*|[0-9@*#?$!\-])/.exec(s.slice(this.i))
    if (m) { this.i += m[0].length; return { t: 'var', name: m[0], q } }
    return { t: 'lit', v: '$', q }
  }

  private word(): Tok {
    const s = this.s, start = this.i
    const parts: Part[] = []
    const lit = (v: string, q: boolean) => { const l = parts[parts.length - 1]; if (l?.t === 'lit' && l.q === q) l.v += v; else parts.push({ t: 'lit', v, q }) }
    if (s[this.i] === '~') {
      const m = /^~([A-Za-z_][\w-]*)?(?=\/|$|[\s;&|<>()])/.exec(s.slice(this.i))
      if (m) { parts.push({ t: 'tilde', user: m[1] ?? '' }); this.i += m[0].length }
    }
    while (this.i < s.length) {
      const c = s[this.i]
      if (META.includes(c)) {
        // Array: nama=( ... )
        if (c === '(' && parts.length === 1 && parts[0].t === 'lit' && !parts[0].q && /^[A-Za-z_]\w*\+?=$/.test(parts[0].v)) {
          this.i++
          parts.push({ t: 'array', src: this.balanced('(', ')') })
          continue
        }
        // Angka sebelum redirect: 2>file, 2>&1
        if ((c === '>' || c === '<') && parts.length === 1 && parts[0].t === 'lit' && !parts[0].q && /^\d$/.test(parts[0].v)) {
          const fd = +parts[0].v
          const t = this.op()
          return { ...(t as { k: 'op'; v: string }), fd }
        }
        break
      }
      if (c === '\\') {
        if (s[this.i + 1] === '\n') { this.i += 2; this.line++; continue }
        lit(s[this.i + 1] ?? '', true)
        this.i += 2
      } else if (c === "'") {
        const j = s.indexOf("'", this.i + 1)
        if (j < 0) throw new SyntaxError_("unexpected EOF while looking for matching `''")
        lit(s.slice(this.i + 1, j), true)
        parts.push({ t: 'lit', v: '', q: true }) // penanda: kata dikutip walau kosong
        this.i = j + 1
      } else if (c === '"') {
        this.i++
        let any = false
        while (this.i < s.length && s[this.i] !== '"') {
          const d = s[this.i]
          any = true
          if (d === '\\' && '$`"\\\n'.includes(s[this.i + 1])) { if (s[this.i + 1] !== '\n') lit(s[this.i + 1], true); this.i += 2 }
          else if (d === '$') { this.i++; parts.push(this.dollar(true)) }
          else if (d === '`') { this.i++; parts.push({ t: 'cmd', src: this.backtick(), q: true }) }
          else { if (d === '\n') this.line++; lit(d, true); this.i++ }
        }
        if (this.i >= s.length) throw new SyntaxError_('unexpected EOF while looking for matching `"\'')
        this.i++
        if (!any) parts.push({ t: 'lit', v: '', q: true })
      } else if (c === '$') {
        this.i++
        parts.push(this.dollar(false))
      } else if (c === '`') {
        this.i++
        parts.push({ t: 'cmd', src: this.backtick(), q: false })
      } else { lit(c, false); this.i++ }
    }
    // Rapikan: buang penanda lit kosong kalau ada bagian lain.
    const clean = parts.filter(p => !(p.t === 'lit' && p.v === '' && p.q) || parts.length === 1)
    return { k: 'word', w: { parts: clean.length ? clean : parts, raw: s.slice(start, this.i) } }
  }
  private backtick() {
    let out = ''
    while (this.i < this.s.length && this.s[this.i] !== '`') {
      if (this.s[this.i] === '\\' && '$`\\'.includes(this.s[this.i + 1])) { out += this.s[this.i + 1]; this.i += 2 } else out += this.s[this.i++]
    }
    this.i++
    return out
  }
  private op(): Tok {
    const v = OPS.find(o => this.s.startsWith(o, this.i))!
    this.i += v.length
    return { k: 'op', v }
  }
  // Isi heredoc dibaca saat bertemu newline setelah baris perintahnya.
  private heredocs() {
    for (const r of this.pending) {
      const delim = r.target.parts.map(p => (p.t === 'lit' ? p.v : '')).join('')
      const lines: string[] = []
      while (this.i < this.s.length) {
        let e = this.s.indexOf('\n', this.i)
        if (e < 0) e = this.s.length
        let ln = this.s.slice(this.i, e)
        this.i = Math.min(e + 1, this.s.length)
        this.line++
        if (r.here!.strip) ln = ln.replace(/^\t+/, '')
        if (ln === delim) break
        lines.push(ln)
      }
      r.here!.body = lines.length ? lines.join('\n') + '\n' : ''
    }
    this.pending = []
  }
  next(): Tok {
    const s = this.s
    for (;;) {
      while (s[this.i] === ' ' || s[this.i] === '\t') this.i++
      if (s[this.i] === '\\' && s[this.i + 1] === '\n') { this.i += 2; this.line++; continue }
      if (s[this.i] === '#') { while (this.i < s.length && s[this.i] !== '\n') this.i++; continue }
      break
    }
    if (this.i >= s.length) return { k: 'eof' }
    const c = s[this.i]
    if (c === '\n') { this.i++; this.line++; if (this.pending.length) this.heredocs(); return { k: 'op', v: '\n' } }
    if (c === '(' && s[this.i + 1] === '(') {
      this.i += 2
      const src = this.balanced('(', ')')
      if (s[this.i] !== ')') throw new SyntaxError_('expected `))`')
      this.i++
      return { k: 'arith', src }
    }
    // Process substitution <(cmd): jadi kata berisi path file sementara.
    if (c === '<' && s[this.i + 1] === '(') {
      this.i += 2
      const src = this.balanced('(', ')')
      return { k: 'word', w: { parts: [{ t: 'procsub', src }], raw: `<(${src})` } }
    }
    if (META.includes(c)) return this.op()
    return this.word()
  }
}

export function ansiEscape(c: string) {
  return ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', e: '\x1b', a: '\x07', '0': '\0' } as Record<string, string>)[c] ?? '\\' + c
}

const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', 'case', 'esac', 'function', '{', '}', '!', '[[', ']]'])
const REDIR = new Set(['<', '>', '>>', '<<', '<<-', '<<<', '>&', '<&', '&>', '&>>', '>|'])
export const wordText = (w: Word) => (w.parts.every(p => p.t === 'lit') ? w.parts.map(p => (p as { v: string }).v).join('') : null)
const isWord = (t: Tok, v: string) => t.k === 'word' && t.w.raw === v

export class Parser {
  private buf: Tok[] = []
  lx: Lexer
  constructor(src: string) { this.lx = new Lexer(src) }
  private peek() { if (!this.buf.length) this.buf.push(this.lx.next()); return this.buf[0] }
  private next() { return this.buf.length ? this.buf.shift()! : this.lx.next() }
  private fail(t: Tok): never {
    const v = t.k === 'eof' ? 'end of file' : t.k === 'op' ? (t.v === '\n' ? 'newline' : t.v) : t.k === 'word' ? t.w.raw : '(('
    throw new SyntaxError_(`syntax error near unexpected token \`${v}'`)
  }
  private expectWord(v: string) { const t = this.next(); if (!isWord(t, v)) this.fail(t) }
  private expectOp(v: string) { const t = this.next(); if (t.k !== 'op' || t.v !== v) this.fail(t) }
  private skipNl() { while (this.peek().k === 'op' && (this.peek() as { v: string }).v === '\n') this.next() }

  program(): Node {
    const n = this.list([])
    const t = this.peek()
    if (t.k !== 'eof') this.fail(t)
    return n
  }

  private list(stop: string[]): Node {
    const items: Node[] = []
    for (;;) {
      this.skipNl()
      const t = this.peek()
      if (t.k === 'eof' || (t.k === 'op' && (t.v === ')' || t.v.startsWith(';;') || t.v === ';&')) || (t.k === 'word' && stop.includes(t.w.raw))) break
      items.push(this.andOr())
      const s = this.peek()
      if (s.k === 'op' && (s.v === ';' || s.v === '&' || s.v === '\n')) { this.next(); continue }
      break
    }
    return { k: 'list', items }
  }
  private andOr(): Node {
    const first = this.pipeline()
    const rest: ['&&' | '||', Node][] = []
    for (;;) {
      const t = this.peek()
      if (t.k !== 'op' || (t.v !== '&&' && t.v !== '||')) break
      this.next(); this.skipNl()
      rest.push([t.v as '&&' | '||', this.pipeline()])
    }
    return rest.length ? { k: 'andor', first, rest } : first
  }
  private pipeline(): Node {
    let bang = false
    if (isWord(this.peek(), '!')) { this.next(); bang = true }
    const cmds = [this.command()]
    for (;;) {
      const t = this.peek()
      if (t.k !== 'op' || t.v !== '|') break
      this.next(); this.skipNl()
      cmds.push(this.command())
    }
    return cmds.length > 1 || bang ? { k: 'pipe', cmds, bang } : cmds[0]
  }
  private redirs(): Redir[] {
    const out: Redir[] = []
    for (;;) {
      const t = this.peek()
      if (t.k !== 'op' || !REDIR.has(t.v)) return out
      out.push(this.redir())
    }
  }
  private redir(): Redir {
    const t = this.next() as { k: 'op'; v: string; fd?: number }
    const w = this.next()
    if (w.k !== 'word') this.fail(w)
    const r: Redir = { op: t.v, fd: t.fd, target: w.w }
    if (t.v === '<<' || t.v === '<<-') {
      r.here = { body: '', quoted: w.w.parts.some(p => p.t === 'lit' && p.q), strip: t.v === '<<-' }
      this.lxPending(r)
    }
    return r
  }
  private lxPending(r: Redir) { this.lx.pending.push(r) }

  private command(): Node {
    const t = this.peek()
    if (t.k === 'arith') { this.next(); return { k: 'arith', src: t.src, redirs: this.redirs() } }
    if (t.k === 'op' && t.v === '(') {
      this.next()
      const body = this.list([])
      this.expectOp(')')
      return { k: 'subshell', body, redirs: this.redirs() }
    }
    if (t.k === 'word' && RESERVED.has(t.w.raw)) {
      switch (t.w.raw) {
        case 'if': return this.ifCmd()
        case 'for': return this.forCmd()
        case 'while': case 'until': return this.whileCmd()
        case 'case': return this.caseCmd()
        case '{': { this.next(); const body = this.list(['}']); this.expectWord('}'); return { k: 'group', body, redirs: this.redirs() } }
        case '[[': return this.testCmd()
        case 'function': {
          this.next()
          const n = this.next()
          if (n.k !== 'word') this.fail(n)
          if (this.peek().k === 'op' && (this.peek() as { v: string }).v === '(') { this.next(); this.expectOp(')') }
          this.skipNl()
          return { k: 'func', name: n.w.raw, body: this.command() }
        }
      }
      if (t.w.raw !== '!') this.fail(t)
    }
    return this.simple()
  }
  private simple(): Node {
    const assigns: Assign[] = [], words: Word[] = [], redirs: Redir[] = []
    const line = this.lx.line
    for (;;) {
      const t = this.peek()
      if (t.k === 'op' && REDIR.has(t.v)) { redirs.push(this.redir()); continue }
      if (t.k !== 'word') break
      if (words.length && (t.w.raw === ']]')) break
      this.next()
      if (!words.length) {
        const a = asAssign(t.w)
        if (a) { assigns.push(a); continue }
        // Definisi fungsi: nama() { ... }
        const p = this.peek()
        if (p.k === 'op' && p.v === '(' && !assigns.length) {
          this.next(); this.expectOp(')'); this.skipNl()
          return { k: 'func', name: t.w.raw, body: this.command() }
        }
      }
      words.push(t.w)
    }
    if (!assigns.length && !words.length && !redirs.length) this.fail(this.peek())
    return { k: 'simple', assigns, words, redirs, line }
  }
  private ifCmd(): Node {
    this.next()
    const clauses: [Node, Node][] = []
    let els: Node | undefined
    for (;;) {
      const cond = this.list(['then'])
      this.expectWord('then')
      const body = this.list(['elif', 'else', 'fi'])
      clauses.push([cond, body])
      const t = this.next()
      if (isWord(t, 'elif')) continue
      if (isWord(t, 'else')) { els = this.list(['fi']); this.expectWord('fi'); break }
      if (isWord(t, 'fi')) break
      this.fail(t)
    }
    return { k: 'if', clauses, else: els, redirs: this.redirs() }
  }
  private doBody() {
    this.skipNl()
    if (isWord(this.peek(), '{')) { this.next(); const b = this.list(['}']); this.expectWord('}'); return b }
    this.expectWord('do')
    const body = this.list(['done'])
    this.expectWord('done')
    return body
  }
  private forCmd(): Node {
    this.next()
    const t = this.next()
    if (t.k === 'arith') {
      const [init = '', cond = '', step = ''] = t.src.split(';').map(x => x.trim())
      const s = this.peek()
      if (s.k === 'op' && (s.v === ';' || s.v === '\n')) this.next()
      return { k: 'cfor', init, cond, step, body: this.doBody(), redirs: this.redirs() }
    }
    if (t.k !== 'word') this.fail(t)
    let words: Word[] | undefined
    this.skipNl()
    if (isWord(this.peek(), 'in')) {
      this.next()
      words = []
      while (this.peek().k === 'word') words.push((this.next() as { w: Word }).w)
      const s = this.next()
      if (s.k !== 'op' || (s.v !== ';' && s.v !== '\n')) this.fail(s)
    } else {
      const s = this.peek()
      if (s.k === 'op' && s.v === ';') this.next()
    }
    return { k: 'for', name: t.w.raw, words, body: this.doBody(), redirs: this.redirs() }
  }
  private whileCmd(): Node {
    const until = (this.next() as { w: Word }).w.raw === 'until'
    const cond = this.list(['do'])
    return { k: 'while', cond, until, body: this.doBody(), redirs: this.redirs() }
  }
  private caseCmd(): Node {
    this.next()
    const w = this.next()
    if (w.k !== 'word') this.fail(w)
    this.skipNl()
    this.expectWord('in')
    const items: { pats: Word[]; body: Node; fall: string }[] = []
    for (;;) {
      this.skipNl()
      if (isWord(this.peek(), 'esac')) { this.next(); break }
      if (this.peek().k === 'op' && (this.peek() as { v: string }).v === '(') this.next()
      const pats: Word[] = []
      for (;;) {
        const p = this.next()
        if (p.k !== 'word') this.fail(p)
        pats.push(p.w)
        const s = this.next()
        if (s.k === 'op' && s.v === '|') continue
        if (s.k === 'op' && s.v === ')') break
        this.fail(s)
      }
      const body = this.list(['esac'])
      const e = this.peek()
      let fall = ';;'
      if (e.k === 'op' && (e.v === ';;' || e.v === ';&' || e.v === ';;&')) { fall = e.v; this.next() }
      items.push({ pats, body, fall })
    }
    return { k: 'case', word: w.w, items, redirs: this.redirs() }
  }
  private testCmd(): Node {
    this.next()
    const args: Word[] = []
    for (;;) {
      const t = this.next()
      if (t.k === 'eof') this.fail(t)
      if (isWord(t, ']]')) break
      // Regex setelah =~ boleh berisi ( ) | tanpa kutip: gabungkan jadi satu kata.
      if (args.length && args[args.length - 1].raw === '=~') {
        const w: Word = { parts: [], raw: '' }
        let depth = 0
        for (let tok: Tok = t; ; tok = this.next()) {
          if (tok.k === 'word') { w.parts.push(...tok.w.parts); w.raw += tok.w.raw }
          else if (tok.k === 'op' && (tok.v === '(' || tok.v === ')' || tok.v === '|')) { depth += tok.v === '(' ? 1 : tok.v === ')' ? -1 : 0; w.parts.push({ t: 'lit', v: tok.v, q: false }); w.raw += tok.v }
          else this.fail(tok)
          const nx = this.peek()
          if (depth === 0 && (isWord(nx, ']]') || (nx.k === 'op' && (nx.v === '&&' || nx.v === '||')))) break
        }
        args.push(w)
        continue
      }
      if (t.k === 'word') args.push(t.w)
      else if (t.k === 'op') { const v = t.v === '\n' ? '' : t.v; if (v) args.push({ parts: [{ t: 'lit', v, q: false }], raw: v }) }
      else this.fail(t)
    }
    return { k: 'test', args, redirs: this.redirs() }
  }
}

function asAssign(w: Word): Assign | null {
  const p = w.parts[0]
  if (!p || p.t !== 'lit' || p.q) return null
  const m = /^([A-Za-z_]\w*)(\[([^\]]*)\])?(\+?)=/.exec(p.v)
  if (!m) return null
  const rest = p.v.slice(m[0].length)
  const value: Word = { parts: [...(rest ? [{ ...p, v: rest }] : []), ...w.parts.slice(1)], raw: w.raw.slice(w.raw.indexOf('=') + 1) }
  if (!value.parts.length) value.parts.push({ t: 'lit', v: '', q: true })
  return { name: m[1], index: m[2] !== undefined ? { parts: [{ t: 'lit', v: m[3], q: false }], raw: m[3] } : undefined, append: m[4] === '+', value }
}

export const parse = (src: string) => new Parser(src).program()
