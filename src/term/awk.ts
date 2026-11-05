// awk mini: BEGIN/END, pola (/regex/, ekspresi), print/printf, variabel, field, array asosiatif, if/while/for/for-in,
// next/exit, fungsi bawaan (length, substr, index, split, sub, gsub, match, toupper, tolower, sprintf, int, sqrt).
import { ereToJs, printf } from './shell.ts'

type Val = number | string | { s: string; strnum: true }
type Tok = { t: 'num' | 'str' | 're' | 'name' | 'func' | 'op' | 'nl' | 'eof'; v: string }
type Expr =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 're'; v: string }
  | { k: 'var'; name: string } | { k: 'field'; e: Expr } | { k: 'idx'; name: string; keys: Expr[] }
  | { k: 'bin'; op: string; a: Expr; b: Expr } | { k: 'un'; op: string; e: Expr } | { k: 'cond'; c: Expr; a: Expr; b: Expr }
  | { k: 'assign'; op: string; lv: Expr; e: Expr } | { k: 'incdec'; op: string; pre: boolean; lv: Expr }
  | { k: 'call'; name: string; args: Expr[] } | { k: 'in'; keys: Expr[]; arr: string } | { k: 'match'; neg: boolean; s: Expr; re: Expr } | { k: 'group'; e: Expr }
type Stmt =
  | { k: 'print'; args: Expr[]; f?: boolean; to?: { op: string; e: Expr } } | { k: 'expr'; e: Expr } | { k: 'block'; body: Stmt[] }
  | { k: 'if'; c: Expr; a: Stmt; b?: Stmt } | { k: 'while'; c: Expr; body: Stmt; do?: boolean } | { k: 'for'; init?: Stmt; c?: Expr; step?: Stmt; body: Stmt }
  | { k: 'forin'; v: string; arr: string; body: Stmt } | { k: 'next' } | { k: 'exit'; e?: Expr } | { k: 'break' } | { k: 'continue' } | { k: 'delete'; name: string; keys?: Expr[] }
  | { k: 'getline' }
type Rule = { pat?: Expr; begin?: boolean; end?: boolean; body?: Stmt[] }

export class AwkError extends Error {}
class Next {}
class Exit { code: number; constructor(code: number) { this.code = code } }
class Brk {}
class Cont {}

const BUILTIN_FN = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'toupper', 'tolower', 'sprintf', 'int', 'sqrt', 'exp', 'log', 'sin', 'cos', 'atan2', 'rand', 'srand', 'system'])

function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  const prevAllowsRegex = () => {
    const p = out[out.length - 1]
    if (!p) return true
    if (p.t === 'num' || p.t === 'str' || p.t === 'name' || p.t === 're') return false
    if (p.t === 'op' && (p.v === ')' || p.v === ']' || p.v === '$' || p.v === '++' || p.v === '--')) return false
    return true
  }
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') { i++; continue }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '\n' || c === ';') { out.push({ t: 'nl', v: c }); i++; continue }
    if (/[0-9.]/.test(c) && /[0-9.]/.test(src[i + 1] ?? '') || /[0-9]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i))!
      out.push({ t: 'num', v: m[0] }); i += m[0].length; continue
    }
    if (c === '"') {
      let s = ''; i++
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { const e = src[i + 1]; s += ({ n: '\n', t: '\t', '\\': '\\', '"': '"', '/': '/', r: '\r' } as Record<string, string>)[e] ?? '\\' + e; i += 2 } else s += src[i++]
      }
      i++
      out.push({ t: 'str', v: s }); continue
    }
    if (c === '/' && prevAllowsRegex()) {
      let s = ''; i++
      while (i < src.length && src[i] !== '/') { if (src[i] === '\\' && src[i + 1] === '/') { s += '/'; i += 2 } else if (src[i] === '\\') { s += src[i] + src[i + 1]; i += 2 } else s += src[i++] }
      i++
      out.push({ t: 're', v: s }); continue
    }
    const m = /^[A-Za-z_]\w*/.exec(src.slice(i))
    if (m) { i += m[0].length; out.push({ t: BUILTIN_FN.has(m[0]) && src[i] === '(' ? 'func' : BUILTIN_FN.has(m[0]) && m[0] === 'length' ? 'func' : 'name', v: m[0] }); continue }
    const op = ['&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '^=', '==', '!=', '<=', '>=', '!~', '>>', '**'].find(o => src.startsWith(o, i)) ?? c
    out.push({ t: 'op', v: op }); i += op.length
  }
  out.push({ t: 'eof', v: '' })
  return out
}

class P {
  i = 0
  private t: Tok[]
  constructor(t: Tok[]) { this.t = t }
  peek(o = 0) { return this.t[this.i + o] }
  next() { return this.t[this.i++] }
  is(v: string) { const p = this.peek(); return (p.t === 'op' || p.t === 'name') && p.v === v }
  eat(v: string) { const p = this.next(); if (p.v !== v) throw new AwkError(`syntax error di dekat "${p.v || 'akhir'}"`); return p }
  nl() { while (this.peek().t === 'nl') this.next() }
  opt() { while (this.peek().t === 'nl' && this.peek().v === '\n') this.next() }

  program(): Rule[] {
    const rules: Rule[] = []
    this.nl()
    while (this.peek().t !== 'eof') {
      const r: Rule = {}
      if (this.is('BEGIN')) { this.next(); r.begin = true }
      else if (this.is('END')) { this.next(); r.end = true }
      else if (!this.is('{')) r.pat = this.expr()
      this.opt()
      if (this.is('{')) r.body = this.block()
      rules.push(r)
      this.nl()
    }
    return rules
  }
  block(): Stmt[] {
    this.eat('{')
    const body: Stmt[] = []
    this.nl()
    while (!this.is('}')) { body.push(this.stmt()); this.nl() }
    this.eat('}')
    return body
  }
  simpleEnd() { const p = this.peek(); if (p.t === 'nl') this.next() }
  stmt(): Stmt {
    const p = this.peek()
    if (this.is('{')) return { k: 'block', body: this.block() }
    if (p.t === 'name') {
      switch (p.v) {
        case 'if': {
          this.next(); this.eat('('); const c = this.expr(); this.eat(')'); this.opt()
          const a = this.stmt()
          const save = this.i
          this.nl()
          if (this.is('else')) { this.next(); this.opt(); return { k: 'if', c, a, b: this.stmt() } }
          this.i = save
          return { k: 'if', c, a }
        }
        case 'while': { this.next(); this.eat('('); const c = this.expr(); this.eat(')'); this.opt(); return { k: 'while', c, body: this.stmt() } }
        case 'do': { this.next(); this.opt(); const body = this.stmt(); this.nl(); this.eat('while'); this.eat('('); const c = this.expr(); this.eat(')'); this.simpleEnd(); return { k: 'while', c, body, do: true } }
        case 'for': {
          this.next(); this.eat('(')
          if (this.peek().t === 'name' && this.peek(1).v === 'in' && this.peek(3).v === ')') {
            const v = this.next().v; this.next(); const arr = this.next().v; this.eat(')'); this.opt()
            return { k: 'forin', v, arr, body: this.stmt() }
          }
          const init = this.is(';') ? undefined : { k: 'expr' as const, e: this.expr() }
          this.eat(';'); this.opt()
          const c = this.is(';') ? undefined : this.expr()
          this.eat(';'); this.opt()
          const step = this.is(')') ? undefined : { k: 'expr' as const, e: this.expr() }
          this.eat(')'); this.opt()
          return { k: 'for', init, c, step, body: this.stmt() }
        }
        case 'next': this.next(); this.simpleEnd(); return { k: 'next' }
        case 'exit': { this.next(); const e = this.peek().t === 'nl' || this.is('}') ? undefined : this.expr(); this.simpleEnd(); return { k: 'exit', e } }
        case 'break': this.next(); this.simpleEnd(); return { k: 'break' }
        case 'continue': this.next(); this.simpleEnd(); return { k: 'continue' }
        case 'delete': {
          this.next(); const name = this.next().v
          let keys: Expr[] | undefined
          if (this.is('[')) { this.next(); keys = [this.expr()]; while (this.is(',')) { this.next(); keys.push(this.expr()) } this.eat(']') }
          this.simpleEnd(); return { k: 'delete', name, keys }
        }
        case 'print': case 'printf': {
          this.next()
          const args: Expr[] = []
          const end = () => this.peek().t === 'nl' || this.is('}') || this.is('>') || this.is('>>') || this.is('|') || this.peek().t === 'eof'
          if (this.is('(') ) {
            // print (a, b) atau print (a)(b)
            const save = this.i
            this.next()
            const inner = [this.expr(true)]
            while (this.is(',')) { this.next(); inner.push(this.expr(true)) }
            if (this.is(')') && (this.peek(1).t === 'nl' || this.peek(1).v === '}' || this.peek(1).v === '>' || this.peek(1).t === 'eof')) { this.next(); args.push(...inner) }
            else { this.i = save; args.push(this.expr(true)); while (this.is(',')) { this.next(); args.push(this.expr(true)) } }
          } else if (!end()) { args.push(this.expr(true)); while (this.is(',')) { this.next(); this.opt(); args.push(this.expr(true)) } }
          let to: { op: string; e: Expr } | undefined
          if (this.is('>') || this.is('>>') || this.is('|')) { const op = this.next().v; to = { op, e: this.concat(true) } }
          this.simpleEnd()
          return { k: 'print', args, f: p.v === 'printf', to }
        }
        case 'getline': this.next(); this.simpleEnd(); return { k: 'getline' }
      }
    }
    if (p.t === 'nl') { this.next(); return { k: 'block', body: [] } }
    const e = this.expr()
    this.simpleEnd()
    return { k: 'expr', e }
  }
  // noGt: di dalam print, '>' berarti redirect.
  expr(noGt = false): Expr { return this.ternary(noGt) }
  ternary(noGt: boolean): Expr {
    const c = this.or(noGt)
    if (this.is('?')) { this.next(); const a = this.ternary(noGt); this.eat(':'); const b = this.ternary(noGt); return { k: 'cond', c, a, b } }
    if (['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(this.peek().v) && this.peek().t === 'op' && (c.k === 'var' || c.k === 'field' || c.k === 'idx')) {
      const op = this.next().v
      return { k: 'assign', op, lv: c, e: this.ternary(noGt) }
    }
    return c
  }
  or(n: boolean): Expr { let a = this.and(n); while (this.is('||')) { this.next(); this.opt(); a = { k: 'bin', op: '||', a, b: this.and(n) } } return a }
  and(n: boolean): Expr { let a = this.inop(n); while (this.is('&&')) { this.next(); this.opt(); a = { k: 'bin', op: '&&', a, b: this.inop(n) } } return a }
  inop(n: boolean): Expr {
    let a = this.matchop(n)
    while (this.is('in')) { this.next(); a = { k: 'in', keys: a.k === 'group' && a.e.k === 'bin' && a.e.op === ',' ? [a.e.a, a.e.b] : [a], arr: this.next().v } }
    return a
  }
  matchop(n: boolean): Expr {
    let a = this.cmp(n)
    while (this.is('~') || this.is('!~')) { const neg = this.next().v === '!~'; a = { k: 'match', neg, s: a, re: this.cmp(n) } }
    return a
  }
  cmp(n: boolean): Expr {
    const a = this.concat(n)
    const p = this.peek()
    if (p.t === 'op' && ['<', '<=', '==', '!=', '>=', ...(n ? [] : ['>'])].includes(p.v)) { this.next(); return { k: 'bin', op: p.v, a, b: this.concat(n) } }
    return a
  }
  concat(n: boolean): Expr {
    let a = this.additive()
    for (;;) {
      const p = this.peek()
      const starts = p.t === 'num' || p.t === 'str' || p.t === 're' || p.t === 'func' || (p.t === 'name' && !['in', 'getline'].includes(p.v)) || (p.t === 'op' && ['$', '!', '(', '-', '++', '--'].includes(p.v) && !(p.v === '-' ))
      if (!starts) return a
      a = { k: 'bin', op: 'cat', a, b: this.additive() }
    }
    void n
  }
  additive(): Expr { let a = this.mul(); while (this.is('+') || this.is('-')) { const op = this.next().v; a = { k: 'bin', op, a, b: this.mul() } } return a }
  mul(): Expr { let a = this.unary(); while (this.is('*') || this.is('/') || this.is('%')) { const op = this.next().v; a = { k: 'bin', op, a, b: this.unary() } } return a }
  unary(): Expr {
    if (this.is('!')) { this.next(); return { k: 'un', op: '!', e: this.unary() } }
    if (this.is('-')) { this.next(); return { k: 'un', op: '-', e: this.unary() } }
    if (this.is('+')) { this.next(); return { k: 'un', op: '+', e: this.unary() } }
    return this.pow()
  }
  pow(): Expr { const a = this.post(); if (this.is('^') || this.is('**')) { this.next(); return { k: 'bin', op: '^', a, b: this.unary() } } return a }
  post(): Expr {
    if (this.is('++') || this.is('--')) { const op = this.next().v; return { k: 'incdec', op, pre: true, lv: this.primary() } }
    const e = this.primary()
    if ((this.is('++') || this.is('--')) && (e.k === 'var' || e.k === 'field' || e.k === 'idx')) { const op = this.next().v; return { k: 'incdec', op, pre: false, lv: e } }
    return e
  }
  primary(): Expr {
    const p = this.next()
    switch (p.t) {
      case 'num': return { k: 'num', v: parseFloat(p.v) }
      case 'str': return { k: 'str', v: p.v }
      case 're': return { k: 're', v: p.v }
      case 'func': {
        const args: Expr[] = []
        if (this.is('(')) { this.next(); if (!this.is(')')) { args.push(this.expr()); while (this.is(',')) { this.next(); args.push(this.expr()) } } this.eat(')') }
        return { k: 'call', name: p.v, args }
      }
      case 'name': {
        if (this.is('[')) { this.next(); const keys = [this.expr()]; while (this.is(',')) { this.next(); keys.push(this.expr()) } this.eat(']'); return { k: 'idx', name: p.v, keys } }
        return { k: 'var', name: p.v }
      }
      case 'op':
        if (p.v === '$') return { k: 'field', e: this.post() }
        if (p.v === '(') {
          const e = this.expr()
          if (this.is(',')) { this.next(); const b = this.expr(); this.eat(')'); return { k: 'group', e: { k: 'bin', op: ',', a: e, b } } }
          this.eat(')')
          return { k: 'group', e }
        }
    }
    throw new AwkError(`syntax error di dekat "${p.v || 'akhir'}"`)
  }
}

const looksNum = (s: string) => /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(s)
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(6))))
const toNum = (v: Val): number => typeof v === 'number' ? v : parseFloat(typeof v === 'string' ? v : v.s) || 0
const toStr = (v: Val): string => typeof v === 'number' ? fmtNum(v) : typeof v === 'string' ? v : v.s
const isNum = (v: Val) => typeof v === 'number' || (typeof v === 'object' && looksNum(v.s))
const truthy = (v: Val) => typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v !== '' : looksNum(v.s) ? parseFloat(v.s) !== 0 : v.s !== ''

export type AwkOut = { out: string; files: Record<string, { data: string; append: boolean }>; code: number }

export function awk(src: string, inputs: { name: string; data: string }[], opts: { fs?: string; vars?: Record<string, string> } = {}): AwkOut {
  const rules = new P(lex(src)).program()
  const vars = new Map<string, Val>([['FS', opts.fs ?? ' '], ['OFS', ' '], ['ORS', '\n'], ['NR', 0], ['NF', 0], ['FNR', 0], ['SUBSEP', '\x1c'], ['RSTART', 0], ['RLENGTH', -1], ['FILENAME', '']])
  for (const [k, v] of Object.entries(opts.vars ?? {})) vars.set(k, { s: v, strnum: true })
  const arrays = new Map<string, Map<string, Val>>()
  let fields: string[] = [''] // fields[0] = $0
  let out = ''
  const files: AwkOut['files'] = {}
  let steps = 0
  const tick = () => { if (++steps > 500000) throw new AwkError('dihentikan: terlalu banyak langkah') }

  const split = (s: string, fs: string): string[] => {
    if (s === '') return []
    if (fs === ' ') return s.trim().split(/[ \t\n]+/)
    if (fs.length === 1 && fs !== '\\') return s.split(fs)
    return s.split(new RegExp(ereToJs(fs)))
  }
  const setRecord = (s: string) => { fields = [s, ...split(s, toStr(vars.get('FS')!))]; vars.set('NF', fields.length - 1) }
  const rebuild = () => { fields[0] = fields.slice(1).join(toStr(vars.get('OFS')!)) }
  const arr = (n: string) => { let a = arrays.get(n); if (!a) arrays.set(n, (a = new Map())); return a }
  const key = (keys: Expr[]) => keys.map(k => toStr(ev(k))).join(toStr(vars.get('SUBSEP')!))
  const re = (e: Expr) => new RegExp(ereToJs(e.k === 're' ? e.v : toStr(ev(e))))

  const get = (lv: Expr): Val => {
    if (lv.k === 'var') {
      if (lv.name === 'NF') return fields.length - 1
      return vars.get(lv.name) ?? ''
    }
    if (lv.k === 'field') { const i = toNum(ev(lv.e)); return { s: fields[i] ?? '', strnum: true } }
    if (lv.k === 'idx') return arr(lv.name).get(key(lv.keys)) ?? (arr(lv.name).set(key(lv.keys), ''), '')
    return ev(lv)
  }
  const put = (lv: Expr, v: Val) => {
    if (lv.k === 'var') {
      vars.set(lv.name, v)
      if (lv.name === 'NF') { const n = toNum(v); fields = fields.slice(0, n + 1); while (fields.length < n + 1) fields.push(''); rebuild() }
    } else if (lv.k === 'field') {
      const i = toNum(ev(lv.e))
      if (i === 0) setRecord(toStr(v))
      else { while (fields.length <= i) fields.push(''); fields[i] = toStr(v); vars.set('NF', fields.length - 1); rebuild() }
    } else if (lv.k === 'idx') arr(lv.name).set(key(lv.keys), v)
  }
  const cmpVals = (a: Val, b: Val) => {
    if (isNum(a) && isNum(b)) { const x = toNum(a), y = toNum(b); return x < y ? -1 : x > y ? 1 : 0 }
    const x = toStr(a), y = toStr(b)
    return x < y ? -1 : x > y ? 1 : 0
  }
  const subst = (args: Expr[], global: boolean): Val => {
    const r = re(args[0])
    const target = args[2] ?? { k: 'field', e: { k: 'num', v: 0 } } as Expr
    const s = toStr(get(target))
    const rep = toStr(ev(args[1]))
    let n = 0
    const g = new RegExp(r.source, 'g')
    const res = s.replace(g, m => {
      if (!global && n) return m
      n++
      return rep.replace(/\\\\|\\&|&/g, x => (x === '&' ? m : x === '\\&' ? '&' : '\\'))
    })
    if (n) put(target, res)
    return n
  }
  const call = (name: string, args: Expr[]): Val => {
    const a = (i: number) => ev(args[i])
    switch (name) {
      case 'length': return args.length ? (args[0].k === 'var' && arrays.has(args[0].name) ? arrays.get(args[0].name)!.size : toStr(a(0)).length) : fields[0].length
      case 'substr': {
        const s = toStr(a(0))
        let m = Math.round(toNum(a(1)))
        let n = args.length > 2 ? Math.round(toNum(a(2))) : Infinity
        if (m < 1) { n += m - 1; m = 1 }
        return n <= 0 ? '' : s.substr(m - 1, n === Infinity ? undefined : n)
      }
      case 'index': return toStr(a(0)).indexOf(toStr(a(1))) + 1
      case 'split': {
        const parts = split(toStr(a(0)), args[2] ? (args[2].k === 're' ? args[2].v : toStr(a(2))) : toStr(vars.get('FS')!))
        const name2 = (args[1] as { name: string }).name
        const m = new Map<string, Val>()
        parts.forEach((p, i) => m.set(String(i + 1), { s: p, strnum: true }))
        arrays.set(name2, m)
        return parts.length
      }
      case 'sub': return subst(args, false)
      case 'gsub': return subst(args, true)
      case 'match': {
        const m = re(args[1]).exec(toStr(a(0)))
        vars.set('RSTART', m ? m.index + 1 : 0); vars.set('RLENGTH', m ? m[0].length : -1)
        return m ? m.index + 1 : 0
      }
      case 'toupper': return toStr(a(0)).toUpperCase()
      case 'tolower': return toStr(a(0)).toLowerCase()
      case 'sprintf': return sprintf(args.map(ev))
      case 'int': return Math.trunc(toNum(a(0)))
      case 'sqrt': return Math.sqrt(toNum(a(0)))
      case 'exp': return Math.exp(toNum(a(0)))
      case 'log': return Math.log(toNum(a(0)))
      case 'sin': return Math.sin(toNum(a(0)))
      case 'cos': return Math.cos(toNum(a(0)))
      case 'atan2': return Math.atan2(toNum(a(0)), toNum(a(1)))
      case 'rand': return Math.random()
      case 'srand': return 0
      case 'system': return 0
    }
    throw new AwkError(`fungsi ${name} tidak dikenal`)
  }
  const sprintf = (vals: Val[]) => {
    const [f, ...rest] = vals
    return printf(toStr(f).replace(/\\/g, '\\\\'), rest.map(v => (typeof v === 'number' && !Number.isInteger(v) ? String(v) : toStr(v))))
  }
  function ev(e: Expr): Val {
    tick()
    switch (e.k) {
      case 'num': return e.v
      case 'str': return e.v
      case 're': return re(e).test(fields[0]) ? 1 : 0
      case 'group': return e.e.k === 'bin' && e.e.op === ',' ? ev(e.e.a) : ev(e.e)
      case 'var': case 'field': case 'idx': return get(e)
      case 'un': { const v = ev(e.e); return e.op === '!' ? (truthy(v) ? 0 : 1) : e.op === '-' ? -toNum(v) : toNum(v) }
      case 'cond': return truthy(ev(e.c)) ? ev(e.a) : ev(e.b)
      case 'match': { const hit = re(e.re).test(toStr(ev(e.s))); return hit !== e.neg ? 1 : 0 }
      case 'in': return arr(e.arr).has(key(e.keys)) ? 1 : 0
      case 'call': return call(e.name, e.args)
      case 'assign': {
        const v = ev(e.e)
        const r: Val = e.op === '=' ? (typeof v === 'object' ? { ...v } : v) : arith(e.op[0], get(e.lv), v)
        put(e.lv, r)
        return r
      }
      case 'incdec': {
        const old = toNum(get(e.lv))
        const n = old + (e.op === '++' ? 1 : -1)
        put(e.lv, n)
        return e.pre ? n : old
      }
      case 'bin': {
        if (e.op === '&&') return truthy(ev(e.a)) && truthy(ev(e.b)) ? 1 : 0
        if (e.op === '||') return truthy(ev(e.a)) || truthy(ev(e.b)) ? 1 : 0
        const a = ev(e.a), b = ev(e.b)
        switch (e.op) {
          case 'cat': return toStr(a) + toStr(b)
          case '<': return cmpVals(a, b) < 0 ? 1 : 0
          case '<=': return cmpVals(a, b) <= 0 ? 1 : 0
          case '>': return cmpVals(a, b) > 0 ? 1 : 0
          case '>=': return cmpVals(a, b) >= 0 ? 1 : 0
          case '==': return cmpVals(a, b) === 0 ? 1 : 0
          case '!=': return cmpVals(a, b) !== 0 ? 1 : 0
          default: return arith(e.op, a, b)
        }
      }
    }
  }
  const arith = (op: string, a: Val, b: Val): number => {
    const x = toNum(a), y = toNum(b)
    switch (op) {
      case '+': return x + y
      case '-': return x - y
      case '*': return x * y
      case '/': if (!y) throw new AwkError('division by zero'); return x / y
      case '%': if (!y) throw new AwkError('division by zero in %'); return x % y
      case '^': return x ** y
    }
    return 0
  }
  const write = (s: string, to?: { op: string; e: Expr }) => {
    if (!to) { out += s; return }
    const name = toStr(ev(to.e))
    const f = files[name] ?? (files[name] = { data: '', append: to.op === '>>' })
    f.data += s
  }
  function run(s: Stmt): void {
    tick()
    switch (s.k) {
      case 'block': for (const x of s.body) run(x); return
      case 'expr': ev(s.e); return
      case 'print': {
        if (s.f) { write(sprintf(s.args.map(ev)), s.to); return }
        const ofs = toStr(vars.get('OFS')!), ors = toStr(vars.get('ORS')!)
        const parts = s.args.length ? s.args.map(a => { const v = ev(a); return typeof v === 'number' ? fmtNum(v) : toStr(v) }) : [fields[0]]
        write(parts.join(ofs) + ors, s.to)
        return
      }
      case 'if': if (truthy(ev(s.c))) run(s.a); else if (s.b) run(s.b); return
      case 'while':
        if (s.do) { do { try { run(s.body) } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e } } while (truthy(ev(s.c))) }
        else while (truthy(ev(s.c))) { try { run(s.body) } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e } }
        return
      case 'for':
        for (s.init && run(s.init); !s.c || truthy(ev(s.c)); s.step && run(s.step)) { try { run(s.body) } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e } }
        return
      case 'forin':
        for (const k of [...arr(s.arr).keys()]) { vars.set(s.v, { s: k, strnum: true }); try { run(s.body) } catch (e) { if (e instanceof Brk) break; if (!(e instanceof Cont)) throw e } }
        return
      case 'next': throw new Next()
      case 'exit': throw new Exit(s.e ? toNum(ev(s.e)) : 0)
      case 'break': throw new Brk()
      case 'continue': throw new Cont()
      case 'delete': if (s.keys) arr(s.name).delete(key(s.keys)); else arrays.set(s.name, new Map()); return
      case 'getline': return
    }
  }
  let code = 0
  const runRules = (pick: (r: Rule) => boolean) => {
    for (const r of rules) {
      if (!pick(r)) continue
      if (r.body) for (const st of r.body) run(st)
      else out += fields[0] + toStr(vars.get('ORS')!)
    }
  }
  try {
    try { runRules(r => !!r.begin) } catch (e) { if (!(e instanceof Next)) throw e }
    if (rules.some(r => !r.begin)) {
      let nr = 0
      for (const f of inputs) {
        vars.set('FILENAME', f.name)
        let fnr = 0
        const lines = f.data.split('\n')
        if (lines[lines.length - 1] === '') lines.pop()
        for (const line of lines) {
          vars.set('NR', ++nr); vars.set('FNR', ++fnr)
          setRecord(line)
          try { runRules(r => !r.begin && !r.end && (!r.pat || (r.pat.k === 're' ? re(r.pat).test(fields[0]) : truthy(ev(r.pat))))) } catch (e) { if (!(e instanceof Next)) throw e }
        }
      }
    }
    runRules(r => !!r.end)
  } catch (e) {
    if (e instanceof Exit) {
      code = e.code
      try { runRules(r => !!r.end) } catch (e2) { if (!(e2 instanceof Exit)) throw e2 }
    } else throw e
  }
  return { out, files, code }
}
