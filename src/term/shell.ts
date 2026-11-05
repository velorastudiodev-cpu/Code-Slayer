// Interpreter Bash simulasi di atas VFS. Perilaku output mengikuti GNU bash 5 + coreutils (locale C);
// soal Bash divalidasi terhadap bash asli saat build.
import { ansiEscape, parse, SyntaxError_, type Node, type Part, type Redir, type Word } from './parse.ts'
import { FsError, VFS } from './vfs.ts'
import { COMMANDS } from './coreutils.ts'

export type Stream = { data: string; pos: number; regular?: boolean }
export type IO = { stdin: Stream; out: (s: string) => void; err: (s: string) => void }
export type Ctx = IO & { args: string[]; sh: Shell; name: string }
export type Command = (c: Ctx) => number | Promise<number>
export type Proc = { pid: number; user: string; cmd: string; port?: number }
type Value = string | string[] | Record<string, string>
type Var = { v: Value; x?: boolean; ro?: boolean; int?: boolean }

export class ExitSignal { code: number; constructor(code: number) { this.code = code } }
class ReturnSignal { code: number; constructor(code: number) { this.code = code } }
class LoopSignal { kind: 'break' | 'continue'; n: number; constructor(kind: 'break' | 'continue', n: number) { this.kind = kind; this.n = n } }
export class StepLimit extends Error {}
class ExpandError extends Error {}

export const readAll = (s: Stream) => { const d = s.data.slice(s.pos); s.pos = s.data.length; return d }
export function readLine(s: Stream): string | null {
  if (s.pos >= s.data.length) return null
  let e = s.data.indexOf('\n', s.pos)
  const line = e < 0 ? s.data.slice(s.pos) : s.data.slice(s.pos, e)
  if (e < 0) e = s.data.length - 1
  s.pos = e + 1
  return line
}

type Seg = { s: string; q: boolean }
type Field = { segs: Seg[]; has: boolean }

export type ShellOpts = {
  fs?: VFS; user?: string; cwd?: string; env?: Record<string, string>; binaries?: Record<string, Command>
  procs?: Proc[]; maxSteps?: number; interactive?: boolean; name?: string
}

export class Shell {
  fs: VFS
  user: string
  cwd: string
  scopes: Map<string, Var>[] = [new Map()]
  funcs = new Map<string, Node>()
  pos: string[] = []
  status = 0
  opts = { e: false, u: false, x: false, pipefail: false }
  history: string[] = []
  binaries: Record<string, Command>
  procs: Proc[]
  steps = { n: 0 }
  maxSteps: number
  interactive: boolean
  name: string
  cond = 0 // >0: sedang mengevaluasi kondisi (set -e tidak berlaku)
  private eSafe = false
  cleared = false // perintah clear dipanggil (untuk terminal UI)
  static procN = 0
  subst: number | null = null // status command substitution terakhir di perintah ini
  exitTrap: string | undefined = undefined // trap '...' EXIT
  isSub = false // subshell ( ... ) / $( ... ): error ekspansi keluar dengan status 1, bukan 127

  constructor(o: ShellOpts = {}) {
    this.fs = o.fs ?? new VFS()
    this.user = o.user ?? 'slayer'
    const home = this.fs.user(this.user).home
    this.cwd = o.cwd ?? home
    this.binaries = o.binaries ?? {}
    this.procs = o.procs ?? [{ pid: 1, user: 'root', cmd: '/sbin/init' }, { pid: 312, user: this.user, cmd: '-bash' }]
    this.maxSteps = o.maxSteps ?? 200_000
    this.interactive = o.interactive ?? false
    this.name = o.name ?? 'bash'
    const env: Record<string, string> = {
      HOME: home, USER: this.user, LOGNAME: this.user, PWD: this.cwd, SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin',
      HOSTNAME: 'kisatsutai', LANG: 'C', TERM: 'xterm', IFS: ' \t\n', ...o.env,
    }
    for (const [k, v] of Object.entries(env)) this.scopes[0].set(k, { v, x: k !== 'IFS' })
  }

  // ---------------------------------------------------------------- variabel
  private find(name: string) { for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].get(name); if (v) return v } }
  get(name: string): string | undefined {
    if (name === 'RANDOM') return String(Math.floor(Math.random() * 32768))
    if (name === 'PWD') return this.cwd
    const v = this.find(name)?.v
    if (v === undefined) return undefined
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : v['0']
  }
  getVar(name: string) { return this.find(name) }
  set(name: string, value: Value, opts: { local?: boolean; export?: boolean } = {}) {
    const scope = opts.local ? this.scopes[this.scopes.length - 1] : this.scopes.find(s => s.has(name)) ?? this.scopes[0]
    const cur = scope.get(name)
    if (cur?.ro) throw new ExpandError(`${name}: readonly variable`)
    if (cur?.int && typeof value === 'string') value = String(this.arith(value))
    if (name === 'PWD' && typeof value === 'string') this.cwd = value
    scope.set(name, { ...cur, v: value, x: cur?.x || opts.export })
  }
  unset(name: string) { for (const s of this.scopes) { const v = s.get(name); if (v?.ro) throw new ExpandError(`${name}: cannot unset: readonly variable`); s.delete(name) } }
  env() { const e: Record<string, string> = {}; for (const s of this.scopes) for (const [k, v] of s) if (v.x && typeof v.v === 'string') e[k] = v.v; e.PWD = this.cwd; return e }

  subshell(): Shell {
    const c = Object.create(Shell.prototype) as Shell
    Object.assign(c, this)
    c.scopes = this.scopes.map(s => new Map([...s].map(([k, v]) => [k, { ...v, v: Array.isArray(v.v) ? [...v.v] : typeof v.v === 'object' ? { ...v.v } : v.v }])))
    c.funcs = new Map(this.funcs)
    c.pos = [...this.pos]
    c.opts = { ...this.opts }
    c.isSub = true
    c.exitTrap = undefined // subshell tidak mewarisi trap EXIT (sama dengan bash)
    return c
  }

  abs(p: string) { return VFS.norm(p, this.cwd, this.fs.user(this.user).home) }

  // ---------------------------------------------------------------- menjalankan
  // Jalankan skrip lengkap; stdout/stderr dikumpulkan.
  async run(src: string, stdin = '', opts: { regularStdin?: boolean } = {}) {
    let stdout = '', stderr = ''
    const io: IO = { stdin: { data: stdin, pos: 0, regular: opts.regularStdin }, out: s => { stdout += s }, err: s => { stderr += s } }
    const code = await this.exec_(src, io)
    if (!this.interactive) await this.runExitTrap(io)
    return { stdout, stderr, code }
  }
  async exec_(src: string, io: IO): Promise<number> {
    let tree: Node
    try { tree = parse(src) } catch (e) {
      if (e instanceof SyntaxError_) { io.err(`${this.name}: ${e.message}\n`); return (this.status = 2) }
      throw e
    }
    try {
      return (this.status = await this.exec(tree, io))
    } catch (e) {
      if (e instanceof ExitSignal) return (this.status = e.code)
      if (e instanceof StepLimit) { io.err(`${this.name}: dihentikan: lebih dari ${this.maxSteps} langkah (infinite loop?)\n`); return (this.status = 124) }
      if (e instanceof ReturnSignal) return (this.status = e.code)
      if (e instanceof LoopSignal) return (this.status = 0)
      throw e
    }
  }

  async runExitTrap(io: IO) {
    const t = this.exitTrap
    if (t === undefined) return
    this.exitTrap = undefined
    const st = this.status
    await this.exec_(t, io)
    this.status = st
  }

  private step() { if (++this.steps.n > this.maxSteps) throw new StepLimit() }

  async exec(n: Node, io: IO): Promise<number> {
    switch (n.k) {
      case 'list': {
        let st = 0
        for (const item of n.items) {
          this.eSafe = false
          st = this.status = await this.exec(item, io)
          if (st && this.opts.e && !this.cond && !this.eSafe) throw new ExitSignal(st)
        }
        return st
      }
      case 'andor': {
        // set -e tidak berlaku untuk perintah selain yang terakhir di rantai && ||.
        this.cond++
        let st: number
        try { st = await this.exec(n.first, io) } finally { this.cond-- }
        for (let k = 0; k < n.rest.length; k++) {
          const [op, node] = n.rest[k]
          const last = k === n.rest.length - 1
          this.status = st
          if ((op === '&&') === (st === 0)) {
            if (!last) this.cond++
            try { st = await this.exec(node, io) } finally { if (!last) this.cond-- }
          } else if (last) this.eSafe = true
        }
        return st
      }
      case 'pipe': return this.pipe(n, io)
      case 'simple': return this.simple(n, io)
      case 'func': this.funcs.set(n.name, n.body); return 0
      default: return this.compound(n, io)
    }
  }

  private async pipe(n: Extract<Node, { k: 'pipe' }>, io: IO) {
    if (n.bang) this.cond++
    let st: number
    if (n.cmds.length === 1) st = await this.exec(n.cmds[0], io)
    else {
      let input = io.stdin
      const sts: number[] = []
      for (let i = 0; i < n.cmds.length; i++) {
        const last = i === n.cmds.length - 1
        let buf = ''
        const sub = this.subshell()
        try { sts.push(await sub.exec(n.cmds[i], { stdin: input, out: last ? io.out : s => { buf += s }, err: io.err })) }
        catch (e) { if (e instanceof ExitSignal) sts.push(e.code); else throw e }
        input = { data: buf, pos: 0 }
      }
      st = this.opts.pipefail ? [...sts].reverse().find(s => s !== 0) ?? 0 : sts[sts.length - 1]
    }
    if (n.bang) { this.cond--; return st ? 0 : 1 }
    return st
  }

  private async compound(n: Node, io: IO): Promise<number> {
    if (!('redirs' in n)) return 0
    const r = await this.redirect(n.redirs, io)
    if (!r) return 1
    io = r
    switch (n.k) {
      case 'group': return this.exec(n.body, io)
      case 'subshell': {
        const sub = this.subshell()
        let code: number
        try { code = await sub.exec(n.body, io) } catch (e) { if (e instanceof ExitSignal) code = e.code; else throw e }
        sub.status = code
        await sub.runExitTrap(io)
        return code
      }
      case 'if': {
        for (const [c, body] of n.clauses) {
          this.cond++
          const st = await this.exec(c, io).finally(() => this.cond--)
          if (st === 0) return this.exec(body, io)
        }
        return n.else ? this.exec(n.else, io) : 0
      }
      case 'while': {
        let st = 0
        for (;;) {
          this.step()
          this.cond++
          const c = await this.exec(n.cond, io).finally(() => this.cond--)
          if ((c === 0) === n.until) break
          const r = await this.loopBody(n.body, io)
          if (r === 'break') break
          if (typeof r === 'number') st = r
        }
        return st
      }
      case 'for': {
        const items = n.words ? await this.expandWords(n.words, io) : [...this.pos]
        let st = 0
        for (const it of items) {
          this.step()
          this.set(n.name, it)
          const r = await this.loopBody(n.body, io)
          if (r === 'break') break
          if (typeof r === 'number') st = r
        }
        return st
      }
      case 'cfor': {
        if (n.init) await this.arithExpand(n.init, io)
        let st = 0
        for (;;) {
          this.step()
          if (n.cond && (await this.arithExpand(n.cond, io)) === 0) break
          const r = await this.loopBody(n.body, io)
          if (r === 'break') break
          if (typeof r === 'number') st = r
          if (n.step) await this.arithExpand(n.step, io)
        }
        return st
      }
      case 'case': {
        const w = (await this.fields(n.word, io)).map(f => f.segs.map(s => s.s).join('')).join(' ')
        for (let i = 0; i < n.items.length; i++) {
          const it = n.items[i]
          let hit = false
          for (const p of it.pats) if (this.patRe(await this.patternSegs(p, io)).test(w)) { hit = true; break }
          if (!hit) continue
          let st = await this.exec(it.body, io)
          // ;& lanjut ke badan berikutnya tanpa cek
          while (n.items[i].fall === ';&' && i + 1 < n.items.length) st = await this.exec(n.items[++i].body, io)
          return st
        }
        return 0
      }
      case 'test': return (await this.dtest(n.args, io)) ? 0 : 1
      case 'arith': return (await this.arithExpand(n.src, io)) ? 0 : 1
    }
    return 0
  }

  private async loopBody(body: Node, io: IO): Promise<number | 'break' | 'continue'> {
    try { return await this.exec(body, io) } catch (e) {
      if (e instanceof LoopSignal) {
        if (e.n > 1) { e.n--; throw e }
        return e.kind
      }
      throw e
    }
  }

  // ---------------------------------------------------------------- perintah sederhana
  private async simple(n: Extract<Node, { k: 'simple' }>, io: IO): Promise<number> {
    this.step()
    let argv: string[]
    this.subst = null
    try { argv = await this.expandWords(n.words, io) } catch (e) {
      if (e instanceof ExpandError) { io.err(`${this.name}: ${e.message}\n`); if (!this.interactive) throw new ExitSignal(e.message.endsWith('unbound variable') && !this.isSub ? 127 : 1); return 1 }
      throw e
    }
    const substStatus = this.subst ?? 0
    // Assignment tanpa perintah: variabel shell.
    const assigns: [string, Value, boolean, string | undefined][] = []
    try {
      for (const a of n.assigns) {
        const idx = a.index ? await this.expandString(a.index, io) : undefined
        if (a.value.parts[0]?.t === 'array') assigns.push([a.name, await this.arrayLiteral((a.value.parts[0] as { src: string }).src, io), a.append, undefined])
        else assigns.push([a.name, await this.expandString(a.value, io), a.append, idx])
      }
    } catch (e) { if (e instanceof ExpandError) { io.err(`${this.name}: ${e.message}\n`); return 1 } throw e }
    const assign = () => {
      for (const [name, val, append, idx] of assigns) {
        const cur = this.getVar(name)?.v
        if (idx !== undefined) {
          if (cur && typeof cur === 'object' && !Array.isArray(cur)) { const m = { ...cur }; m[idx] = append ? (m[idx] ?? '') + val : (val as string); this.set(name, m) }
          else { const arr = Array.isArray(cur) ? [...cur] : cur !== undefined ? [cur as string] : []; const i = this.arith(idx); arr[i] = append ? (arr[i] ?? '') + val : (val as string); this.set(name, Array.from(arr, x => x ?? '')) }
        } else if (Array.isArray(val)) this.set(name, append && Array.isArray(cur) ? [...cur, ...val] : val)
        else if (append && this.getVar(name)?.int) this.set(name, String(this.arith(String(cur ?? 0)) + this.arith(val as string)))
        else this.set(name, append ? (typeof cur === 'string' ? cur : '') + val : val)
      }
    }
    if (!argv.length) {
      try { assign() } catch (e) { if (e instanceof ExpandError) { io.err(`${this.name}: ${e.message}\n`); return 1 } throw e }
      const r = await this.redirect(n.redirs, io)
      return r ? substStatus : 1
    }
    if (this.opts.x) io.err('+ ' + argv.join(' ') + '\n')
    const r = await this.redirect(n.redirs, io)
    if (!r) return 1
    // VAR=x perintah: hanya untuk perintah itu.
    if (assigns.length) {
      this.scopes.push(new Map())
      for (const [name, val] of assigns) this.scopes[this.scopes.length - 1].set(name, { v: val, x: true })
      try { return await this.invoke(argv, r) } finally { this.scopes.pop() }
    }
    return this.invoke(argv, r)
  }

  async invoke(argv: string[], io: IO): Promise<number> {
    const [name] = argv
    const ctx: Ctx = { ...io, args: argv.slice(1), sh: this, name }
    const f = this.funcs.get(name)
    if (f) {
      const savePos = this.pos
      this.pos = argv.slice(1)
      this.scopes.push(new Map())
      try { return await this.exec(f, io) } catch (e) {
        if (e instanceof ReturnSignal) return e.code
        throw e
      } finally { this.scopes.pop(); this.pos = savePos }
    }
    const b = BUILTINS[name]
    if (b) return b(ctx)
    if (name.includes('/')) return this.execPath(name, argv.slice(1), io)
    const bin = this.binaries[name] ?? COMMANDS[name]
    if (bin) {
      try { return await bin(ctx) } catch (e) {
        if (e instanceof FsError) { io.err(`${name}: ${e.message}\n`); return 1 }
        throw e
      }
    }
    io.err(`${this.name}: ${name}: command not found\n`)
    return 127
  }

  async execPath(path: string, args: string[], io: IO): Promise<number> {
    const abs = this.abs(path)
    let node
    try { node = this.fs.stat(this.user, abs) } catch (e) { io.err(`${this.name}: ${path}: ${(e as Error as FsError).reason ?? 'No such file or directory'}\n`); return 127 }
    if (node.type === 'dir') { io.err(`${this.name}: ${path}: Is a directory\n`); return 126 }
    if (!this.fs.can(this.user, node, 1)) { io.err(`${this.name}: ${path}: Permission denied\n`); return 126 }
    if (node.bin) {
      const b = this.binaries[node.bin] ?? COMMANDS[node.bin]
      if (!b) { io.err(`${this.name}: ${path}: cannot execute binary file\n`); return 126 }
      // setuid root: program berjalan sebagai pemilik file.
      const runAs = node.mode & 0o4000 ? node.owner : this.user
      const sh = runAs === this.user ? this : Object.assign(this.subshell(), { user: runAs })
      return b({ ...io, args, sh, name: path })
    }
    if (!this.fs.can(this.user, node, 4)) { io.err(`${this.name}: ${path}: Permission denied\n`); return 126 }
    return this.script(node.content, path, args, io)
  }

  async script(src: string, name: string, args: string[], io: IO) {
    const sub = this.subshell()
    sub.pos = args
    sub.funcs = new Map()
    sub.scopes = [new Map([...this.scopes[0]].filter(([, v]) => v.x))]
    sub.set('0', name)
    sub.opts = { e: false, u: false, x: false, pipefail: false }
    return sub.exec_(src, io)
  }

  // ---------------------------------------------------------------- redirection
  private async redirect(redirs: Redir[], io: IO): Promise<IO | null> {
    if (!redirs.length) return io
    const fds: { 0: Stream; 1: (s: string) => void; 2: (s: string) => void } = { 0: io.stdin, 1: io.out, 2: io.err }
    const sink = (path: string, append: boolean) => {
      if (path === '/dev/null') return () => {}
      if (path === '/dev/stdout') return io.out
      if (path === '/dev/stderr') return io.err
      const abs = this.abs(path)
      this.fs.write(this.user, abs, '', append)
      return (s: string) => { this.fs.write(this.user, abs, s, true) }
    }
    try {
      for (const r of redirs) {
        if (r.here) {
          const body = r.here.quoted ? r.here.body : await this.expandHeredoc(r.here.body, io)
          fds[0] = { data: body, pos: 0 }
          continue
        }
        const target = await this.expandString(r.target, io)
        const fd = (r.fd ?? (r.op.startsWith('<') ? 0 : 1)) as 0 | 1 | 2
        switch (r.op) {
          case '<': fds[0] = target === '/dev/null' ? { data: '', pos: 0 } : { data: this.fs.read(this.user, this.abs(target)), pos: 0, regular: true }; break
          case '<<<': fds[0] = { data: target + '\n', pos: 0 }; break
          case '>': case '>|': (fds as Record<number, unknown>)[fd] = sink(target, false); break
          case '>>': (fds as Record<number, unknown>)[fd] = sink(target, true); break
          case '&>': fds[1] = fds[2] = sink(target, false); break
          case '&>>': fds[1] = fds[2] = sink(target, true); break
          case '>&':
            if (target === '1' || target === '2') (fds as Record<number, unknown>)[fd] = fds[+target as 1 | 2]
            else if (target === '-') (fds as Record<number, unknown>)[fd] = () => {}
            else fds[1] = fds[2] = sink(target, false)
            break
        }
      }
    } catch (e) {
      if (e instanceof FsError) { io.err(`${this.name}: ${e.message}\n`); return null }
      if (e instanceof ExpandError) { io.err(`${this.name}: ${e.message}\n`); return null }
      throw e
    }
    return { stdin: fds[0], out: fds[1], err: fds[2] }
  }

  private async expandHeredoc(body: string, io: IO) {
    // Isi heredoc tanpa kutip: $var, $(..), `..` diekspansi; kutip biasa tetap literal.
    let out = '', i = 0
    while (i < body.length) {
      const c = body[i]
      if (c === '\\' && '$`\\'.includes(body[i + 1])) { out += body[i + 1]; i += 2; continue }
      if (c === '$' || c === '`') {
        const m = /^(\$\(\([\s\S]*?\)\)|\$\([\s\S]*?\)|\$\{[^}]*\}|\$[A-Za-z_]\w*|\$[0-9@*#?$!]|`[^`]*`)/.exec(body.slice(i))
        if (m) { out += await this.expandString({ parts: new Parser2(m[0]).parts(), raw: m[0] }, io); i += m[0].length; continue }
      }
      out += c
      i++
    }
    return out
  }

  // ---------------------------------------------------------------- ekspansi
  async expandWords(words: Word[], io: IO): Promise<string[]> {
    const out: string[] = []
    for (const w0 of words) for (const w of braceExpand(w0)) {
      for (const f of await this.fields(w, io)) {
        const globbable = f.segs.some(s => !s.q && /[*?[]/.test(s.s))
        if (globbable) {
          const m = this.glob(f.segs)
          if (m.length) { out.push(...m); continue }
        }
        out.push(f.segs.map(s => s.s).join(''))
      }
    }
    return out
  }
  async expandString(w: Word, io: IO): Promise<string> {
    const fs = await this.fields(w, io, false)
    return fs.map(f => f.segs.map(s => s.s).join('')).join(' ')
  }
  private async patternSegs(w: Word, io: IO) { return (await this.fields(w, io, false)).flatMap(f => f.segs) }

  // Bagi kata menjadi field (word splitting hanya untuk ekspansi tanpa kutip).
  private async fields(w: Word, io: IO, split = true): Promise<Field[]> {
    const out: Field[] = []
    let cur: Field = { segs: [], has: false }
    const push = () => { if (cur.segs.some(s => s.s) || cur.has) out.push(cur); cur = { segs: [], has: false } }
    const ifs = this.get('IFS') ?? ' \t\n'
    for (const p of w.parts) {
      if (p.t === 'lit') { cur.segs.push({ s: p.v, q: p.q }); if (p.q) cur.has = true; continue }
      if (p.t === 'tilde') { cur.segs.push({ s: p.user ? this.fs.users.find(u => u.name === p.user)?.home ?? '~' + p.user : this.get('HOME') ?? '/', q: true }); continue }
      if (p.t === 'array') { cur.segs.push({ s: p.src, q: true }); continue }
      if (p.t === 'procsub') {
        let out = ''
        await this.subshell().exec_(p.src, { stdin: io.stdin, out: s => { out += s }, err: io.err })
        const path = `/tmp/.procsub-${++Shell.procN}`
        this.fs.writeAs(this.user, path, out, 0o600)
        cur.segs.push({ s: path, q: true })
        continue
      }
      // "$@" dan "${arr[@]}": tiap elemen jadi field sendiri.
      const multi = await this.multi(p, io)
      if (multi && p.q) {
        if (!multi.length) { continue }
        multi.forEach((m, i) => { if (i) push(); cur.segs.push({ s: m, q: true }); cur.has = true })
        continue
      }
      const val = multi ? multi.join(' ') : await this.value(p, io)
      if (p.q || !split) { cur.segs.push({ s: val, q: true }); if (p.q) cur.has = true; continue }
      // Word splitting: spasi IFS berurutan = satu pemisah; pemisah non-spasi menghasilkan field kosong.
      const ws = [...ifs].filter(ch => ' \t\n'.includes(ch)).join('')
      const nws = [...ifs].filter(ch => !' \t\n'.includes(ch)).join('')
      if (!val) continue
      const lead = ws.includes(val[0]), trail = ws.includes(val[val.length - 1])
      let v = val
      while (v && ws.includes(v[0])) v = v.slice(1)
      while (v && ws.includes(v[v.length - 1])) v = v.slice(0, -1)
      if (lead) push()
      if (!v) continue
      const pieces: string[] = []
      let buf = '', k = 0
      while (k < v.length) {
        const ch = v[k]
        if (nws.includes(ch)) {
          k++
          while (k < v.length && ws.includes(v[k])) k++
          pieces.push(buf); buf = ''
          continue
        }
        if (ws.includes(ch)) {
          while (k < v.length && ws.includes(v[k])) k++
          if (k < v.length && nws.includes(v[k])) { k++; while (k < v.length && ws.includes(v[k])) k++ }
          pieces.push(buf); buf = ''
          continue
        }
        buf += ch; k++
      }
      if (buf || !nws.includes(v[v.length - 1])) pieces.push(buf)
      pieces.forEach((x, i) => { if (i) push(); cur.segs.push({ s: x, q: true }); if (i && !x) cur.has = true })
      if (trail) push()
    }
    push()
    return out
  }

  private async multi(p: Part, _io: IO): Promise<string[] | null> {
    if (p.t === 'var' && (p.name === '@' || (p.name === '*' && !p.q))) return [...this.pos]
    if (p.t === 'param') {
      const m = /^([A-Za-z_]\w*|@)(?:\[[@]\])?(?::(-?\s*\d+)(?::(\d+))?)?$/.exec(p.src)
      if (m && (p.src.includes('[@]') || (m[1] === '@'))) {
        const v = m[1] === '@' ? this.pos : this.getVar(m[1])?.v
        let xs = v === undefined ? [] : typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter(x => x !== undefined) : Object.values(v)
        if (m[2] !== undefined) {
          let off = +m[2].trim()
          if (m[1] === '@') off = off > 0 ? off - 1 : off
          if (off < 0) off = Math.max(0, xs.length + off)
          xs = xs.slice(off, m[3] !== undefined ? off + +m[3] : undefined)
        }
        return xs
      }
      const k = /^!([A-Za-z_]\w*)\[[@*]\]$/.exec(p.src)
      if (k) { const v = this.getVar(k[1])?.v; return v === undefined ? [] : typeof v === 'string' ? ['0'] : Array.isArray(v) ? v.map((_, i) => String(i)) : Object.keys(v) }
    }
    return null
  }

  private special(name: string): string | undefined {
    switch (name) {
      case '?': return String(this.status)
      case '#': return String(this.pos.length)
      case '*': return this.pos.join((this.get('IFS') ?? ' ')[0] ?? '')
      case '@': return this.pos.join(' ')
      case '$': return '312'
      case '!': return '313'
      case '0': return this.get('0') ?? this.name
      case '-': return 'hB'
    }
    if (/^\d+$/.test(name)) return this.pos[+name - 1]
    return this.get(name)
  }

  private async value(p: Part, io: IO): Promise<string> {
    switch (p.t) {
      case 'var': {
        const v = this.special(p.name)
        if (v === undefined && this.opts.u && !'@*'.includes(p.name)) throw new ExpandError(`${p.name}: unbound variable`)
        return v ?? ''
      }
      case 'cmd': {
        const sub = this.subshell()
        let out = ''
        const st = await sub.exec_(p.src, { stdin: io.stdin, out: s => { out += s }, err: io.err })
        this.subst = st
        return out.replace(/\n+$/, '')
      }
      case 'arith': return String(await this.arithExpand(p.src, io))
      case 'param': return this.param(p.src, io)
    }
    return ''
  }

  private async param(src: string, io: IO): Promise<string> {
    // ${#var} ${#arr[@]}
    let m = /^#([A-Za-z_]\w*|[0-9@*#?])(\[([@*]|[^\]]+)\])?$/.exec(src)
    if (m && src !== '#') {
      if (m[3] === '@' || m[3] === '*') { const v = this.getVar(m[1])?.v; return String(v === undefined ? 0 : typeof v === 'string' ? 1 : Array.isArray(v) ? v.filter(x => x !== undefined).length : Object.keys(v).length) }
      return String(((m[2] ? await this.elem(m[1], m[3]!, io) : this.special(m[1])) ?? '').length)
    }
    if (src === '#') return String(this.pos.length)
    // ${!ref}
    m = /^!([A-Za-z_]\w*)$/.exec(src)
    if (m) return this.get(this.get(m[1]) ?? '') ?? ''
    m = /^([A-Za-z_]\w*|[0-9]+|[@*#?$!])(\[([^\]]*)\])?([\s\S]*)$/.exec(src)
    if (!m) throw new ExpandError(`\${${src}}: bad substitution`)
    const [, name, , idx, op] = m
    let val: string | undefined
    if (idx !== undefined) val = idx === '@' || idx === '*' ? (await this.multi({ t: 'param', src: `${name}[@]`, q: false }, io))!.join(' ') : await this.elem(name, idx, io)
    else val = this.special(name)
    const unset = val === undefined
    const empty = !val
    const arg = async (s: string) => this.expandString({ parts: new Parser2(s).parts(), raw: s }, io)
    if (!op) {
      if (unset && this.opts.u) throw new ExpandError(`${name}: unbound variable`)
      return val ?? ''
    }
    let o: RegExpExecArray | null
    if ((o = /^(:?)([-=+?])([\s\S]*)$/.exec(op))) {
      const test = o[1] ? empty : unset
      switch (o[2]) {
        case '-': return test ? arg(o[3]) : val!
        case '=': if (test) { const v = await arg(o[3]); this.set(name, v); return v } return val!
        case '+': return test ? '' : arg(o[3])
        case '?': if (test) throw new ExpandError(`${name}: ${o[3] ? await arg(o[3]) : 'parameter null or not set'}`); return val!
      }
    }
    const v = val ?? ''
    if ((o = /^(##?|%%?)([\s\S]*)$/.exec(op))) {
      const re = this.patRe([{ s: await arg(o[2]), q: false }], false)
      const greedy = o[1].length === 2
      if (o[1][0] === '#') {
        const lens = [...Array(v.length + 1).keys()]
        for (const l of greedy ? lens.reverse() : lens) if (re.test(v.slice(0, l))) return v.slice(l)
      } else {
        const starts = [...Array(v.length + 1).keys()]
        for (const s of greedy ? starts : starts.reverse()) if (re.test(v.slice(s))) return v.slice(0, s)
      }
      return v
    }
    if ((o = /^\/([\/#%]?)((?:\\.|[^/])*)(?:\/([\s\S]*))?$/.exec(op))) {
      const pat = await arg(o[2]), rep = o[3] !== undefined ? await arg(o[3]) : ''
      const body = globToRe(pat)
      if (o[1] === '#') return v.replace(new RegExp('^' + body), rep.replace(/\$/g, '$$$$'))
      if (o[1] === '%') return v.replace(new RegExp(body + '$'), rep.replace(/\$/g, '$$$$'))
      return v.replace(new RegExp(body, o[1] === '/' ? 'g' : ''), rep.replace(/\$/g, '$$$$'))
    }
    if ((o = /^:(-?\s*[^:]*)(?::([\s\S]*))?$/.exec(op))) {
      let off = this.arith(o[1].trim())
      if (off < 0) off = Math.max(0, v.length + off)
      if (o[2] === undefined) return v.slice(off)
      let len = this.arith(o[2])
      if (len < 0) return v.slice(off, Math.max(off, v.length + len))
      return v.slice(off, off + len)
    }
    if (op === '^^') return v.toUpperCase()
    if (op === ',,') return v.toLowerCase()
    if (op === '^') return v.charAt(0).toUpperCase() + v.slice(1)
    if (op === ',') return v.charAt(0).toLowerCase() + v.slice(1)
    throw new ExpandError(`\${${src}}: bad substitution`)
  }

  private async elem(name: string, idx: string, io: IO) {
    const v = this.getVar(name)?.v
    if (v === undefined) return undefined
    if (typeof v === 'object' && !Array.isArray(v)) return v[await this.expandString({ parts: new Parser2(idx).parts(), raw: idx }, io)]
    const i = this.arith(await this.expandString({ parts: new Parser2(idx).parts(), raw: idx }, io))
    if (typeof v === 'string') return i === 0 ? v : undefined
    return v[i < 0 ? v.length + i : i]
  }

  async arrayLiteral(src: string, io: IO): Promise<string[] | Record<string, string>> {
    const t = parse('x ' + src)
    const words = (t as { items: { words: Word[] }[] }).items[0]?.words.slice(1) ?? []
    // ([kunci]=nilai ...) → array asosiatif / berindeks
    if (words.length && words.every(w => w.parts[0]?.t === 'lit' && /^\[[^\]]*\]=/.test((w.parts[0] as { v: string }).v))) {
      const out: Record<string, string> = {}
      for (const w of words) {
        const p0 = w.parts[0] as { v: string; q: boolean }
        const k = p0.v.slice(1, p0.v.indexOf(']'))
        out[k] = await this.expandString({ raw: w.raw, parts: [{ t: 'lit', v: p0.v.slice(p0.v.indexOf(']') + 2), q: p0.q }, ...w.parts.slice(1)] }, io)
      }
      return out
    }
    return this.expandWords(words, io)
  }

  // ---------------------------------------------------------------- glob & pola
  patRe(segs: Seg[], anchored = true) {
    const body = segs.map(s => (s.q ? escapeRe(s.s) : globToRe(s.s))).join('')
    return new RegExp(anchored ? `^${body}$` : `^${body}$`, 's')
  }
  private glob(segs: Seg[]): string[] {
    // Pecah per komponen path; komponen tanpa wildcard dicocokkan apa adanya.
    const comps: Seg[][] = [[]]
    for (const s of segs) {
      const pieces = s.s.split('/')
      pieces.forEach((p, i) => { if (i) comps.push([]); if (p) comps[comps.length - 1].push({ s: p, q: s.q }) })
    }
    const absolute = segs[0]?.s.startsWith('/')
    let bases = [absolute ? '/' : '']
    for (let ci = 0; ci < comps.length; ci++) {
      const c = comps[ci]
      if (!c.length) continue
      const wild = c.some(s => !s.q && /[*?[]/.test(s.s))
      const next: string[] = []
      for (const b of bases) {
        const dirAbs = this.abs(b || '.')
        if (!wild) { const p = b + (b && !b.endsWith('/') ? '/' : '') + c.map(s => s.s).join(''); if (this.fs.exists(this.user, this.abs(p))) next.push(p); continue }
        let names: string[]
        try { names = this.fs.list(this.user, dirAbs) } catch { continue }
        const re = this.patRe(c)
        const dot = c[0].s.startsWith('.')
        for (const nm of names) if (re.test(nm) && (dot || !nm.startsWith('.'))) next.push(b + (b && !b.endsWith('/') ? '/' : '') + nm)
      }
      bases = next.sort()
      if (!bases.length) return []
    }
    return bases
  }

  // ---------------------------------------------------------------- aritmetika
  async arithExpand(src: string, io: IO) {
    const s = await this.expandString({ parts: new Parser2(src).parts(), raw: src }, io)
    try { return this.arith(s) } catch (e) {
      if (e instanceof ExpandError) { io.err(`${this.name}: ${e.message}\n`); if (!this.interactive) throw new ExitSignal(1); return 0 }
      throw e
    }
  }
  arith(src: string): number { return new Arith(src, this).run() }

  // ---------------------------------------------------------------- [[ ]]
  private async dtest(args: Word[], io: IO): Promise<boolean> {
    let i = 0
    const raw = (k: number) => args[k]?.raw
    const str = async (w: Word) => this.expandString(w, io)
    const or = async (): Promise<boolean> => { let v = await and(); while (raw(i) === '||') { i++; const r = await and(); v = v || r } return v }
    const and = async (): Promise<boolean> => { let v = await not(); while (raw(i) === '&&') { i++; const r = await not(); v = v && r } return v }
    const not = async (): Promise<boolean> => { if (raw(i) === '!') { i++; return !(await not()) } return prim() }
    const prim = async (): Promise<boolean> => {
      if (raw(i) === '(') { i++; const v = await or(); i++; return v }
      const a = raw(i)!
      if (/^-[a-zA-Z]$/.test(a) && i + 1 < args.length && !BINOPS.has(raw(i + 1)!)) { i++; return unaryTest(this, a, await str(args[i++])) }
      const left = await str(args[i++])
      const op = raw(i)
      if (op && BINOPS.has(op) || op === '=~') {
        i++
        const rw = args[i++]
        if (op === '=~') {
          const pat = (await this.fields(rw, io, false)).flatMap(f => f.segs).map(s => (s.q ? escapeRe(s.s) : s.s)).join('')
          const mm = new RegExp(ereToJs(pat)).exec(left)
          this.set('BASH_REMATCH', mm ? [...mm].map(x => x ?? '') : [])
          return !!mm
        }
        if (op === '==' || op === '=' || op === '!=') { const hit = this.patRe(await this.patternSegs(rw, io)).test(left); return op === '!=' ? !hit : hit }
        return binaryTest(this, left, op, await str(rw))
      }
      return left !== ''
    }
    return or()
  }
}

// ---------------------------------------------------------------- utilitas
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
export function globToRe(g: string) {
  let r = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '\\' && i + 1 < g.length) { r += escapeRe(g[++i]); continue }
    if (c === '*') r += '[\\s\\S]*'
    else if (c === '?') r += '[\\s\\S]'
    else if (c === '[') {
      const j = g.indexOf(']', i + 2)
      if (j < 0) { r += '\\['; continue }
      let cls = g.slice(i + 1, j)
      if (cls[0] === '!' || cls[0] === '^') cls = '^' + cls.slice(1)
      r += '[' + posixClasses(cls).replace(/\\/g, '\\\\') + ']'
      i = j
    } else r += escapeRe(c)
  }
  return r
}
const CLASSES: Record<string, string> = { alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', blank: ' \\t' }
export const posixClasses = (s: string) => s.replace(/\[:(\w+):\]/g, (_, c) => CLASSES[c] ?? '')
// ERE (grep -E, [[ =~ ]], awk) → regex JS
export function ereToJs(p: string) {
  let r = '', i = 0
  while (i < p.length) {
    const c = p[i]
    if (c === '\\') { r += p.slice(i, i + 2); i += 2; continue }
    if (c === '[') {
      let j = i + 1
      if (p[j] === '^') j++
      if (p[j] === ']') j++
      while (j < p.length && p[j] !== ']') { if (p[j] === '[' && p[j + 1] === ':') j = p.indexOf(':]', j) + 2; else j++ }
      r += posixClasses(p.slice(i, j + 1)).replace(/(?<!\\)\/|(?<=\[\^?)\]/g, m => '\\' + m)
      i = j + 1
      continue
    }
    if (c === '/') r += '\\/'
    else r += c
    i++
  }
  return r
}
// BRE (grep, sed tanpa -E): \( \) \{ \} \+ \? \| bermakna khusus, tanpa backslash = literal.
export function breToJs(p: string) {
  let r = '', i = 0
  while (i < p.length) {
    const c = p[i]
    if (c === '\\' && i + 1 < p.length) {
      const d = p[i + 1]
      r += '(){}+?|'.includes(d) ? d : d === '<' || d === '>' ? '\\b' : '\\' + d
      i += 2
      continue
    }
    if (c === '[') {
      let j = i + 1
      if (p[j] === '^') j++
      if (p[j] === ']') j++
      while (j < p.length && p[j] !== ']') { if (p[j] === '[' && p[j + 1] === ':') j = p.indexOf(':]', j) + 2; else j++ }
      r += posixClasses(p.slice(i, j + 1)).replace(/\\/g, '\\\\').replace(/(?<=\[\^?)\]/, '\\]')
      i = j + 1
      continue
    }
    if ('(){}+?|/'.includes(c)) r += '\\' + c
    else if (c === '*' && (i === 0 || p[i - 1] === '^' && i === 1)) r += '\\*'
    else r += c
    i++
  }
  return r
}

const BINOPS = new Set(['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef'])
function unaryTest(sh: Shell, op: string, a: string): boolean {
  const node = () => { try { return sh.fs.stat(sh.user, sh.abs(a)) } catch { return undefined } }
  switch (op) {
    case '-z': return a === ''
    case '-n': return a !== ''
    case '-e': case '-a': return !!node()
    case '-f': return node()?.type === 'file'
    case '-d': return node()?.type === 'dir'
    case '-s': return !!node()?.content.length
    case '-r': { const n = node(); return !!n && sh.fs.can(sh.user, n, 4) }
    case '-w': { const n = node(); return !!n && sh.fs.can(sh.user, n, 2) }
    case '-x': { const n = node(); return !!n && sh.fs.can(sh.user, n, 1) }
    case '-u': return !!((node()?.mode ?? 0) & 0o4000)
    case '-O': return node()?.owner === sh.user
    case '-L': case '-h': return false
    case '-v': return sh.getVar(a) !== undefined
  }
  throw new ExpandError(`${op}: unary operator expected`)
}
function binaryTest(sh: Shell, a: string, op: string, b: string): boolean {
  const num = (x: string) => { if (!/^\s*[-+]?\d+\s*$/.test(x)) throw new ExpandError(`${x}: integer expression expected`); return parseInt(x, 10) }
  switch (op) {
    case '=': case '==': return a === b
    case '!=': return a !== b
    case '<': return a < b
    case '>': return a > b
    case '-eq': return num(a) === num(b)
    case '-ne': return num(a) !== num(b)
    case '-lt': return num(a) < num(b)
    case '-le': return num(a) <= num(b)
    case '-gt': return num(a) > num(b)
    case '-ge': return num(a) >= num(b)
  }
  void sh
  return false
}
// test / [ : argumen sudah diekspansi.
export function testArgs(sh: Shell, args: string[]): boolean {
  let i = 0
  const or = (): boolean => { let v = and(); while (args[i] === '-o') { i++; const r = and(); v = v || r } return v }
  const and = (): boolean => { let v = not(); while (args[i] === '-a' && i + 1 < args.length) { i++; const r = not(); v = v && r } return v }
  const not = (): boolean => { if (args[i] === '!' && i + 1 < args.length) { i++; return !not() } return prim() }
  const prim = (): boolean => {
    if (args[i] === '(' && args.length - i >= 3) { i++; const v = or(); i++; return v }
    const a = args[i]
    if (a === undefined) return false
    if (BINOPS.has(args[i + 1]) && i + 2 < args.length) { i += 3; return binaryTest(sh, a, args[i - 2], args[i - 1]) }
    if (/^-[a-zA-Z]$/.test(a) && i + 1 < args.length) { i += 2; return unaryTest(sh, a, args[i - 1]) }
    i++
    return a !== ''
  }
  return or()
}

// Brace expansion: {a,b,c} dan {1..5}, {a..e}, {01..10}, {1..10..2}
function braceExpand(w: Word): Word[] {
  for (let pi = 0; pi < w.parts.length; pi++) {
    const p = w.parts[pi]
    if (p.t !== 'lit' || p.q) continue
    const s = p.v
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '{' || (i > 0 && s[i - 1] === '$')) continue
      let depth = 0, j = i, commas: number[] = []
      for (; j < s.length; j++) {
        if (s[j] === '{') depth++
        else if (s[j] === '}' && --depth === 0) break
        else if (s[j] === ',' && depth === 1) commas.push(j)
      }
      if (j >= s.length) break
      const inner = s.slice(i + 1, j)
      let alts: string[] | null = null
      if (commas.length) { alts = []; let st = i + 1; for (const c of [...commas, j]) { alts.push(s.slice(st, c)); st = c + 1 } }
      else {
        const m = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(inner) ?? /^([a-zA-Z])\.\.([a-zA-Z])(?:\.\.(-?\d+))?$/.exec(inner)
        if (m) {
          const isNum = /\d/.test(m[1])
          const a = isNum ? +m[1] : m[1].charCodeAt(0), b = isNum ? +m[2] : m[2].charCodeAt(0)
          const step = Math.abs(+(m[3] ?? 1)) || 1
          const pad = isNum && (/^-?0\d/.test(m[1]) || /^-?0\d/.test(m[2])) ? Math.max(m[1].length, m[2].length) : 0
          alts = []
          for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? step : -step) alts.push(isNum ? (pad ? String(x).padStart(pad, '0') : String(x)) : String.fromCharCode(x))
        }
      }
      if (!alts) continue
      const pre = s.slice(0, i), post = s.slice(j + 1)
      return alts.flatMap(a => braceExpand({ raw: w.raw, parts: [...w.parts.slice(0, pi), { t: 'lit', v: pre + a + post, q: false }, ...w.parts.slice(pi + 1)] }))
    }
  }
  return [w]
}

// Parser kecil untuk teks di dalam ${..}, $((..)), heredoc: hanya ekspansi $ dan backtick (seperti di dalam kutip ganda).
class Parser2 {
  private s: string
  constructor(s: string) { this.s = s }
  parts(): Part[] {
    const src = this.s
    const out: Part[] = []
    let lit = ''
    const flush = () => { if (lit) out.push({ t: 'lit', v: lit, q: false }); lit = '' }
    for (let i = 0; i < src.length;) {
      const c = src[i]
      if (c === '\\' && i + 1 < src.length) { lit += src[i + 1]; i += 2; continue }
      if (c === "'") { const j = src.indexOf("'", i + 1); if (j > 0) { flush(); out.push({ t: 'lit', v: src.slice(i + 1, j), q: true }); i = j + 1; continue } }
      if (c === '"') { i++; continue }
      if (c === '$' || c === '`') {
        const sub = /^(\$\(\(|\$\(|\$\{|`)/.exec(src.slice(i))
        if (sub) {
          const open = sub[0]
          let j = i + open.length, depth = 1
          const [o, cl] = open === '`' ? ['', '`'] : open === '${' ? ['{', '}'] : ['(', ')']
          while (j < src.length && depth) { if (src[j] === '\\') { j += 2; continue } if (o && src[j] === o) depth++; else if (src[j] === cl) depth--; j++ }
          if (open === '$((') j++
          flush()
          const inner = src.slice(i + open.length, open === '$((' ? j - 2 : j - 1)
          out.push(open === '$((' ? { t: 'arith', src: inner, q: true } : open === '${' ? { t: 'param', src: inner, q: true } : { t: 'cmd', src: inner, q: true })
          i = j
          continue
        }
        const m = /^\$([A-Za-z_]\w*|[0-9@*#?$!-])/.exec(src.slice(i))
        if (m) { flush(); out.push({ t: 'var', name: m[1], q: true }); i += m[0].length; continue }
      }
      lit += c
      i++
    }
    flush()
    if (!out.length) out.push({ t: 'lit', v: '', q: true })
    return out
  }
}

// ---------------------------------------------------------------- aritmetika (Pratt)
class Arith {
  private t: string[]
  private i = 0
  private sh: Shell
  constructor(src: string, sh: Shell) {
    this.sh = sh
    this.t = src.match(/0[xX][0-9a-fA-F]+|\d+|[A-Za-z_]\w*|\*\*=?|<<=?|>>=?|\+\+|--|&&|\|\||[=!<>]=|[-+*/%&^|]=|[-+*/%<>=!~&^|?:(),[\]]/g) ?? []
  }
  run(): number { if (!this.t.length) return 0; const v = this.comma(); if (this.i < this.t.length) throw new ExpandError(`syntax error in expression (error token is "${this.t.slice(this.i).join(' ')}")`); return v }
  private peek() { return this.t[this.i] }
  private eat(s?: string) { const x = this.t[this.i++]; if (s && x !== s) throw new ExpandError(`syntax error in expression (error token is "${x ?? ''}")`); return x }
  private comma(): number { let v = this.assign(); while (this.peek() === ',') { this.eat(); v = this.assign() } return v }
  private lvalue(): { name: string; idx?: number } | null {
    const n = this.peek()
    if (!n || !/^[A-Za-z_]\w*$/.test(n)) return null
    const save = this.i
    this.i++
    let idx: number | undefined
    if (this.peek() === '[') { this.eat(); idx = this.comma(); this.eat(']') }
    const op = this.peek()
    if (op && /^([-+*/%&^|]|\*\*|<<|>>)?=$/.test(op) && op !== '==') return { name: n, idx }
    this.i = save
    return null
  }
  private read(name: string, idx?: number): number {
    const v = idx === undefined ? this.sh.get(name) : (() => { const a = this.sh.getVar(name)?.v; return Array.isArray(a) ? a[idx] : idx === 0 && typeof a === 'string' ? a : undefined })()
    if (!v) return 0
    const n = Number(v.trim())
    if (Number.isFinite(n)) return Math.trunc(n)
    return /^[A-Za-z_]\w*$/.test(v.trim()) ? this.read(v.trim()) : new Arith(v, this.sh).run()
  }
  private write(lv: { name: string; idx?: number }, n: number) {
    if (lv.idx === undefined) this.sh.set(lv.name, String(n))
    else { const a = this.sh.getVar(lv.name)?.v; const arr = Array.isArray(a) ? [...a] : []; arr[lv.idx] = String(n); this.sh.set(lv.name, Array.from(arr, x => x ?? '')) }
  }
  private assign(): number {
    const lv = this.lvalue()
    if (lv) {
      const op = this.eat()
      const r = this.assign()
      const cur = this.read(lv.name, lv.idx)
      const v = op === '=' ? r : bin(op.slice(0, -1), cur, r)
      this.write(lv, v)
      return v
    }
    return this.ternary()
  }
  private ternary(): number {
    const c = this.binary(0)
    if (this.peek() !== '?') return c
    this.eat()
    const a = this.assign(); this.eat(':'); const b = this.assign()
    return c ? a : b
  }
  private static PREC: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '**': 11 }
  private binary(min: number): number {
    let l = this.unary()
    for (;;) {
      const op = this.peek()
      const p = op ? Arith.PREC[op] : undefined
      if (p === undefined || p <= min && !(op === '**' && p === min)) return l
      this.eat()
      const r = op === '**' ? this.binary(p - 1) : this.binary(p)
      l = bin(op!, l, r)
    }
  }
  private unary(): number {
    const t = this.peek()
    if (t === '-') { this.eat(); return -this.unary() }
    if (t === '+') { this.eat(); return this.unary() }
    if (t === '!') { this.eat(); return this.unary() ? 0 : 1 }
    if (t === '~') { this.eat(); return ~this.unary() }
    if (t === '++' || t === '--') {
      this.eat()
      const n = this.eat()
      const v = this.read(n) + (t === '++' ? 1 : -1)
      this.sh.set(n, String(v))
      return v
    }
    return this.postfix()
  }
  private postfix(): number {
    const t = this.eat()
    if (t === undefined) throw new ExpandError('syntax error: operand expected')
    if (t === '(') { const v = this.comma(); this.eat(')'); return v }
    if (/^0[xX]/.test(t)) return parseInt(t, 16)
    if (/^\d+$/.test(t)) return t.length > 1 && t[0] === '0' ? parseInt(t, 8) : parseInt(t, 10)
    if (/^[A-Za-z_]\w*$/.test(t)) {
      let idx: number | undefined
      if (this.peek() === '[') { this.eat(); idx = this.comma(); this.eat(']') }
      const v = this.read(t, idx)
      if (this.peek() === '++' || this.peek() === '--') { const op = this.eat(); this.write({ name: t, idx }, v + (op === '++' ? 1 : -1)) }
      return v
    }
    throw new ExpandError(`syntax error: operand expected (error token is "${t}")`)
  }
}
function bin(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': if (!b) throw new ExpandError('division by 0 (error token is "0")'); return Math.trunc(a / b)
    case '%': if (!b) throw new ExpandError('division by 0 (error token is "0")'); return a % b
    case '**': return a ** b
    case '<<': return a << b
    case '>>': return a >> b
    case '<': return +(a < b)
    case '<=': return +(a <= b)
    case '>': return +(a > b)
    case '>=': return +(a >= b)
    case '==': return +(a === b)
    case '!=': return +(a !== b)
    case '&': return a & b
    case '|': return a | b
    case '^': return a ^ b
    case '&&': return +(!!a && !!b)
    case '||': return +(!!a || !!b)
  }
  throw new ExpandError(`unknown operator ${op}`)
}

// ---------------------------------------------------------------- builtin
export function printf(fmt: string, args: string[]): string {
  let out = '', ai = 0
  const unesc = (s: string) => s.replace(/\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|.)/g, (_, e: string) => e[0] === '0' ? String.fromCharCode(parseInt(e.slice(1) || '0', 8)) : e[0] === 'x' ? String.fromCharCode(parseInt(e.slice(1), 16)) : ansiEscape(e).replace(/^\\(?=.)/, '\\'))
  const once = () => {
    let consumed = false
    out += unesc(fmt).replace(/%([-+ 0#]*)(\d*)(?:\.(\d*))?([sdifxXocbeEgG%])/g, (_, flags: string, width: string, prec: string | undefined, conv: string) => {
      if (conv === '%') return '%'
      const a = args[ai++] ?? (conv === 's' || conv === 'b' || conv === 'c' ? '' : '0')
      consumed = true
      let s: string
      const num = () => { const t = a.trim(); if (/^'./.test(t)) return t.charCodeAt(1); const n = Number(t); return Number.isFinite(n) ? n : 0 }
      switch (conv) {
        case 's': s = prec !== undefined ? a.slice(0, +prec || 0) : a; break
        case 'b': s = unesc(a); break
        case 'c': s = a[0] ?? ''; break
        case 'd': case 'i': { const n = Math.trunc(num()); s = String(Math.abs(n)); if (prec) s = s.padStart(+prec, '0'); s = (n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '') + s; break }
        case 'f': case 'e': case 'E': case 'g': case 'G': { const n = num(); s = conv === 'f' ? n.toFixed(prec !== undefined ? +prec : 6) : n.toExponential(prec !== undefined ? +prec : 6); if (n >= 0 && flags.includes('+')) s = '+' + s; break }
        case 'x': s = Math.trunc(num()).toString(16); break
        case 'X': s = Math.trunc(num()).toString(16).toUpperCase(); break
        case 'o': s = Math.trunc(num()).toString(8); break
        default: s = a
      }
      const w = +width || 0
      if (s.length < w) s = flags.includes('-') ? s.padEnd(w) : flags.includes('0') && 'dfixXo'.includes(conv) ? (s[0] === '-' ? '-' + s.slice(1).padStart(w - 1, '0') : s.padStart(w, '0')) : s.padStart(w)
      return s
    })
    return consumed
  }
  do { if (!once()) break } while (ai < args.length)
  return out
}

type B = (c: Ctx) => number | Promise<number>
const ok = (b: boolean) => (b ? 0 : 1)
export const BUILTINS: Record<string, B> = {
  ':': () => 0,
  true: () => 0,
  false: () => 1,
  echo: ({ args, out }) => {
    let n = false, e = false, i = 0
    for (; i < args.length && /^-[neE]+$/.test(args[i]); i++) { if (args[i].includes('n')) n = true; if (args[i].includes('e')) e = true; if (args[i].includes('E')) e = false }
    let s = args.slice(i).join(' ')
    if (e) { const c = s.indexOf('\\c'); if (c >= 0) { s = s.slice(0, c); n = true } s = s.replace(/\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|.)/g, (m, x: string) => x[0] === '0' ? String.fromCharCode(parseInt(x.slice(1) || '0', 8)) : x[0] === 'x' ? String.fromCharCode(parseInt(x.slice(1), 16)) : 'ntrabefv\\'.includes(x) ? ({ n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v', '\\': '\\' } as Record<string, string>)[x] : m) }
    out(s + (n ? '' : '\n'))
    return 0
  },
  printf: ({ args, out, err, sh }) => {
    let i = 0, v: string | undefined
    if (args[0] === '-v') { v = args[1]; i = 2 }
    if (args[i] === undefined) { err('printf: usage: printf [-v var] format [arguments]\n'); return 2 }
    const s = printf(args[i], args.slice(i + 1))
    if (v) sh.set(v, s); else out(s)
    return 0
  },
  read: ({ args, stdin, sh, err }) => {
    let raw = false, arr: string | undefined, delim = '\n', nchars = 0
    const names: string[] = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '-r') raw = true
      else if (a === '-p') { if (sh.interactive) err(args[i + 1] ?? ''); i++ }
      else if (a === '-a') arr = args[++i]
      else if (a === '-d') delim = args[++i]?.[0] ?? '\0'
      else if (a === '-n' || a === '-N') nchars = +args[++i]
      else if (a === '-s' || a === '-t' || a === '-e') { if (a === '-t') i++ }
      else if (/^-[rsa]+$/.test(a)) { if (a.includes('r')) raw = true; if (a.includes('a')) arr = args[++i] }
      else names.push(a)
    }
    if (stdin.pos >= stdin.data.length) { for (const n of names.length ? names : ['REPLY']) sh.set(n, ''); return 1 }
    let line: string, eof = false
    if (nchars) { line = stdin.data.slice(stdin.pos, stdin.pos + nchars); stdin.pos += line.length }
    else {
      let e = stdin.data.indexOf(delim, stdin.pos)
      if (e < 0) { e = stdin.data.length; eof = true }
      line = stdin.data.slice(stdin.pos, e)
      stdin.pos = Math.min(e + 1, stdin.data.length)
      // Tanpa -r: backslash-newline = sambung baris.
      while (!raw && line.endsWith('\\') && !eof) {
        let e2 = stdin.data.indexOf(delim, stdin.pos)
        if (e2 < 0) { e2 = stdin.data.length; eof = true }
        line = line.slice(0, -1) + stdin.data.slice(stdin.pos, e2)
        stdin.pos = Math.min(e2 + 1, stdin.data.length)
      }
    }
    if (!raw) line = line.replace(/\\(.)/g, '$1')
    const ifs = sh.get('IFS') ?? ' \t\n'
    const ws = ifs.replace(/[^ \t\n]/g, '')
    const trim = (s: string) => ws ? s.replace(new RegExp(`^[${escapeRe(ws)}]+|[${escapeRe(ws)}]+$`, 'g'), '') : s
    if (arr) { sh.set(arr, trim(line).split(new RegExp(`[${escapeRe(ifs)}]+`)).filter(x => x !== '')); return eof ? 1 : 0 }
    if (!names.length) { sh.set('REPLY', line); return eof ? 1 : 0 }
    let rest = trim(line)
    names.forEach((n, i) => {
      if (i === names.length - 1) { sh.set(n, rest); return }
      const m = new RegExp(`^([^${escapeRe(ifs)}]*)[${escapeRe(ifs)}]*`).exec(rest)!
      sh.set(n, m[1])
      rest = trim(rest.slice(m[0].length))
    })
    return eof ? 1 : 0
  },
  mapfile: c => BUILTINS.readarray(c),
  readarray: ({ args, stdin, sh }) => {
    const strip = args.includes('-t')
    const name = args.filter(a => !a.startsWith('-')).pop() ?? 'MAPFILE'
    const lines: string[] = []
    let l: string | null
    while ((l = readLine(stdin)) !== null) lines.push(strip ? l : l + '\n')
    sh.set(name, lines)
    return 0
  },
  cd: ({ args, sh, err }) => {
    let t = args[0] ?? sh.get('HOME') ?? '/'
    if (t === '-') { t = sh.get('OLDPWD') ?? sh.cwd }
    const abs = sh.abs(t)
    try {
      const n = sh.fs.stat(sh.user, abs)
      if (n.type !== 'dir') { err(`${sh.name}: cd: ${t}: Not a directory\n`); return 1 }
      if (!sh.fs.can(sh.user, n, 1)) { err(`${sh.name}: cd: ${t}: Permission denied\n`); return 1 }
    } catch (e) { err(`${sh.name}: cd: ${t}: ${(e as FsError).reason}\n`); return 1 }
    sh.set('OLDPWD', sh.cwd)
    sh.cwd = abs
    return 0
  },
  pwd: ({ out, sh }) => { out(sh.cwd + '\n'); return 0 },
  export: ({ args, sh, out }) => {
    if (!args.length || args[0] === '-p') { for (const [k, v] of Object.entries(sh.env()).sort()) out(`declare -x ${k}="${v}"\n`); return 0 }
    for (const a of args) { const m = /^([A-Za-z_]\w*)(=([\s\S]*))?$/.exec(a); if (!m) continue; sh.set(m[1], m[3] ?? sh.get(m[1]) ?? '', { export: true }) }
    return 0
  },
  unset: ({ args, sh }) => { for (const a of args) { if (a === '-v') continue; if (a === '-f') continue; if (args[0] === '-f') sh.funcs.delete(a); else sh.unset(a) } return 0 },
  local: ({ args, sh, err }) => {
    if (sh.scopes.length < 2) { err(`${sh.name}: local: can only be used in a function\n`); return 1 }
    for (const a of args) { const m = /^([A-Za-z_]\w*)(=([\s\S]*))?$/.exec(a); if (m) sh.set(m[1], m[3] ?? '', { local: true }) }
    return 0
  },
  declare: c => declare(c),
  typeset: c => declare(c),
  readonly: ({ args, sh }) => { for (const a of args) { const m = /^([A-Za-z_]\w*)(=([\s\S]*))?$/.exec(a); if (!m) continue; if (m[2]) sh.set(m[1], m[3]); const v = sh.getVar(m[1]); if (v) v.ro = true } return 0 },
  return: ({ args, sh }) => { throw new ReturnSignal(args[0] !== undefined ? (+args[0] & 255) : sh.status) },
  exit: ({ args, sh }) => { throw new ExitSignal(args[0] !== undefined ? (+args[0] & 255) : sh.status) },
  break: ({ args }) => { throw new LoopSignal('break', +(args[0] ?? 1)) },
  continue: ({ args }) => { throw new LoopSignal('continue', +(args[0] ?? 1)) },
  shift: ({ args, sh }) => { const n = +(args[0] ?? 1); if (n > sh.pos.length) return 1; sh.pos = sh.pos.slice(n); return 0 },
  set: ({ args, sh, out }) => {
    if (!args.length) { for (const s of sh.scopes) for (const [k, v] of [...s].sort()) if (typeof v.v === 'string') out(`${k}=${v.v}\n`); return 0 }
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (a === '--') { sh.pos = args.slice(i + 1); return 0 }
      if (a === '-o' || a === '+o') { const o = args[++i]; if (o === 'pipefail') sh.opts.pipefail = a === '-o'; if (o === 'errexit') sh.opts.e = a === '-o'; if (o === 'nounset') sh.opts.u = a === '-o'; continue }
      if (/^[-+][euxo]+$/.test(a)) { for (const f of a.slice(1)) if (f in sh.opts) (sh.opts as Record<string, boolean>)[f] = a[0] === '-'; continue }
      sh.pos = args.slice(i)
      return 0
    }
    return 0
  },
  test: ({ args, sh, err }) => { try { return ok(testArgs(sh, args)) } catch (e) { err(`${sh.name}: test: ${(e as Error).message}\n`); return 2 } },
  '[': ({ args, sh, err }) => {
    if (args[args.length - 1] !== ']') { err(`${sh.name}: [: missing \`]'\n`); return 2 }
    try { return ok(testArgs(sh, args.slice(0, -1))) } catch (e) { err(`${sh.name}: [: ${(e as Error).message}\n`); return 2 }
  },
  let: ({ args, sh, err }) => { let v = 0; try { for (const a of args) v = sh.arith(a) } catch (e) { err(`${sh.name}: let: ${(e as Error).message}\n`); return 1 } return ok(v !== 0) },
  eval: ({ args, sh, stdin, out, err }) => sh.exec_(args.join(' '), { stdin, out, err }),
  source: c => BUILTINS['.'](c),
  '.': ({ args, sh, stdin, out, err }) => {
    try {
      const src = sh.fs.read(sh.user, sh.abs(args[0]))
      const save = sh.pos
      if (args.length > 1) sh.pos = args.slice(1)
      return sh.exec_(src, { stdin, out, err }).finally(() => { sh.pos = save })
    } catch (e) { err(`${sh.name}: ${args[0]}: ${(e as FsError).reason ?? e}\n`); return 1 }
  },
  type: ({ args, sh, out, err }) => {
    let st = 0
    for (const a of args) {
      if (sh.funcs.has(a)) out(`${a} is a function\n`)
      else if (BUILTINS[a]) out(`${a} is a shell builtin\n`)
      else if (COMMANDS[a] || sh.binaries[a]) out(`${a} is /usr/bin/${a}\n`)
      else { err(`${sh.name}: type: ${a}: not found\n`); st = 1 }
    }
    return st
  },
  command: ({ args, sh, out, stdin, err }) => {
    if (args[0] === '-v') { const a = args[1]; if (sh.funcs.has(a) || BUILTINS[a]) { out(a + '\n'); return 0 } if (COMMANDS[a] || sh.binaries[a]) { out(`/usr/bin/${a}\n`); return 0 } return 1 }
    return sh.invoke(args, { stdin, out, err })
  },
  history: ({ sh, out }) => { sh.history.forEach((h, i) => out(`${String(i + 1).padStart(5)}  ${h}\n`)); return 0 },
  getopts: ({ args, sh, err }) => {
    const [spec, name, ...rest] = args
    const argv = rest.length ? rest : sh.pos
    let ind = Math.max(1, parseInt(sh.get('OPTIND') || '1') || 1)
    // Posisi di dalam gugus opsi (-abc) hanya berlaku kalau OPTIND belum diubah dari luar.
    const [sInd, sSub] = (sh.get('__OPTSUB') ?? '').split(':')
    let sub = +sInd === ind ? +sSub || 1 : 1
    const silent = spec.startsWith(':')
    const cur = argv[ind - 1]
    if (!cur || cur === '-' || !cur.startsWith('-')) { sh.set(name, '?'); return 1 }
    if (cur === '--') { sh.set('OPTIND', String(ind + 1)); sh.set(name, '?'); return 1 }
    const ch = cur[sub]
    const at = spec.replace(/^:/, '').indexOf(ch)
    const advance = () => { if (sub + 1 >= cur.length) { ind++; sub = 1 } else sub++ }
    if (at < 0 || ch === ':') {
      if (silent) { sh.set(name, '?'); sh.set('OPTARG', ch) } else { err(`${sh.name}: illegal option -- ${ch}\n`); sh.set(name, '?'); sh.unset('OPTARG') }
      advance()
    } else if (spec.replace(/^:/, '')[at + 1] === ':') {
      sh.set(name, ch)
      if (sub + 1 < cur.length) { sh.set('OPTARG', cur.slice(sub + 1)); ind++ }
      else if (argv[ind] !== undefined) { sh.set('OPTARG', argv[ind]); ind += 2 }
      else { if (silent) { sh.set(name, ':'); sh.set('OPTARG', ch) } else { err(`${sh.name}: option requires an argument -- ${ch}\n`); sh.set(name, '?') } ind++ }
      sub = 1
    } else { sh.set(name, ch); advance() }
    sh.set('OPTIND', String(ind))
    sh.set('__OPTSUB', `${ind}:${sub}`)
    return 0
  },
  bash: c => runBash(c),
  sh: c => runBash(c),
  wait: () => 0,
  // trap 'perintah' EXIT (atau 0); trap - EXIT menghapus. Sinyal lain diterima tetapi diabaikan (tidak ada sinyal di simulasi).
  trap: ({ args, sh }) => {
    if (!args.length) { return 0 }
    const [cmd, ...sigs] = args
    for (const sg of sigs) if (sg === 'EXIT' || sg === '0') sh.exitTrap = cmd === '-' || cmd === '' ? undefined : cmd
    return 0
  },
  umask: ({ out }) => { out('0022\n'); return 0 },
  alias: ({ err }) => { err('alias: belum didukung di terminal simulasi\n'); return 0 },
  jobs: () => 0,
  help: ({ out }) => { out('Builtin: ' + Object.keys(BUILTINS).sort().join(' ') + '\nPerintah: ' + Object.keys(COMMANDS).sort().join(' ') + '\nKetik `man <perintah>` untuk penjelasan singkat.\n'); return 0 },
}

// bash -c "..." | bash skrip.sh arg... | bash (baca skrip dari stdin)
function runBash({ args, sh, stdin, out, err }: Ctx): Promise<number> {
  const io = { stdin, out, err }
  const a = args.filter(x => !/^-[ex]+$/.test(x) || x === '-c')
  if (a[0] === '-c') return sh.script(a[1] ?? '', a[2] ?? 'bash', a.slice(3), io)
  if (!a.length) return sh.script(readAll(stdin), 'bash', [], io)
  try { return sh.script(sh.fs.read(sh.user, sh.abs(a[0])), a[0], a.slice(1), io) }
  catch (e) { err(`bash: ${a[0]}: ${(e as FsError).reason ?? e}\n`); return Promise.resolve(127) }
}

async function declare({ args, sh, out, stdin, err }: Ctx): Promise<number> {
  const flags = new Set<string>()
  const names: string[] = []
  for (const a of args) { if (/^[-+][aAirxp]+$/.test(a)) for (const f of a.slice(1)) flags.add(f); else names.push(a) }
  if (flags.has('p')) {
    for (const n of names) {
      const v = sh.getVar(n)
      if (!v) continue
      if (Array.isArray(v.v)) out(`declare -a ${n}=(${v.v.map((x, i) => `[${i}]="${x}"`).join(' ')})\n`)
      else if (typeof v.v === 'object') out(`declare -A ${n}=(${Object.entries(v.v).map(([k, x]) => `[${k}]="${x}" `).join('')})\n`)
      else out(`declare -${v.x ? 'x' : '-'} ${n}="${v.v}"\n`)
    }
    return 0
  }
  const local = sh.scopes.length > 1
  for (const a of names) {
    const m = /^([A-Za-z_]\w*)(=([\s\S]*))?$/.exec(a)
    if (!m) continue
    const init: Value = flags.has('A') ? {} : flags.has('a') ? [] : m[3] ?? ''
    let val: Value = m[2] ? (flags.has('i') ? String(sh.arith(m[3] ?? '0')) : m[3] ?? '') : sh.getVar(m[1])?.v ?? init
    // declare -A m=([k]=v ...) / declare -a a=(x y)
    if (m[2] && (flags.has('a') || flags.has('A'))) {
      const lit = (m[3] ?? '').trim()
      const items = lit ? await sh.arrayLiteral(lit, { stdin, out, err }) : flags.has('A') ? {} : []
      val = flags.has('A') && Array.isArray(items) ? Object.fromEntries(items.map((x, i) => [String(i), x])) : items
    }
    sh.set(m[1], val, { local, export: flags.has('x') })
    const v = sh.getVar(m[1])!
    if (flags.has('i')) v.int = true
    if (flags.has('r')) v.ro = true
  }
  return 0
}
