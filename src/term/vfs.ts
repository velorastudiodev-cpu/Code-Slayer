// Virtual filesystem untuk terminal simulasi: direktori, file teks, permission Unix (rwx owner/group/other, setuid), user & group.
export type FNode = {
  type: 'file' | 'dir'
  mode: number // bit permission, mis. 0o644 (+0o4000 setuid)
  owner: string
  group: string
  mtime: number
  content: string // file: isi (teks; "biner" disimpan sebagai string latin1)
  children: Map<string, FNode> // dir
  bin?: string // executable simulasi (nama handler di tabel binaries)
}
export type User = { name: string; uid: number; groups: string[]; home: string; shell?: string }

export class FsError extends Error {
  path: string
  reason: string
  constructor(path: string, reason: string) { super(`${path}: ${reason}`); this.path = path; this.reason = reason }
}
export const NOENT = 'No such file or directory'
export const NOTDIR = 'Not a directory'
export const ISDIR = 'Is a directory'
export const DENIED = 'Permission denied'
export const EXISTS = 'File exists'
export const NOTEMPTY = 'Directory not empty'

const now = () => Date.UTC(2026, 9, 30, 9, 0) // waktu tetap supaya output deterministik

export function node(type: FNode['type'], owner: string, mode: number, content = ''): FNode {
  return { type, mode, owner, group: owner, mtime: now(), content, children: new Map() }
}

export const DEFAULT_USERS: User[] = [
  { name: 'root', uid: 0, groups: ['root'], home: '/root' },
  { name: 'slayer', uid: 1000, groups: ['slayer'], home: '/home/slayer' },
]

// Spesifikasi isi awal: path → isi, atau objek dengan mode/owner/bin.
export type FileSpec = string | { content?: string; mode?: number | string; owner?: string; group?: string; dir?: boolean; bin?: string }

export class VFS {
  root = node('dir', 'root', 0o755)
  users: User[]

  constructor(users = DEFAULT_USERS) {
    this.users = users
    for (const d of ['/bin', '/etc', '/tmp', '/var', '/var/log', '/home', '/root', '/usr', '/usr/bin']) this.mkdirAs('root', d, 0o755)
    this.get('/tmp')!.mode = 0o1777
    this.get('/root')!.mode = 0o700
    for (const u of users) if (u.name !== 'root') { const h = this.mkdirAs(u.name, u.home, 0o755); h.owner = u.name; h.group = u.groups[0] }
    this.writeAs('root', '/etc/hostname', 'kisatsutai\n')
    this.writeAs('root', '/etc/passwd', users.map(u => `${u.name}:x:${u.uid}:${u.uid}::${u.home}:${u.shell ?? '/bin/bash'}`).join('\n') + '\n')
    this.writeAs('root', '/etc/group', [...new Set(users.flatMap(u => u.groups))].map((g, i) => `${g}:x:${g === 'root' ? 0 : 1000 + i}:${users.filter(u => u.groups.includes(g) && u.groups[0] !== g).map(u => u.name).join(',')}`).join('\n') + '\n')
  }

  user(name: string) { return this.users.find(u => u.name === name) ?? this.users[1] }

  // ---- path
  static norm(path: string, cwd = '/', home = '/') {
    if (path === '~' || path.startsWith('~/')) path = home + path.slice(1)
    const parts = (path.startsWith('/') ? path : cwd + '/' + path).split('/')
    const out: string[] = []
    for (const p of parts) {
      if (!p || p === '.') continue
      if (p === '..') out.pop()
      else out.push(p)
    }
    return '/' + out.join('/')
  }
  static parent(path: string) { const i = path.lastIndexOf('/'); return i <= 0 ? '/' : path.slice(0, i) }
  static base(path: string) { return path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1) }

  get(abs: string): FNode | undefined {
    let n: FNode | undefined = this.root
    for (const p of abs.split('/').filter(Boolean)) {
      if (!n || n.type !== 'dir') return undefined
      n = n.children.get(p)
    }
    return n
  }

  // ---- permission
  can(user: string, n: FNode, bit: 4 | 2 | 1) {
    if (user === 'root') return bit !== 1 || n.type === 'dir' || (n.mode & 0o111) !== 0
    const u = this.user(user)
    const shift = n.owner === user ? 6 : u.groups.includes(n.group) ? 3 : 0
    return ((n.mode >> shift) & bit) !== 0
  }
  // Semua direktori di sepanjang path harus bisa dilewati (x).
  private walk(user: string, abs: string) {
    let n: FNode = this.root
    const parts = abs.split('/').filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      if (n.type !== 'dir') throw new FsError(abs, NOTDIR)
      if (!this.can(user, n, 1)) throw new FsError(abs, DENIED)
      const c = n.children.get(parts[i])
      if (!c) throw new FsError(abs, NOENT)
      n = c
    }
    return n
  }
  stat(user: string, abs: string) { return this.walk(user, abs) }
  exists(user: string, abs: string) { try { this.walk(user, abs); return true } catch { return false } }

  read(user: string, abs: string) {
    const n = this.walk(user, abs)
    if (n.type === 'dir') throw new FsError(abs, ISDIR)
    if (!this.can(user, n, 4)) throw new FsError(abs, DENIED)
    return n.content
  }
  list(user: string, abs: string) {
    const n = this.walk(user, abs)
    if (n.type !== 'dir') throw new FsError(abs, NOTDIR)
    if (!this.can(user, n, 4)) throw new FsError(abs, DENIED)
    return [...n.children.keys()].sort()
  }
  private dirFor(user: string, abs: string) {
    const d = this.walk(user, VFS.parent(abs))
    if (d.type !== 'dir') throw new FsError(abs, NOTDIR)
    return d
  }
  write(user: string, abs: string, content: string, append = false) {
    const existing = this.get(abs)
    if (existing) {
      this.walk(user, abs)
      if (existing.type === 'dir') throw new FsError(abs, ISDIR)
      if (!this.can(user, existing, 2)) throw new FsError(abs, DENIED)
      existing.content = append ? existing.content + content : content
      existing.mtime = now()
      return existing
    }
    const d = this.dirFor(user, abs)
    if (!this.can(user, d, 2)) throw new FsError(abs, DENIED)
    const f = node('file', user, 0o644, content)
    f.group = this.user(user).groups[0]
    d.children.set(VFS.base(abs), f)
    return f
  }
  mkdir(user: string, abs: string, parents = false) {
    if (parents) {
      let p = ''
      for (const part of abs.split('/').filter(Boolean)) {
        p += '/' + part
        const n = this.get(p)
        if (n) { if (n.type !== 'dir') throw new FsError(p, NOTDIR); continue }
        this.mkdir(user, p)
      }
      return this.get(abs)!
    }
    if (this.get(abs)) throw new FsError(abs, EXISTS)
    const d = this.dirFor(user, abs)
    if (!this.can(user, d, 2)) throw new FsError(abs, DENIED)
    const n = node('dir', user, 0o755)
    n.group = this.user(user).groups[0]
    d.children.set(VFS.base(abs), n)
    return n
  }
  remove(user: string, abs: string, recursive = false) {
    const n = this.walk(user, abs)
    if (n.type === 'dir' && !recursive) throw new FsError(abs, ISDIR)
    const d = this.dirFor(user, abs)
    // Sticky bit (/tmp): hanya pemilik file yang boleh menghapus.
    if (!this.can(user, d, 2) || (d.mode & 0o1000 && user !== 'root' && n.owner !== user)) throw new FsError(abs, DENIED)
    d.children.delete(VFS.base(abs))
  }
  rmdir(user: string, abs: string) {
    const n = this.walk(user, abs)
    if (n.type !== 'dir') throw new FsError(abs, NOTDIR)
    if (n.children.size) throw new FsError(abs, NOTEMPTY)
    this.remove(user, abs, true)
  }
  move(user: string, from: string, to: string) {
    const n = this.walk(user, from)
    const t = this.get(to)
    if (t?.type === 'dir') to = to + '/' + VFS.base(from)
    const src = this.dirFor(user, from), dst = this.dirFor(user, to)
    if (!this.can(user, src, 2) || !this.can(user, dst, 2)) throw new FsError(to, DENIED)
    src.children.delete(VFS.base(from))
    dst.children.set(VFS.base(to), n)
  }
  copy(user: string, from: string, to: string, recursive = false) {
    const n = this.walk(user, from)
    if (n.type === 'dir' && !recursive) throw new FsError(from, ISDIR)
    if (!this.can(user, n, 4)) throw new FsError(from, DENIED)
    const t = this.get(to)
    if (t?.type === 'dir') to = to + '/' + VFS.base(from)
    if (n.type === 'file') return this.write(user, to, n.content)
    this.mkdir(user, to, true)
    for (const c of n.children.keys()) this.copy(user, from + '/' + c, to + '/' + c, true)
  }

  // ---- untuk konten lab/soal: buat langsung tanpa cek permission
  mkdirAs(owner: string, abs: string, mode = 0o755) {
    let n = this.root
    for (const p of abs.split('/').filter(Boolean)) {
      let c = n.children.get(p)
      if (!c) { c = node('dir', owner, mode); n.children.set(p, c) }
      n = c
    }
    return n
  }
  writeAs(owner: string, abs: string, content: string, mode = 0o644) {
    const d = this.mkdirAs('root', VFS.parent(abs))
    const f = node('file', owner, mode, content)
    f.group = this.users.find(u => u.name === owner)?.groups[0] ?? owner
    d.children.set(VFS.base(abs), f)
    return f
  }
  load(files: Record<string, FileSpec>, home = '/home/slayer', defaultOwner = 'slayer') {
    for (const [p, spec] of Object.entries(files)) {
      const abs = VFS.norm(p, home, home)
      const s = typeof spec === 'string' ? { content: spec } : spec
      const owner = s.owner ?? (abs.startsWith(home) ? defaultOwner : 'root')
      const mode = typeof s.mode === 'string' ? parseInt(s.mode, 8) : s.mode
      const n = s.dir ? this.mkdirAs(owner, abs, mode ?? 0o755) : this.writeAs(owner, abs, s.content ?? '', mode ?? (s.bin ? 0o755 : 0o644))
      n.owner = owner
      if (s.group) n.group = s.group
      if (s.bin) n.bin = s.bin
      // Direktori induk di dalam home ikut dimiliki user.
      for (let d = VFS.parent(abs); d.startsWith(home) && d !== home; d = VFS.parent(d)) { const dn = this.get(d)!; dn.owner = owner; dn.group = this.user(owner).groups[0] }
    }
    return this
  }

  // ---- simpan/muat (terminal interaktif tersimpan di IndexedDB)
  toJSON(): unknown {
    const ser = (n: FNode): unknown => ({ ...n, children: n.type === 'dir' ? [...n.children].map(([k, c]) => [k, ser(c)]) : undefined })
    return { root: ser(this.root), users: this.users }
  }
  static fromJSON(j: { root: unknown; users: User[] }) {
    const v = new VFS(j.users)
    const de = (o: FNode & { children: unknown }): FNode => ({ ...o, children: new Map(((o.children as unknown as [string, never][]) ?? []).map(([k, c]) => [k, de(c)])) })
    v.root = de(j.root as never)
    return v
  }
}

export function modeString(n: FNode) {
  const t = n.type === 'dir' ? 'd' : '-'
  let s = ''
  for (const shift of [6, 3, 0]) {
    const b = (n.mode >> shift) & 7
    s += (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-')
  }
  if (n.mode & 0o4000) s = s.slice(0, 2) + (s[2] === 'x' ? 's' : 'S') + s.slice(3)
  if (n.mode & 0o1000) s = s.slice(0, 8) + (s[8] === 'x' ? 't' : 'T')
  return t + s
}
