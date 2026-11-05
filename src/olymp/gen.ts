// Generator input soal olimpiade: kode JS di konten, deterministik (PRNG berbiji), dipakai sama persis di build (Node) & browser.
export type GenTest = { gen: string; seed: number }
export type RawTest = string | GenTest

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (a: number, b: number) => a + Math.floor(next() * (b - a + 1))
  return {
    next, int,
    arr: (n: number, a: number, b: number) => Array.from({ length: n }, () => int(a, b)),
    perm: (n: number) => { const p = Array.from({ length: n }, (_, i) => i + 1); for (let i = n - 1; i > 0; i--) { const j = int(0, i); [p[i], p[j]] = [p[j], p[i]] } return p },
    str: (n: number, alpha = 'abcdefghijklmnopqrstuvwxyz') => Array.from({ length: n }, () => alpha[int(0, alpha.length - 1)]).join(''),
    pick: <T,>(xs: T[]) => xs[int(0, xs.length - 1)],
  }
}

const cache = new Map<string, string>()
export function genInput(t: RawTest): string {
  if (typeof t === 'string') return t
  const key = `${t.seed}\u0000${t.gen}`
  let v = cache.get(key)
  if (v === undefined) {
    v = String(new Function('R', t.gen)(rng(t.seed)))
    if (!v.endsWith('\n')) v += '\n'
    if (cache.size > 64) cache.clear()
    cache.set(key, v)
  }
  return v
}
