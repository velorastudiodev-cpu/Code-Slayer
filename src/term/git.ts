// Simulator Git di atas VFS terminal: working tree = file di VFS, objek & ref disimpan di memori per repo.
// Perilaku yang dinilai (branch, isi commit, status --short, konflik) divalidasi terhadap git asli saat build.
import { VFS } from './vfs.ts'
import { sha256 } from './hash.ts'
import { globToRe, type Command, type Ctx } from './shell.ts'

type Tree = Map<string, string>
type Commit = { id: string; parents: string[]; tree: Tree; msg: string; seq: number }
type Repo = {
  root: string
  bare: boolean
  commits: Map<string, Commit>
  branches: Map<string, string>
  remoteRefs: Map<string, string> // "origin/main" → id
  head: { ref?: string; id?: string }
  index: Tree
  conflicts: Set<string>
  tags: Map<string, string>
  stash: { tree: Tree; index: Tree; msg: string }[]
  merging?: { theirs: string; msg: string }
  remotes: Map<string, string>
  upstream: Map<string, string>
  reflog: string[]
  defaultBranch: string
}

let SEQ = 0
const REPOS = new WeakMap<VFS, Map<string, Repo>>()
const repos = (fs: VFS) => { let m = REPOS.get(fs); if (!m) REPOS.set(fs, (m = new Map())); return m }

const short = (id: string) => id.slice(0, 7)
const cloneTree = (t: Tree) => new Map(t)
const treeEq = (a: Tree, b: Tree) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v)

class GitError extends Error {
  code: number
  constructor(msg: string, code = 128) { super(msg); this.code = code }
}

// ---------------------------------------------------------------- repo & working tree
function findRepo(fs: VFS, cwd: string): Repo | undefined {
  const m = repos(fs)
  for (let d = cwd; ; d = VFS.parent(d)) {
    const r = m.get(d)
    if (r && (r.bare ? fs.get(d) : fs.get(d + (d === '/' ? '' : '/') + '.git'))) return r
    if (d === '/') return undefined
  }
}
const rel = (r: Repo, abs: string) => (abs === r.root ? '' : abs.slice(r.root.length + 1))

function ignoreRules(fs: VFS, r: Repo) {
  const g = fs.get(r.root + '/.gitignore')
  if (!g || g.type !== 'file') return []
  return g.content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
    const neg = l.startsWith('!')
    let p = neg ? l.slice(1) : l
    const dir = p.endsWith('/')
    if (dir) p = p.slice(0, -1)
    const anchored = p.includes('/')
    if (p.startsWith('/')) p = p.slice(1)
    return { neg, dir, anchored, re: new RegExp(`^${globToRe(p)}$`) }
  })
}
function ignored(rules: ReturnType<typeof ignoreRules>, path: string) {
  let hit = false
  const parts = path.split('/')
  for (const r of rules) {
    let m = false
    for (let i = 0; i < parts.length; i++) {
      const isDir = i < parts.length - 1
      if (r.dir && !isDir) continue
      const sub = parts.slice(0, i + 1).join('/')
      if (r.anchored ? r.re.test(sub) : r.re.test(parts[i])) { m = true; break }
    }
    if (m) hit = !r.neg
  }
  return hit
}

function workTree(fs: VFS, r: Repo): Tree {
  const out: Tree = new Map()
  const walk = (abs: string, prefix: string) => {
    const n = fs.get(abs)
    if (!n || n.type !== 'dir') return
    for (const [name, c] of n.children) {
      if (!prefix && name === '.git') continue
      const p = prefix ? `${prefix}/${name}` : name
      if (c.type === 'dir') walk(`${abs}/${name}`, p)
      else out.set(p, c.content)
    }
  }
  walk(r.root, '')
  return out
}
function writeWork(fs: VFS, r: Repo, user: string, path: string, content: string | undefined) {
  const abs = `${r.root}/${path}`
  if (content === undefined) {
    if (fs.get(abs)) fs.remove(user, abs, false)
    // Hapus direktori kosong yang tersisa (git tidak melacak direktori).
    for (let d = VFS.parent(abs); d.length > r.root.length; d = VFS.parent(d)) { const n = fs.get(d); if (n && n.type === 'dir' && !n.children.size) fs.remove(user, d, true); else break }
    return
  }
  fs.mkdir(user, VFS.parent(abs), true)
  fs.write(user, abs, content)
}

const headId = (r: Repo) => (r.head.ref ? r.branches.get(r.head.ref) : r.head.id)
const headTree = (r: Repo): Tree => { const id = headId(r); return id ? r.commits.get(id)!.tree : new Map() }

function resolve(r: Repo, spec: string): string {
  const m = /^(.*?)((?:[~^]\d*)*)$/.exec(spec)!
  let base = m[1] || 'HEAD'
  let id: string | undefined
  if (base === 'HEAD' || base === '@') id = headId(r)
  else if (r.branches.has(base)) id = r.branches.get(base)
  else if (r.tags.has(base)) id = r.tags.get(base)
  else if (r.remoteRefs.has(base)) id = r.remoteRefs.get(base)
  else if (/^[0-9a-f]{4,40}$/.test(base)) { const hits = [...r.commits.keys()].filter(k => k.startsWith(base)); if (hits.length === 1) id = hits[0] }
  else if (/^stash@\{\d+\}$/.test(base)) base = base
  if (!id) throw new GitError(`fatal: ambiguous argument '${spec}': unknown revision or path not in the working tree.`)
  for (const op of m[2].match(/[~^]\d*/g) ?? []) {
    const n = op.length > 1 ? +op.slice(1) : 1
    if (op[0] === '~') for (let i = 0; i < n; i++) { const p: string | undefined = r.commits.get(id!)!.parents[0]; if (!p) throw new GitError(`fatal: ambiguous argument '${spec}': unknown revision or path not in the working tree.`); id = p }
    else { const p: string | undefined = r.commits.get(id!)!.parents[n - 1]; if (!p) throw new GitError(`fatal: ambiguous argument '${spec}'`); id = p }
  }
  return id!
}
function ancestors(r: Repo, id: string): Set<string> {
  const seen = new Set<string>()
  const st = [id]
  while (st.length) { const x = st.pop()!; if (seen.has(x)) continue; seen.add(x); st.push(...r.commits.get(x)!.parents) }
  return seen
}
function mergeBase(r: Repo, a: string, b: string): string | undefined {
  const A = ancestors(r, a)
  // Leluhur bersama terbaru (seq terbesar) yang bukan leluhur dari leluhur bersama lain.
  const common = [...ancestors(r, b)].filter(x => A.has(x))
  return common.sort((x, y) => r.commits.get(y)!.seq - r.commits.get(x)!.seq)[0]
}

// ---------------------------------------------------------------- merge 3 arah per baris (gaya diff3)
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: [number, number][] = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++
  }
  return out
}
const toLines = (s: string) => { const l = s.split('\n'); if (l[l.length - 1] === '') l.pop(); return l }
export function merge3(base: string, ours: string, theirs: string, labelOurs: string, labelTheirs: string): { text: string; conflict: boolean } {
  if (ours === theirs) return { text: ours, conflict: false }
  if (ours === base) return { text: theirs, conflict: false }
  if (theirs === base) return { text: ours, conflict: false }
  const B = toLines(base), O = toLines(ours), T = toLines(theirs)
  const mo = new Map(lcsPairs(B, O)), mt = new Map(lcsPairs(B, T))
  const out: string[] = []
  let conflict = false
  let bi = 0, oi = 0, ti = 0
  for (;;) {
    // Cari baris base berikutnya yang stabil di kedua sisi.
    let k = bi
    while (k < B.length && !(mo.has(k) && mt.has(k) && mo.get(k)! >= oi && mt.get(k)! >= ti)) k++
    const oe = k < B.length ? mo.get(k)! : O.length, te = k < B.length ? mt.get(k)! : T.length
    const b = B.slice(bi, k), o = O.slice(oi, oe), t = T.slice(ti, te)
    const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i])
    if (same(o, b)) out.push(...t)
    else if (same(t, b)) out.push(...o)
    else if (same(o, t)) out.push(...o)
    else { conflict = true; out.push(`<<<<<<< ${labelOurs}`, ...o, '=======', ...t, `>>>>>>> ${labelTheirs}`) }
    if (k >= B.length) break
    out.push(B[k])
    bi = k + 1; oi = oe + 1; ti = te + 1
  }
  return { text: out.length ? out.join('\n') + '\n' : '', conflict }
}

// ---------------------------------------------------------------- status
type Entry = { x: string; y: string; path: string }
function statusEntries(fs: VFS, r: Repo): { tracked: Entry[]; untracked: string[] } {
  const H = headTree(r), I = r.index, W = workTree(fs, r)
  const rules = ignoreRules(fs, r)
  const tracked: Entry[] = []
  for (const p of [...new Set([...H.keys(), ...I.keys()])].sort()) {
    if (r.conflicts.has(p)) { tracked.push({ x: 'U', y: 'U', path: p }); continue }
    const x = !H.has(p) ? (I.has(p) ? 'A' : ' ') : !I.has(p) ? 'D' : H.get(p) !== I.get(p) ? 'M' : ' '
    const y = !I.has(p) ? ' ' : !W.has(p) ? 'D' : W.get(p) !== I.get(p) ? 'M' : ' '
    if (x !== ' ' || y !== ' ') tracked.push({ x, y, path: p })
  }
  const un = [...W.keys()].filter(p => !I.has(p) && !ignored(rules, p)).sort()
  // Direktori yang seluruh isinya untracked ditampilkan sebagai "dir/".
  const untracked = new Set<string>()
  const trackedPaths = [...I.keys()]
  for (const p of un) {
    const parts = p.split('/')
    let shown = p
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/')
      if (!trackedPaths.some(t => t.startsWith(dir + '/'))) { shown = dir + '/'; break }
    }
    untracked.add(shown)
  }
  return { tracked, untracked: [...untracked].sort() }
}

// ---------------------------------------------------------------- commit & checkout
function newCommit(r: Repo, tree: Tree, parents: string[], msg: string): string {
  const seq = ++SEQ
  const id = sha256(`${seq}\0${parents.join(',')}\0${msg}\0${[...tree].map(([k, v]) => `${k}\0${v}`).join('\0')}`).slice(0, 40)
  r.commits.set(id, { id, parents, tree: cloneTree(tree), msg, seq })
  return id
}
function moveHead(r: Repo, id: string, why: string) {
  if (r.head.ref) r.branches.set(r.head.ref, id); else r.head.id = id
  r.reflog.unshift(`${short(id)} HEAD@{N}: ${why}`)
}
function dirtyPaths(fs: VFS, r: Repo) {
  const H = headTree(r), W = workTree(fs, r)
  const s = new Set<string>()
  for (const p of new Set([...H.keys(), ...r.index.keys()])) if (H.get(p) !== r.index.get(p) || r.index.get(p) !== W.get(p)) s.add(p)
  return s
}
// Ganti HEAD ke commit lain; perubahan lokal dibawa kalau tidak bentrok (seperti git checkout).
function checkoutTree(fs: VFS, r: Repo, user: string, target: Tree) {
  const H = headTree(r)
  const dirty = dirtyPaths(fs, r)
  const clash = [...dirty].filter(p => H.get(p) !== target.get(p))
  if (clash.length) throw new GitError(`error: Your local changes to the following files would be overwritten by checkout:\n${clash.map(p => `\t${p}`).join('\n')}\nPlease commit your changes or stash them before you switch branches.\nAborting`, 1)
  const W = workTree(fs, r)
  const untrackedClash = [...target.keys()].filter(p => !H.has(p) && W.has(p) && W.get(p) !== target.get(p) && !r.index.has(p))
  if (untrackedClash.length) throw new GitError(`error: The following untracked working tree files would be overwritten by checkout:\n${untrackedClash.map(p => `\t${p}`).join('\n')}\nPlease move or remove them before you switch branches.\nAborting`, 1)
  for (const p of new Set([...H.keys(), ...target.keys()])) {
    if (dirty.has(p) || H.get(p) === target.get(p)) continue
    writeWork(fs, r, user, p, target.get(p))
    if (target.has(p)) r.index.set(p, target.get(p)!); else r.index.delete(p)
  }
}
function hardReset(fs: VFS, r: Repo, user: string, target: Tree) {
  const W = workTree(fs, r)
  for (const p of new Set([...headTree(r).keys(), ...r.index.keys(), ...target.keys()])) if (W.get(p) !== target.get(p)) writeWork(fs, r, user, p, target.get(p))
  r.index = cloneTree(target)
  r.conflicts.clear()
}

// Terapkan perubahan (base → theirs) ke HEAD dengan merge 3 arah; dipakai merge, cherry-pick, revert, rebase, stash pop.
function apply3(fs: VFS, r: Repo, user: string, base: Tree, theirs: Tree, labelTheirs: string, out: (s: string) => void): { tree: Tree; conflicts: string[] } {
  const ours = headTree(r)
  const tree: Tree = new Map()
  const conflicts: string[] = []
  for (const p of [...new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])].sort()) {
    const b = base.get(p), o = ours.get(p), t = theirs.get(p)
    let v: string | undefined
    if (o === t) v = o
    else if (o === b) v = t
    else if (t === b) v = o
    else if (o !== undefined && t !== undefined) {
      out(`Auto-merging ${p}\n`)
      const m = merge3(b ?? '', o, t, 'HEAD', labelTheirs)
      v = m.text
      if (m.conflict) { conflicts.push(p); out(`CONFLICT (content): Merge conflict in ${p}\n`) }
    } else { v = o ?? t; conflicts.push(p); out(`CONFLICT (modify/delete): ${p} deleted in one branch and modified in the other.\n`) }
    if (v !== undefined) tree.set(p, v)
  }
  // Tulis hasil ke working tree & index (berkas konflik: tetap tidak bersih di index).
  const W = workTree(fs, r)
  for (const p of new Set([...ours.keys(), ...tree.keys()])) {
    if (W.get(p) !== tree.get(p)) writeWork(fs, r, user, p, tree.get(p))
    if (conflicts.includes(p)) continue
    if (tree.has(p)) r.index.set(p, tree.get(p)!); else r.index.delete(p)
  }
  for (const c of conflicts) r.conflicts.add(c)
  return { tree, conflicts }
}

// ---------------------------------------------------------------- tampilan
const AUTHOR = 'Slayer <slayer@korps.id>'
const DATE = 'Fri Oct 30 09:00:00 2026 +0700'
function decorate(r: Repo, id: string) {
  const names: string[] = []
  if (headId(r) === id) names.push(r.head.ref ? `HEAD -> ${r.head.ref}` : 'HEAD')
  for (const [b, x] of [...r.branches].sort()) if (x === id && b !== r.head.ref) names.push(b)
  for (const [b, x] of [...r.remoteRefs].sort()) if (x === id) names.push(b)
  for (const [t, x] of [...r.tags].sort()) if (x === id) names.push(`tag: ${t}`)
  return names.length ? ` (${names.join(', ')})` : ''
}
function diffText(a: Tree, b: Tree): string {
  let out = ''
  for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(p), y = b.get(p)
    if (x === y) continue
    out += `diff --git a/${p} b/${p}\n`
    if (x === undefined) out += 'new file mode 100644\n'
    if (y === undefined) out += 'deleted file mode 100644\n'
    out += `--- ${x === undefined ? '/dev/null' : 'a/' + p}\n+++ ${y === undefined ? '/dev/null' : 'b/' + p}\n`
    const A = toLines(x ?? ''), B = toLines(y ?? '')
    const pairs = lcsPairs(A, B)
    out += `@@ -${A.length ? 1 : 0},${A.length} +${B.length ? 1 : 0},${B.length} @@\n`
    let i = 0, j = 0
    for (const [pi, pj] of [...pairs, [A.length, B.length] as [number, number]]) {
      while (i < pi) out += `-${A[i++]}\n`
      while (j < pj) out += `+${B[j++]}\n`
      if (i < A.length && j < B.length) { out += ` ${A[i]}\n`; i++; j++ }
    }
  }
  return out
}

// ---------------------------------------------------------------- perintah
function parse(args: string[]) {
  const flags = new Set<string>(), vals: Record<string, string[]> = {}, rest: string[] = []
  const takes = new Set(['-m', '-b', '-c', '-n', '--format', '--pretty', '-C'])
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') { rest.push(...args.slice(i + 1)); break }
    const eq = /^(--[\w-]+)=(.*)$/.exec(a)
    if (eq) { (vals[eq[1]] ??= []).push(eq[2]); continue }
    if (/^-\d+$/.test(a)) { (vals['-n'] ??= []).push(a.slice(1)); continue }
    if (takes.has(a)) { (vals[a] ??= []).push(args[++i] ?? ''); continue }
    // Gugus flag: -am "pesan" = -a -m "pesan"; huruf yang butuh nilai mengambil sisa gugus atau argumen berikutnya.
    if (/^-[a-zA-Z]{2,}$/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const f = '-' + a[j]
        if (takes.has(f)) { (vals[f] ??= []).push(j + 1 < a.length ? a.slice(j + 1) : args[++i] ?? ''); break }
        flags.add(f)
      }
      continue
    }
    if (a.startsWith('-')) flags.add(a)
    else rest.push(a)
  }
  return { flags, vals, rest }
}
const HELP = 'Perintah git di terminal simulasi: init, status, add, commit, log, diff, show, branch, switch, checkout, merge, rebase, reset, restore, revert, cherry-pick, stash, tag, remote, push, pull, fetch, clone, reflog, rev-parse, rev-list, ls-files.\n'

export const git: Command = async (c0: Ctx) => {
  // -q / --quiet: sembunyikan pesan informasi (error tetap tampil), seperti git asli.
  const quiet = c0.args.some(a => a === '-q' || a === '--quiet')
  const c: Ctx = quiet ? { ...c0, args: c0.args.filter(a => a !== '-q' && a !== '--quiet'), out: () => {}, err: m => { if (/^(fatal|error|CONFLICT)/m.test(m)) c0.err(m) } } : c0
  const { sh } = c
  const fs = sh.fs
  const [sub, ...args] = c.args
  const o = parse(args)
  const need = () => {
    const r = findRepo(fs, sh.cwd)
    if (!r) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')
    return r
  }
  const W = (r: Repo) => workTree(fs, r)
  const pathArg = (r: Repo, p: string) => rel(r, VFS.norm(p, sh.cwd, fs.user(sh.user).home))
  try {
    switch (sub) {
      case undefined: case 'help': case '--help': c.out(HELP); return 0
      case '--version': c.out('git version 2.43.0 (simulasi Code Slayer)\n'); return 0
      case 'config': return 0
      case 'init': {
        const dir = sh.abs(o.rest[0] ?? '.')
        fs.mkdir(sh.user, dir, true)
        const bare = o.flags.has('--bare')
        if (!bare) fs.mkdir(sh.user, dir + '/.git', true)
        else fs.mkdir(sh.user, dir + '/refs', true)
        const existed = repos(fs).has(dir)
        if (!existed) repos(fs).set(dir, { root: dir, bare, commits: new Map(), branches: new Map(), remoteRefs: new Map(), head: { ref: o.vals['-b']?.[0] ?? 'main' }, index: new Map(), conflicts: new Set(), tags: new Map(), stash: [], remotes: new Map(), upstream: new Map(), reflog: [], defaultBranch: 'main' })
        c.out(`${existed ? 'Reinitialized existing' : 'Initialized empty'} Git repository in ${dir}${bare ? '' : '/.git'}/\n`)
        return 0
      }
      case 'status': {
        const r = need()
        const { tracked, untracked } = statusEntries(fs, r)
        if (o.flags.has('--short') || o.flags.has('-s') || o.flags.has('--porcelain')) {
          for (const e of tracked) c.out(`${e.x}${e.y} ${e.path}\n`)
          for (const u of untracked) c.out(`?? ${u}\n`)
          return 0
        }
        c.out(r.head.ref ? `On branch ${r.head.ref}\n` : `HEAD detached at ${short(r.head.id!)}\n`)
        if (!headId(r)) c.out('\nNo commits yet\n')
        if (r.merging) c.out(r.conflicts.size ? 'You have unmerged paths.\n  (fix conflicts and run "git commit")\n' : 'All conflicts fixed but you are still merging.\n  (use "git commit" to conclude merge)\n')
        const staged = tracked.filter(e => e.x !== ' ' && e.x !== 'U'), unstaged = tracked.filter(e => e.y !== ' ' && e.x !== 'U'), unmerged = tracked.filter(e => e.x === 'U')
        const word = (x: string) => ({ A: 'new file:   ', M: 'modified:   ', D: 'deleted:    ' } as Record<string, string>)[x]
        if (staged.length) c.out('\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n' + staged.map(e => `\t${word(e.x)}${e.path}\n`).join(''))
        if (unmerged.length) c.out('\nUnmerged paths:\n  (use "git add <file>..." to mark resolution)\n' + unmerged.map(e => `\tboth modified:   ${e.path}\n`).join(''))
        if (unstaged.length) c.out('\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n' + unstaged.map(e => `\t${word(e.y)}${e.path}\n`).join(''))
        if (untracked.length) c.out('\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n' + untracked.map(u => `\t${u}\n`).join(''))
        if (!tracked.length && !untracked.length) c.out(headId(r) ? 'nothing to commit, working tree clean\n' : '\nnothing to commit (create/copy files and use "git add" to track)\n')
        return 0
      }
      case 'add': {
        const r = need()
        const all = o.flags.has('-A') || o.flags.has('--all')
        const specs = all ? ['.'] : o.rest
        if (!specs.length) { c.err('Nothing specified, nothing added.\n'); return 0 }
        const w = W(r), rules = ignoreRules(fs, r)
        for (const s of specs) {
          const base = pathArg(r, s)
          const matches = (p: string) => !base || p === base || p.startsWith(base + '/') || (/[*?[]/.test(s) && new RegExp(`^${globToRe(base)}$`).test(p))
          const hits = [...new Set([...w.keys(), ...r.index.keys()])].filter(matches)
          if (!hits.length) throw new GitError(`fatal: pathspec '${s}' did not match any files`)
          for (const p of hits) {
            if (!w.has(p)) { r.index.delete(p); r.conflicts.delete(p); continue }
            if (!r.index.has(p) && ignored(rules, p) && !(base === p)) continue
            if (!r.index.has(p) && ignored(rules, p) && base === p) throw new GitError(`The following paths are ignored by one of your .gitignore files:\n${p}\nhint: Use -f if you really want to add them.`, 1)
            r.index.set(p, w.get(p)!)
            r.conflicts.delete(p)
          }
        }
        return 0
      }
      case 'rm': {
        const r = need()
        for (const s of o.rest) { const p = pathArg(r, s); r.index.delete(p); if (!o.flags.has('--cached')) writeWork(fs, r, sh.user, p, undefined); c.out(`rm '${p}'\n`) }
        return 0
      }
      case 'commit': {
        const r = need()
        if (o.flags.has('-a') || o.flags.has('--all')) { const w = W(r); for (const p of [...r.index.keys()]) { if (w.has(p)) r.index.set(p, w.get(p)!); else r.index.delete(p) } }
        if (r.conflicts.size) throw new GitError('error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.')
        const amend = o.flags.has('--amend')
        const parentId = headId(r)
        const old = amend && parentId ? r.commits.get(parentId)! : undefined
        let msg = (o.vals['-m'] ?? []).join('\n\n')
        if (!msg && r.merging) msg = r.merging.msg
        if (!msg && old) msg = old.msg
        if (!msg) throw new GitError('Aborting commit due to empty commit message.\n(Simulasi: tulis pesannya dengan -m "pesan")', 1)
        const parents = old ? old.parents : r.merging ? [parentId!, r.merging.theirs] : parentId ? [parentId] : []
        if (!amend && !r.merging && treeEq(r.index, headTree(r))) {
          const { tracked, untracked } = statusEntries(fs, r)
          c.out(r.head.ref ? `On branch ${r.head.ref}\n` : '')
          c.out(tracked.length ? 'Changes not staged for commit:\n' + tracked.map(e => `\tmodified:   ${e.path}\n`).join('') + '\nno changes added to commit (use "git add" and/or "git commit -a")\n' : untracked.length ? 'nothing added to commit but untracked files present (use "git add" to track)\n' : 'nothing to commit, working tree clean\n')
          return 1
        }
        const id = newCommit(r, r.index, parents, msg)
        const root = !parents.length
        moveHead(r, id, `commit${root ? ' (initial)' : amend ? ' (amend)' : r.merging ? ' (merge)' : ''}: ${msg.split('\n')[0]}`)
        r.merging = undefined
        const before = old ? (old.parents[0] ? r.commits.get(old.parents[0])!.tree : new Map()) : parentId ? r.commits.get(parentId)!.tree : new Map()
        const changed = [...new Set([...before.keys(), ...r.index.keys()])].filter(p => before.get(p) !== r.index.get(p)).length
        c.out(`[${r.head.ref ?? 'detached HEAD'}${root ? ' (root-commit)' : ''} ${short(id)}] ${msg.split('\n')[0]}\n ${changed} file${changed === 1 ? '' : 's'} changed\n`)
        return 0
      }
      case 'log': {
        const r = need()
        if (!headId(r)) throw new GitError(`fatal: your current branch '${r.head.ref}' does not have any commits yet`)
        const fmt = o.vals['--format']?.[0] ?? o.vals['--pretty']?.[0]?.replace(/^format:/, '') ?? (o.flags.has('--oneline') ? '%h%d %s' : null)
        const starts = o.flags.has('--all') ? [...r.branches.values(), ...r.remoteRefs.values(), ...(r.head.id ? [r.head.id] : [])] : (o.rest.length ? o.rest : ['HEAD']).map(s => resolve(r, s))
        let list: Commit[]
        if (o.flags.has('--first-parent')) {
          list = []
          for (let id: string | undefined = starts[0]; id; id = r.commits.get(id)!.parents[0]) list.push(r.commits.get(id)!)
        } else {
          const seen = new Set<string>()
          for (const s of starts) for (const a of ancestors(r, s)) seen.add(a)
          list = [...seen].map(id => r.commits.get(id)!).sort((a, b) => b.seq - a.seq)
        }
        if (o.flags.has('--merges')) list = list.filter(x => x.parents.length > 1)
        if (o.flags.has('--no-merges')) list = list.filter(x => x.parents.length < 2)
        if (o.flags.has('--reverse')) list.reverse()
        if (o.vals['-n']) list = list.slice(0, +o.vals['-n'][0])
        for (const cm of list) {
          const graph = o.flags.has('--graph') ? '* ' : ''
          if (fmt !== null) c.out(graph + fmt.replace(/%([hHsdpPn%]|an|ae)/g, (_, k) => ({ h: short(cm.id), H: cm.id, s: cm.msg.split('\n')[0], d: o.flags.has('--oneline') || /%d/.test(fmt) ? decorate(r, cm.id) : '', p: cm.parents.map(short).join(' '), P: cm.parents.join(' '), n: '\n', '%': '%', an: 'Slayer', ae: 'slayer@korps.id' } as Record<string, string>)[k]) + '\n')
          else c.out(`${graph}commit ${cm.id}${decorate(r, cm.id)}\n${cm.parents.length > 1 ? `Merge: ${cm.parents.map(short).join(' ')}\n` : ''}Author: ${AUTHOR}\nDate:   ${DATE}\n\n${cm.msg.split('\n').map(l => '    ' + l).join('\n')}\n\n`)
        }
        return 0
      }
      case 'rev-list': {
        const r = need()
        const ids = new Set<string>()
        for (const s of o.rest) for (const a of ancestors(r, resolve(r, s))) ids.add(a)
        if (o.flags.has('--count')) c.out(ids.size + '\n'); else for (const id of [...ids].sort((a, b) => r.commits.get(b)!.seq - r.commits.get(a)!.seq)) c.out(id + '\n')
        return 0
      }
      case 'rev-parse': {
        const r = need()
        for (const s of o.rest) { const id = resolve(r, s); c.out((o.flags.has('--short') ? short(id) : id) + '\n') }
        if (o.flags.has('--abbrev-ref')) c.out((r.head.ref ?? 'HEAD') + '\n')
        return 0
      }
      case 'ls-files': { const r = need(); for (const p of [...r.index.keys()].sort()) c.out(p + '\n'); return 0 }
      case 'diff': {
        const r = need()
        const staged = o.flags.has('--staged') || o.flags.has('--cached')
        const [a, b] = staged ? [headTree(r), r.index] : o.rest.length ? [r.commits.get(resolve(r, o.rest[0]))!.tree, o.rest[1] ? r.commits.get(resolve(r, o.rest[1]))!.tree : W(r)] : [r.index, new Map([...W(r)].filter(([p]) => r.index.has(p)))]
        if (o.flags.has('--stat') || o.flags.has('--name-only')) { for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) if (a.get(p) !== b.get(p)) c.out(p + '\n'); return 0 }
        c.out(diffText(a, b))
        return 0
      }
      case 'show': {
        const r = need()
        const cm = r.commits.get(resolve(r, o.rest[0] ?? 'HEAD'))!
        c.out(`commit ${cm.id}${decorate(r, cm.id)}\nAuthor: ${AUTHOR}\nDate:   ${DATE}\n\n    ${cm.msg}\n\n`)
        c.out(diffText(cm.parents[0] ? r.commits.get(cm.parents[0])!.tree : new Map(), cm.tree))
        return 0
      }
      case 'branch': {
        const r = need()
        if (o.flags.has('--show-current')) { c.out((r.head.ref ?? '') + '\n'); return 0 }
        if (o.flags.has('-d') || o.flags.has('-D')) {
          for (const b of o.rest) {
            if (!r.branches.has(b)) throw new GitError(`error: branch '${b}' not found.`, 1)
            if (b === r.head.ref) throw new GitError(`error: Cannot delete branch '${b}' checked out at '${r.root}'`, 1)
            if (o.flags.has('-d') && !ancestors(r, headId(r)!).has(r.branches.get(b)!)) throw new GitError(`error: The branch '${b}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${b}'.`, 1)
            c.out(`Deleted branch ${b} (was ${short(r.branches.get(b)!)}).\n`)
            r.branches.delete(b)
          }
          return 0
        }
        if (o.flags.has('-m') || o.vals['-m']) {
          const [from, to] = o.vals['-m'] ? (o.rest.length ? [o.vals['-m'][0], o.rest[0]] : [r.head.ref!, o.vals['-m'][0]]) : [r.head.ref!, o.rest[0]]
          const id = r.branches.get(from)
          if (id !== undefined) { r.branches.delete(from); r.branches.set(to, id) }
          if (r.head.ref === from) r.head.ref = to
          return 0
        }
        if (o.rest.length && !o.flags.has('-r') && !o.flags.has('-a')) {
          const [name, start] = o.rest
          if (r.branches.has(name)) throw new GitError(`fatal: a branch named '${name}' already exists`)
          if (!headId(r) && !start) throw new GitError(`fatal: not a valid object name: '${r.head.ref}'`)
          r.branches.set(name, resolve(r, start ?? 'HEAD'))
          return 0
        }
        const fmt = o.vals['--format']?.[0]
        const names = o.flags.has('-r') ? [] : [...r.branches.keys()].sort()
        for (const b of names) c.out(fmt ? fmt.replace('%(refname:short)', b).replace('%(refname)', `refs/heads/${b}`) + '\n' : `${b === r.head.ref ? '* ' : '  '}${b}\n`)
        if (o.flags.has('-r') || o.flags.has('-a')) for (const b of [...r.remoteRefs.keys()].sort()) c.out(`  ${o.flags.has('-a') ? 'remotes/' : ''}${b}\n`)
        return 0
      }
      case 'switch': case 'checkout': {
        const r = need()
        const create = o.vals['-c']?.[0] ?? o.vals['-b']?.[0]
        if (sub === 'checkout' && (args.includes('--') || (o.rest.length && !create && !r.branches.has(o.rest[0]) && W(r).has(pathArg(r, o.rest[0]))))) {
          // checkout -- file: kembalikan dari index
          for (const s of o.rest) { const p = pathArg(r, s); writeWork(fs, r, sh.user, p, r.index.get(p)) }
          return 0
        }
        if (create) {
          if (r.branches.has(create)) throw new GitError(`fatal: a branch named '${create}' already exists`)
          const start = o.rest[0] ? resolve(r, o.rest[0]) : headId(r)
          if (start) { checkoutTree(fs, r, sh.user, r.commits.get(start)!.tree); r.branches.set(create, start) }
          r.head = { ref: create }
          if (start) r.reflog.unshift(`${short(start)} HEAD@{N}: checkout: moving to ${create}`)
          c.err(`Switched to a new branch '${create}'\n`)
          return 0
        }
        const target = o.rest[0]
        if (!target) throw new GitError('fatal: missing branch or commit argument')
        if (target === '-') throw new GitError('fatal: (simulasi) gunakan nama branch secara eksplisit')
        if (r.branches.has(target)) {
          if (r.head.ref === target) { c.err(`Already on '${target}'\n`); return 0 }
          checkoutTree(fs, r, sh.user, r.commits.get(r.branches.get(target)!)!.tree)
          r.head = { ref: target }
          r.reflog.unshift(`${short(r.branches.get(target)!)} HEAD@{N}: checkout: moving to ${target}`)
          c.err(`Switched to branch '${target}'\n`)
          return 0
        }
        const remote = r.remoteRefs.get(`origin/${target}`)
        if (remote) { checkoutTree(fs, r, sh.user, r.commits.get(remote)!.tree); r.branches.set(target, remote); r.upstream.set(target, 'origin'); r.head = { ref: target }; c.err(`branch '${target}' set up to track 'origin/${target}'.\nSwitched to a new branch '${target}'\n`); return 0 }
        if (sub === 'switch' && !o.flags.has('--detach') && !o.flags.has('-d')) throw new GitError(`fatal: invalid reference: ${target}`)
        const id = resolve(r, target)
        checkoutTree(fs, r, sh.user, r.commits.get(id)!.tree)
        r.head = { id }
        r.reflog.unshift(`${short(id)} HEAD@{N}: checkout: moving to ${target}`)
        c.err(`Note: switching to '${target}'.\n\nYou are in 'detached HEAD' state.\nHEAD is now at ${short(id)} ${r.commits.get(id)!.msg.split('\n')[0]}\n`)
        return 0
      }
      case 'merge': {
        const r = need()
        if (o.flags.has('--abort')) {
          if (!r.merging) throw new GitError('fatal: There is no merge to abort (MERGE_HEAD missing).')
          hardReset(fs, r, sh.user, headTree(r)); r.merging = undefined; return 0
        }
        if (r.merging) throw new GitError('fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.')
        const name = o.rest[0]
        const theirs = resolve(r, name)
        const ours = headId(r)!
        if (ancestors(r, ours).has(theirs)) { c.out('Already up to date.\n'); return 0 }
        if (ancestors(r, theirs).has(ours) && !o.flags.has('--no-ff')) {
          checkoutTree(fs, r, sh.user, r.commits.get(theirs)!.tree)
          moveHead(r, theirs, `merge ${name}: Fast-forward`)
          c.out(`Updating ${short(ours)}..${short(theirs)}\nFast-forward\n`)
          return 0
        }
        const dirty = dirtyPaths(fs, r)
        if (dirty.size) throw new GitError(`error: Your local changes to the following files would be overwritten by merge:\n${[...dirty].map(p => `\t${p}`).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`, 1)
        const base = mergeBase(r, ours, theirs)
        if (!base && !o.flags.has('--allow-unrelated-histories')) throw new GitError('fatal: refusing to merge unrelated histories')
        const res = apply3(fs, r, sh.user, base ? r.commits.get(base)!.tree : new Map(), r.commits.get(theirs)!.tree, name, c.out)
        const kind = r.branches.has(name) ? 'branch' : r.remoteRefs.has(name) ? 'remote-tracking branch' : 'commit'
        const msg = o.vals['-m']?.[0] ?? `Merge ${kind} '${name}'${r.head.ref && !['main', 'master'].includes(r.head.ref) ? ` into ${r.head.ref}` : ''}`
        if (res.conflicts.length) {
          r.merging = { theirs, msg }
          c.out('Automatic merge failed; fix conflicts and then commit the result.\n')
          return 1
        }
        const id = newCommit(r, res.tree, [ours, theirs], msg)
        moveHead(r, id, `merge ${name}: Merge made by the 'ort' strategy.`)
        c.out("Merge made by the 'ort' strategy.\n")
        return 0
      }
      case 'rebase': {
        const r = need()
        const upstream = resolve(r, o.rest[0])
        const ours = headId(r)!
        if (ancestors(r, upstream).has(ours)) {
          checkoutTree(fs, r, sh.user, r.commits.get(upstream)!.tree); moveHead(r, upstream, 'rebase (finish)')
          c.out(`Successfully rebased and updated refs/heads/${r.head.ref}.\n`); return 0
        }
        const up = ancestors(r, upstream)
        const todo: Commit[] = []
        for (let id: string | undefined = ours; id && !up.has(id); id = r.commits.get(id)!.parents[0]) todo.unshift(r.commits.get(id)!)
        if (todo.some(t => t.parents.length > 1)) throw new GitError('error: (simulasi) rebase atas commit merge tidak didukung')
        if (dirtyPaths(fs, r).size) throw new GitError('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.', 1)
        const branch = r.head.ref
        hardReset(fs, r, sh.user, r.commits.get(upstream)!.tree)
        r.head = { id: upstream }
        for (const t of todo) {
          const res = apply3(fs, r, sh.user, t.parents[0] ? r.commits.get(t.parents[0])!.tree : new Map(), t.tree, `${short(t.id)} (${t.msg.split('\n')[0]})`, () => {})
          if (res.conflicts.length) { hardReset(fs, r, sh.user, r.commits.get(ours)!.tree); r.head = { ref: branch }; throw new GitError(`error: could not apply ${short(t.id)}... ${t.msg}\n(simulasi: rebase dibatalkan karena konflik; selesaikan dengan merge)`, 1) }
          r.head = { id: newCommit(r, res.tree, [headId(r)!], t.msg) }
        }
        const tip = r.head.id!
        r.head = { ref: branch }
        if (branch) r.branches.set(branch, tip)
        r.reflog.unshift(`${short(tip)} HEAD@{N}: rebase (finish): returning to refs/heads/${branch}`)
        c.out(`Successfully rebased and updated refs/heads/${branch}.\n`)
        return 0
      }
      case 'cherry-pick': case 'revert': {
        const r = need()
        const cm = r.commits.get(resolve(r, o.rest[0]))!
        const parent = cm.parents[0] ? r.commits.get(cm.parents[0])!.tree : new Map<string, string>()
        const [base, theirs] = sub === 'cherry-pick' ? [parent, cm.tree] : [cm.tree, parent]
        const res = apply3(fs, r, sh.user, base, theirs, `${short(cm.id)} (${cm.msg.split('\n')[0]})`, c.out)
        const msg = sub === 'cherry-pick' ? cm.msg : `Revert "${cm.msg.split('\n')[0]}"\n\nThis reverts commit ${cm.id}.`
        if (res.conflicts.length) { r.merging = undefined; c.out(`error: could not ${sub === 'revert' ? 'revert' : 'apply'} ${short(cm.id)}... ${cm.msg}\n`); return 1 }
        const id = newCommit(r, res.tree, [headId(r)!], msg)
        moveHead(r, id, `${sub}: ${msg.split('\n')[0]}`)
        c.out(`[${r.head.ref} ${short(id)}] ${msg.split('\n')[0]}\n`)
        return 0
      }
      case 'reset': {
        const r = need()
        const mode = o.flags.has('--hard') ? 'hard' : o.flags.has('--soft') ? 'soft' : 'mixed'
        const target = o.rest[0] && !(W(r).has(pathArg(r, o.rest[0])) || r.index.has(pathArg(r, o.rest[0]))) ? o.rest[0] : undefined
        const paths = target ? o.rest.slice(1) : o.rest
        if (paths.length) { const H = headTree(r); for (const s of paths) { const p = pathArg(r, s); if (H.has(p)) r.index.set(p, H.get(p)!); else r.index.delete(p) } return 0 }
        const id = resolve(r, target ?? 'HEAD')
        const tree = r.commits.get(id)!.tree
        if (mode === 'hard') hardReset(fs, r, sh.user, tree)
        else if (mode === 'mixed') { r.index = cloneTree(tree); r.conflicts.clear() }
        moveHead(r, id, `reset: moving to ${target ?? 'HEAD'}`)
        r.merging = undefined
        if (mode === 'hard') c.out(`HEAD is now at ${short(id)} ${r.commits.get(id)!.msg.split('\n')[0]}\n`)
        return 0
      }
      case 'restore': {
        const r = need()
        const staged = o.flags.has('--staged') || o.flags.has('-S')
        for (const s of o.rest) {
          const p = pathArg(r, s)
          if (staged) { const H = headTree(r); if (H.has(p)) r.index.set(p, H.get(p)!); else r.index.delete(p) }
          else writeWork(fs, r, sh.user, p, r.index.get(p))
        }
        return 0
      }
      case 'stash': {
        const r = need()
        const action = o.rest[0] ?? 'push'
        if (action === 'list') { r.stash.forEach((s, i) => c.out(`stash@{${i}}: ${s.msg}\n`)); return 0 }
        if (action === 'push' || action === 'save') {
          if (!dirtyPaths(fs, r).size) { c.out('No local changes to save\n'); return 0 }
          const w = W(r)
          const tree: Tree = new Map([...w].filter(([p]) => r.index.has(p) || headTree(r).has(p)))
          const id = headId(r)!
          const msg = o.vals['-m']?.[0] ? `On ${r.head.ref}: ${o.vals['-m'][0]}` : `WIP on ${r.head.ref}: ${short(id)} ${r.commits.get(id)!.msg.split('\n')[0]}`
          r.stash.unshift({ tree, index: cloneTree(r.index), msg })
          hardReset(fs, r, sh.user, headTree(r))
          c.out(`Saved working directory and index state ${msg}\n`)
          return 0
        }
        if (action === 'pop' || action === 'apply') {
          const s = r.stash[0]
          if (!s) throw new GitError('error: No stash entries found.', 1)
          const res = apply3(fs, r, sh.user, headTree(r), s.tree, 'Stashed changes', c.out)
          // Perubahan stash kembali sebagai perubahan yang belum di-stage (seperti git tanpa --index).
          r.index = cloneTree(headTree(r))
          for (const [p, v] of s.index) if (!headTree(r).has(p)) r.index.set(p, v)
          if (res.conflicts.length) return 1
          if (action === 'pop') { r.stash.shift(); c.out(`Dropped refs/stash@{0}\n`) }
          return 0
        }
        if (action === 'drop') { r.stash.shift(); return 0 }
        throw new GitError(`error: unknown subcommand: ${action}`, 1)
      }
      case 'tag': {
        const r = need()
        if (o.flags.has('-d')) { for (const t of o.rest) r.tags.delete(t); return 0 }
        if (!o.rest.length) { for (const t of [...r.tags.keys()].sort()) c.out(t + '\n'); return 0 }
        const [name, at] = o.rest
        if (r.tags.has(name)) throw new GitError(`fatal: tag '${name}' already exists`)
        r.tags.set(name, resolve(r, at ?? 'HEAD'))
        return 0
      }
      case 'reflog': {
        const r = need()
        r.reflog.forEach((l, i) => c.out(l.replace('HEAD@{N}', `HEAD@{${i}}`) + '\n'))
        return 0
      }
      case 'remote': {
        const r = need()
        if (o.rest[0] === 'add') { r.remotes.set(o.rest[1], sh.abs(o.rest[2])); return 0 }
        if (o.rest[0] === 'remove') { r.remotes.delete(o.rest[1]); return 0 }
        for (const [n, u] of [...r.remotes].sort()) c.out(o.flags.has('-v') ? `${n}\t${u} (fetch)\n${n}\t${u} (push)\n` : n + '\n')
        return 0
      }
      case 'push': case 'fetch': case 'pull': {
        const r = need()
        const remoteName = o.rest[0] ?? 'origin'
        const path = r.remotes.get(remoteName)
        if (!path) throw new GitError(`fatal: '${remoteName}' does not appear to be a git repository\nfatal: Could not read from remote repository.`)
        const remote = repos(fs).get(path)
        if (!remote) throw new GitError(`fatal: '${path}' does not appear to be a git repository`)
        if (sub === 'push') {
          const branch = o.rest[1] ?? r.head.ref!
          const id = r.branches.get(branch)
          if (!id) throw new GitError(`error: src refspec ${branch} does not match any`, 1)
          const cur = remote.branches.get(branch)
          if (cur && !ancestors(r, id).has(cur)) throw new GitError(` ! [rejected]        ${branch} -> ${branch} (fetch first)\nerror: failed to push some refs\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. Integrate the remote changes (e.g. 'git pull ...') before pushing again.`, 1)
          for (const a of ancestors(r, id)) remote.commits.set(a, r.commits.get(a)!)
          remote.branches.set(branch, id)
          r.remoteRefs.set(`${remoteName}/${branch}`, id)
          if (o.flags.has('-u') || o.flags.has('--set-upstream') || o.vals['-u']) r.upstream.set(branch, remoteName)
          if (o.vals['-u'] && !o.rest[1]) { /* -u diikuti nama remote */ }
          c.err(`To ${path}\n ${cur ? `${short(cur)}..${short(id)}` : '* [new branch]     '} ${branch} -> ${branch}\n`)
          return 0
        }
        for (const [b, id] of remote.branches) { for (const a of ancestors(remote, id)) r.commits.set(a, remote.commits.get(a)!); r.remoteRefs.set(`${remoteName}/${b}`, id) }
        if (sub === 'fetch') return 0
        const branch = o.rest[1] ?? r.head.ref!
        const theirs = r.remoteRefs.get(`${remoteName}/${branch}`)
        if (!theirs) throw new GitError(`fatal: couldn't find remote ref ${branch}`)
        return git({ ...c, args: ['merge', `${remoteName}/${branch}`] })
      }
      case 'clone': {
        const src = sh.abs(o.rest[0])
        const remote = repos(fs).get(src)
        if (!remote) throw new GitError(`fatal: repository '${o.rest[0]}' does not exist`)
        const dir = sh.abs(o.rest[1] ?? VFS.base(src).replace(/\.git$/, ''))
        c.err(`Cloning into '${VFS.base(dir)}'...\n`)
        await git({ ...c, args: ['init', dir], out: () => {} })
        const r = repos(fs).get(dir)!
        r.remotes.set('origin', src)
        for (const [b, id] of remote.branches) { for (const a of ancestors(remote, id)) r.commits.set(a, remote.commits.get(a)!); r.remoteRefs.set(`origin/${b}`, id) }
        const def = remote.branches.has('main') ? 'main' : [...remote.branches.keys()][0]
        if (def) {
          r.branches.set(def, remote.branches.get(def)!)
          r.head = { ref: def }
          r.upstream.set(def, 'origin')
          const tree = r.commits.get(remote.branches.get(def)!)!.tree
          for (const [p, v] of tree) writeWork(fs, r, sh.user, p, v)
          r.index = cloneTree(tree)
        }
        return 0
      }
      default:
        c.err(`git: '${sub}' is not a git command. See 'git help'.\n`)
        return 1
    }
  } catch (e) {
    if (e instanceof GitError) { c.err(e.message + '\n'); return e.code }
    throw e
  }
}

// Potret repo untuk graf commit di UI.
export type Snapshot = { commits: { id: string; parents: string[]; msg: string }[]; branches: Record<string, string>; tags: Record<string, string>; head: { ref?: string; id?: string } }
export function snapshot(fs: VFS, cwd: string): Snapshot | null {
  const r = findRepo(fs, cwd)
  if (!r) return null
  const live = new Set<string>()
  for (const id of [...r.branches.values(), ...r.tags.values(), ...(r.head.id ? [r.head.id] : [])]) for (const a of ancestors(r, id)) live.add(a)
  const commits = [...live].map(id => r.commits.get(id)!).sort((a, b) => b.seq - a.seq).map(c => ({ id: c.id, parents: c.parents, msg: c.msg.split('\n')[0] }))
  return { commits, branches: Object.fromEntries(r.branches), tags: Object.fromEntries(r.tags), head: { ...r.head } }
}
