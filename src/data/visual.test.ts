import { describe, expect, it } from 'vitest'
import { ALGOS, GRAPH, binary, bfs, dfs, heap, linear, randomArray, slidingWindow, twoPointers, type ArrFrame, type GraphFrame } from './visual'

const last = <T,>(a: T[]) => a[a.length - 1]
const sorted = (a: number[]) => [...a].sort((x, y) => x - y)

describe('visualizer DSA', () => {
  it('semua sort berakhir terurut & mempertahankan isi (50 input acak)', () => {
    for (const id of ['bubble', 'selection', 'insertion', 'merge', 'quick']) {
      const algo = ALGOS.find(a => a.id === id)!
      for (let s = 1; s <= 50; s++) {
        const f = algo.frames(s) as ArrFrame[]
        const input = f[0].arr
        expect(last(f).arr, `${id} seed ${s}`).toEqual(sorted(input))
      }
    }
  })
  it('pencarian menemukan target yang ada dan melaporkan yang tidak ada', () => {
    for (let s = 1; s <= 50; s++) {
      const a = randomArray(s, 12, 50), t = a[s % a.length]
      const lf = last(linear(a, t)) as ArrFrame, bf = last(binary(a, t)) as ArrFrame
      expect(lf.arr[lf.ptr.i]).toBe(t)
      expect(bf.arr[bf.ptr.mid]).toBe(t)
      expect(last(binary(a, 999)).note).toContain('tidak ada')
    }
  })
  it('binary search butuh ≤ ceil(log2(n+1)) perbandingan', () => {
    const a = Array.from({ length: 1000 }, (_, i) => i)
    expect(binary(a, 777).length - 1).toBeLessThanOrEqual(10)
  })
  it('two pointers & sliding window sesuai brute force', () => {
    for (let s = 1; s <= 50; s++) {
      const a = randomArray(s, 10)
      const sum = a[0] + a[3]
      expect(last(twoPointers(a, sum)).note).toContain('Ketemu')
      const k = 3, brute = Math.max(...a.slice(0, a.length - k + 1).map((_, i) => a[i] + a[i + 1] + a[i + 2]))
      expect(last(slidingWindow(a, k)).note).toContain(`maksimum ${brute}`)
    }
  })
  it('BFS & DFS: urutan benar dan mengunjungi semua simpul', () => {
    expect((last(bfs()) as GraphFrame).visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect((last(dfs()) as GraphFrame).visited).toEqual([0, 1, 3, 6, 4, 7, 5, 2])
    expect(GRAPH.every((ns, u) => ns.every(v => GRAPH[v].includes(u)))).toBe(true) // tak berarah
  })
  it('heap: properti min-heap terjaga di setiap frame', () => {
    for (let s = 1; s <= 30; s++)
      for (const f of heap(randomArray(s)) as ArrFrame[])
        if (f.note.startsWith('Minimum')) f.arr.forEach((x, i) => i && expect(f.arr[(i - 1) >> 1]).toBeLessThanOrEqual(x))
  })
})
