import { describe, expect, it } from 'vitest'
import type { Attempt, Spend } from '../db'
import { ACHIEVEMENTS, achievementKoban, evaluate, stats } from './achievements'

const T = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString()
const ex = (node: string, d: number, x: Partial<Attempt> = {}): Attempt => ({ track: 'python', node, kind: 'exercise', date: T(d), correct: 1, total: 1, passed: true, meta: { type: 'write', xp: 20 }, ...x })
const done = (atts: Attempt[], spends: Spend[] = [], progress = [{ track: 'python', passed: [] as string[] }]) =>
  new Set(evaluate(stats(atts, spends, progress)).filter(a => a.done).map(a => a.id))

describe('pencapaian', () => {
  it('lebih dari 100, id unik, ada Demon Slayer Mark', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(100)
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length)
    expect(ACHIEVEMENTS.filter(a => a.tier === 4).length).toBeGreaterThanOrEqual(5)
  })
  it('kosong → hanya "mulai track" yang terbuka', () => {
    expect([...done([])]).toEqual(['track-python-start'])
  })
  it('First Blood, Segfault Survivor, Typo Slayer, percobaan pertama', () => {
    const d = done([
      ex('a', 1, { passed: false, correct: 0, meta: { type: 'write', err: 'segfault' } }), ex('a', 1),
      ex('b', 1, { passed: false, correct: 0, meta: { type: 'write', err: 'syntax' } }), ex('b', 2),
      ex('c', 2, { passed: false, correct: 0, meta: { type: 'write', err: 'timeout' } }),
    ])
    expect(d.has('solved-1')).toBe(true)
    expect(d.has('segfault')).toBe(true)
    expect(d.has('syntax')).toBe(true)
    expect(d.has('timeout')).toBe(false) // belum lulus soal c
    expect(d.has('type-write-1')).toBe(true)
  })
  it('streak & Demon Slayer Mark 30 hari', () => {
    const xs = Array.from({ length: 30 }, (_, i) => ({ ...ex(`n${i}`, 0), date: new Date(2026, 8, 1 + i, 10).toISOString() }))
    const d = done(xs)
    expect(d.has('streak-30')).toBe(true)
    expect(d.has('solved-25')).toBe(true)
  })
  it('Koban pencapaian sesuai tier', () => {
    expect(achievementKoban([{ tier: 1, done: true }, { tier: 4, done: true }, { tier: 3, done: false }])).toBe(320)
  })
  it('gacha: tarikan pertama & ★3', () => {
    const d = done([], [{ date: T(1), kind: 'pull', cost: 100, item: 'char:giyu', rarity: 3 }])
    expect(d.has('pull-1') && d.has('legend')).toBe(true)
  })
})
