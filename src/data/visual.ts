// Visualizer DSA: setiap algoritma menghasilkan daftar frame (murni, bisa diuji). Rendering ada di pages/Visual.tsx.
export type Mark = 'cmp' | 'swap' | 'done' | 'dim' | 'hit' | 'win'
export type ArrFrame = { kind: 'array' | 'heap'; arr: number[]; mark: Record<number, Mark>; ptr: Record<string, number>; note: string }
export type ListFrame = { kind: 'list'; style: 'stack' | 'queue' | 'linked'; items: number[]; mark: Record<number, Mark>; note: string }
export type GraphFrame = { kind: 'graph'; visited: number[]; frontier: number[]; current: number | null; note: string }
export type Frame = ArrFrame | ListFrame | GraphFrame

// RNG berbenih supaya input acak bisa direproduksi (dan diuji).
export function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32 }
}
export const randomArray = (seed: number, n = 9, max = 30) => { const r = rng(seed); return Array.from({ length: n }, () => 1 + Math.floor(r() * max)) }

const A = (arr: number[], note: string, mark: Record<number, Mark> = {}, ptr: Record<string, number> = {}): ArrFrame => ({ kind: 'array', arr: [...arr], mark, ptr, note })
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i)
const allDone = (n: number) => Object.fromEntries(range(0, n).map(i => [i, 'done' as Mark]))

function bubble(input: number[]) {
  const a = [...input], f = [A(a, 'Mulai: bandingkan pasangan bertetangga, tukar kalau terbalik.')]
  for (let end = a.length - 1; end > 0; end--) {
    for (let i = 0; i < end; i++) {
      const done = Object.fromEntries(range(end + 1, a.length).map(k => [k, 'done' as Mark]))
      f.push(A(a, `Bandingkan ${a[i]} dan ${a[i + 1]}`, { ...done, [i]: 'cmp', [i + 1]: 'cmp' }, { i }))
      if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; f.push(A(a, `Tukar → ${a[i]} ${a[i + 1]}`, { ...done, [i]: 'swap', [i + 1]: 'swap' }, { i })) }
    }
  }
  f.push(A(a, 'Terurut! O(n²) perbandingan.', allDone(a.length)))
  return f
}

function selection(input: number[]) {
  const a = [...input], f = [A(a, 'Cari minimum dari bagian yang belum terurut, taruh di depan.')]
  for (let i = 0; i < a.length - 1; i++) {
    let m = i
    const done = Object.fromEntries(range(0, i).map(k => [k, 'done' as Mark]))
    for (let j = i + 1; j < a.length; j++) {
      f.push(A(a, `Minimum sementara ${a[m]}, cek ${a[j]}`, { ...done, [m]: 'hit', [j]: 'cmp' }, { i, j }))
      if (a[j] < a[m]) m = j
    }
    ;[a[i], a[m]] = [a[m], a[i]]
    f.push(A(a, `Taruh ${a[i]} di posisi ${i}`, { ...done, [i]: 'swap', [m]: 'swap' }, { i }))
  }
  f.push(A(a, 'Terurut! O(n²) perbandingan.', allDone(a.length)))
  return f
}

function insertion(input: number[]) {
  const a = [...input], f = [A(a, 'Sisipkan setiap elemen ke posisi yang tepat di bagian kiri yang sudah terurut.')]
  for (let i = 1; i < a.length; i++) {
    let j = i
    f.push(A(a, `Ambil ${a[i]}`, { [i]: 'hit' }, { i }))
    while (j > 0 && a[j - 1] > a[j]) {
      ;[a[j - 1], a[j]] = [a[j], a[j - 1]]
      f.push(A(a, `${a[j]} > ${a[j - 1]}: geser`, { [j - 1]: 'swap', [j]: 'swap' }, { i, j: j - 1 }))
      j--
    }
  }
  f.push(A(a, 'Terurut! Cepat untuk data yang hampir terurut.', allDone(a.length)))
  return f
}

function merge(input: number[]) {
  const a = [...input], f = [A(a, 'Merge sort: gabungkan potongan berukuran 1, 2, 4, ... yang sudah terurut.')]
  for (let w = 1; w < a.length; w *= 2) {
    for (let lo = 0; lo < a.length - w; lo += 2 * w) {
      const mid = lo + w, hi = Math.min(lo + 2 * w, a.length)
      const merged = [...a.slice(lo, mid), ...a.slice(mid, hi)].sort((x, y) => x - y)
      f.push(A(a, `Gabung [${a.slice(lo, mid)}] + [${a.slice(mid, hi)}]`, Object.fromEntries(range(lo, hi).map(k => [k, 'cmp' as Mark])), { lo, mid }))
      a.splice(lo, hi - lo, ...merged)
      f.push(A(a, `Hasil [${merged}]`, Object.fromEntries(range(lo, hi).map(k => [k, 'swap' as Mark]))))
    }
  }
  f.push(A(a, 'Terurut! O(n log n): log n tingkat × n per tingkat.', allDone(a.length)))
  return f
}

function quick(input: number[]) {
  const a = [...input], f = [A(a, 'Quick sort: pilih pivot (elemen terakhir), pindahkan yang lebih kecil ke kiri.')]
  const sorted = new Set<number>()
  const go = (lo: number, hi: number) => {
    if (lo >= hi) { if (lo === hi) sorted.add(lo); return }
    const p = a[hi]
    let i = lo
    for (let j = lo; j < hi; j++) {
      f.push(A(a, `Pivot ${p}: cek ${a[j]}`, { [hi]: 'hit', [j]: 'cmp' }, { i, j }))
      if (a[j] < p) { [a[i], a[j]] = [a[j], a[i]]; i++ }
    }
    ;[a[i], a[hi]] = [a[hi], a[i]]
    sorted.add(i)
    f.push(A(a, `Pivot ${p} di posisi akhirnya (${i})`, { ...Object.fromEntries([...sorted].map(k => [k, 'done' as Mark])), [i]: 'win' }, { pivot: i }))
    go(lo, i - 1)
    go(i + 1, hi)
  }
  go(0, a.length - 1)
  f.push(A(a, 'Terurut! Rata-rata O(n log n), terburuk O(n²).', allDone(a.length)))
  return f
}

function linear(input: number[], target: number) {
  const f = [A(input, `Cari ${target} satu per satu dari kiri.`)]
  for (let i = 0; i < input.length; i++) {
    if (input[i] === target) { f.push(A(input, `Ketemu ${target} di indeks ${i}!`, { [i]: 'win' }, { i })); return f }
    f.push(A(input, `${input[i]} ≠ ${target}`, { [i]: 'cmp' }, { i }))
  }
  f.push(A(input, `${target} tidak ada. O(n) perbandingan.`))
  return f
}

function binary(input: number[], target: number) {
  const a = [...input].sort((x, y) => x - y)
  const f = [A(a, `Cari ${target} di array terurut: buang separuh setiap langkah.`)]
  let lo = 0, hi = a.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const dim = Object.fromEntries(range(0, a.length).filter(k => k < lo || k > hi).map(k => [k, 'dim' as Mark]))
    if (a[mid] === target) { f.push(A(a, `a[${mid}] = ${target}. Ketemu!`, { ...dim, [mid]: 'win' }, { lo, mid, hi })); return f }
    f.push(A(a, a[mid] < target ? `${a[mid]} < ${target}: buang kiri` : `${a[mid]} > ${target}: buang kanan`, { ...dim, [mid]: 'cmp' }, { lo, mid, hi }))
    if (a[mid] < target) lo = mid + 1
    else hi = mid - 1
  }
  f.push(A(a, `${target} tidak ada. O(log n) langkah.`, allDoneDim(a.length)))
  return f
}
const allDoneDim = (n: number) => Object.fromEntries(range(0, n).map(i => [i, 'dim' as Mark]))

function twoPointers(input: number[], target: number) {
  const a = [...input].sort((x, y) => x - y)
  const f = [A(a, `Cari dua angka berjumlah ${target}: pointer kiri & kanan saling mendekat.`)]
  let l = 0, r = a.length - 1
  while (l < r) {
    const s = a[l] + a[r]
    if (s === target) { f.push(A(a, `${a[l]} + ${a[r]} = ${target}. Ketemu!`, { [l]: 'win', [r]: 'win' }, { l, r })); return f }
    f.push(A(a, s < target ? `${a[l]} + ${a[r]} = ${s} < ${target}: geser kiri` : `${a[l]} + ${a[r]} = ${s} > ${target}: geser kanan`, { [l]: 'cmp', [r]: 'cmp' }, { l, r }))
    if (s < target) l++
    else r--
  }
  f.push(A(a, `Tidak ada pasangan. O(n) setelah diurutkan.`))
  return f
}

function slidingWindow(input: number[], k: number) {
  let sum = input.slice(0, k).reduce((s, x) => s + x, 0), best = sum, at = 0
  const win = (lo: number) => Object.fromEntries(range(lo, lo + k).map(i => [i, 'cmp' as Mark]))
  const f = [A(input, `Jendela ${k} elemen pertama, jumlah ${sum}`, win(0), { lo: 0 })]
  for (let lo = 1; lo + k <= input.length; lo++) {
    sum += input[lo + k - 1] - input[lo - 1]
    if (sum > best) { best = sum; at = lo }
    f.push(A(input, `Geser: +${input[lo + k - 1]} −${input[lo - 1]} = ${sum} (terbaik ${best})`, win(lo), { lo }))
  }
  f.push(A(input, `Jumlah maksimum ${best} di indeks ${at}..${at + k - 1}. O(n), bukan O(n·k).`, Object.fromEntries(range(at, at + k).map(i => [i, 'win' as Mark]))))
  return f
}

const L = (style: ListFrame['style'], items: number[], note: string, mark: Record<number, Mark> = {}): ListFrame => ({ kind: 'list', style, items: [...items], mark, note })

function stack(input: number[]) {
  const s: number[] = [], f = [L('stack', s, 'Stack: LIFO, yang terakhir masuk keluar pertama.')]
  input.slice(0, 5).forEach(x => { s.push(x); f.push(L('stack', s, `push(${x})`, { [s.length - 1]: 'hit' })) })
  for (let i = 0; i < 3; i++) { f.push(L('stack', s, `pop() → ${s.at(-1)}`, { [s.length - 1]: 'swap' })); s.pop() }
  f.push(L('stack', s, 'Semua operasi O(1).'))
  return f
}

function queue(input: number[]) {
  const q: number[] = [], f = [L('queue', q, 'Queue: FIFO, yang pertama masuk keluar pertama.')]
  input.slice(0, 5).forEach(x => { q.push(x); f.push(L('queue', q, `enqueue(${x})`, { [q.length - 1]: 'hit' })) })
  for (let i = 0; i < 3; i++) { f.push(L('queue', q, `dequeue() → ${q[0]}`, { 0: 'swap' })); q.shift() }
  f.push(L('queue', q, 'Dipakai di BFS dan antrean tugas.'))
  return f
}

function linked(input: number[]) {
  const l = input.slice(0, 5), f = [L('linked', l, 'Linked list: setiap simpul menunjuk ke simpul berikutnya.')]
  f.push(L('linked', l, 'Telusuri dari head: O(n)', Object.fromEntries(l.map((_, i) => [i, 'cmp' as Mark]))))
  l.unshift(99)
  f.push(L('linked', l, 'Sisip di head: buat simpul baru → arahkan ke head lama. O(1)', { 0: 'hit' }))
  l.splice(3, 0, 42)
  f.push(L('linked', l, 'Sisip di tengah: ubah 2 pointer setelah menemukan posisinya', { 3: 'hit' }))
  f.push(L('linked', l, 'Hapus simpul: sambungkan pendahulunya langsung ke penerusnya', { 2: 'swap' }))
  l.splice(2, 1)
  f.push(L('linked', l, 'Tanpa menggeser elemen lain (beda dengan array).'))
  return f
}

// Graf kecil tetap: 8 simpul (posisi digambar di Visual.tsx).
export const GRAPH: number[][] = [[1, 2], [0, 3, 4], [0, 5], [1, 6], [1, 6, 7], [2, 7], [3, 4], [4, 5]]

function bfs() {
  const seen = [0], q = [0], f: GraphFrame[] = [{ kind: 'graph', visited: [], frontier: [0], current: null, note: 'BFS dari 0: jelajahi lapis demi lapis dengan queue.' }]
  const visited: number[] = []
  while (q.length) {
    const u = q.shift()!
    visited.push(u)
    for (const v of GRAPH[u]) if (!seen.includes(v)) { seen.push(v); q.push(v) }
    f.push({ kind: 'graph', visited: [...visited], frontier: [...q], current: u, note: `Kunjungi ${u}, antrekan tetangga baru → queue [${q}]` })
  }
  f.push({ kind: 'graph', visited, frontier: [], current: null, note: `Urutan BFS: ${visited.join(' → ')}. O(V + E).` })
  return f
}

function dfs() {
  const visited: number[] = [], f: GraphFrame[] = [{ kind: 'graph', visited: [], frontier: [], current: null, note: 'DFS dari 0: masuk sedalam mungkin, baru mundur.' }]
  const go = (u: number, path: number[]) => {
    visited.push(u)
    f.push({ kind: 'graph', visited: [...visited], frontier: path, current: u, note: `Masuk ke ${u} (jalur ${[...path, u].join('→')})` })
    for (const v of GRAPH[u]) if (!visited.includes(v)) go(v, [...path, u])
  }
  go(0, [])
  f.push({ kind: 'graph', visited, frontier: [], current: null, note: `Urutan DFS: ${visited.join(' → ')}. O(V + E).` })
  return f
}

function heap(input: number[]) {
  const h: number[] = [], H = (note: string, mark: Record<number, Mark> = {}): ArrFrame => ({ kind: 'heap', arr: [...h], mark, ptr: {}, note })
  const f = [H('Min-heap: setiap induk ≤ anaknya. Akar selalu minimum.')]
  for (const x of input.slice(0, 7)) {
    h.push(x)
    let i = h.length - 1
    f.push(H(`Sisip ${x} di ujung`, { [i]: 'hit' }))
    while (i > 0 && h[(i - 1) >> 1] > h[i]) {
      const p = (i - 1) >> 1
      ;[h[p], h[i]] = [h[i], h[p]]
      f.push(H(`${h[p]} < induknya: naikkan (sift up)`, { [p]: 'swap', [i]: 'swap' }))
      i = p
    }
  }
  f.push(H(`Minimum = akar = ${h[0]}. Sisip O(log n).`, { 0: 'win' }))
  return f
}

export type Algo = { id: string; name: string; chapter: string; frames: (seed: number) => Frame[] }

// target diambil dari isi array supaya pencarian biasanya ketemu.
const pickTarget = (a: number[], seed: number) => a[Math.floor(rng(seed + 1)() * a.length)]

export const ALGOS: Algo[] = [
  { id: 'bubble', name: 'Bubble Sort', chapter: 'f6', frames: s => bubble(randomArray(s)) },
  { id: 'selection', name: 'Selection Sort', chapter: 'f6', frames: s => selection(randomArray(s)) },
  { id: 'insertion', name: 'Insertion Sort', chapter: 'f6', frames: s => insertion(randomArray(s)) },
  { id: 'merge', name: 'Merge Sort', chapter: 'f6', frames: s => merge(randomArray(s, 10)) },
  { id: 'quick', name: 'Quick Sort', chapter: 'f6', frames: s => quick(randomArray(s)) },
  { id: 'linear', name: 'Linear Search', chapter: 'f5', frames: s => { const a = randomArray(s); return linear(a, pickTarget(a, s)) } },
  { id: 'binary', name: 'Binary Search', chapter: 'f5', frames: s => { const a = randomArray(s, 12, 50); return binary(a, pickTarget(a, s)) } },
  { id: 'two-pointers', name: 'Two Pointers', chapter: 'f7', frames: s => { const a = randomArray(s, 10); const b = [...a].sort((x, y) => x - y); return twoPointers(a, b[1] + b[7]) } },
  { id: 'sliding-window', name: 'Sliding Window', chapter: 'm4', frames: s => slidingWindow(randomArray(s, 10), 3) },
  { id: 'stack', name: 'Stack', chapter: 'm2', frames: s => stack(randomArray(s)) },
  { id: 'queue', name: 'Queue', chapter: 'm2', frames: s => queue(randomArray(s)) },
  { id: 'linked-list', name: 'Linked List', chapter: 'm1', frames: s => linked(randomArray(s)) },
  { id: 'heap', name: 'Min-Heap', chapter: 'm6', frames: s => heap(randomArray(s)) },
  { id: 'bfs', name: 'BFS', chapter: 'l1', frames: () => bfs() },
  { id: 'dfs', name: 'DFS', chapter: 'l1', frames: () => dfs() },
]

export { bubble, selection, insertion, merge, quick, linear, binary, twoPointers, slidingWindow, stack, queue, linked, bfs, dfs, heap }
