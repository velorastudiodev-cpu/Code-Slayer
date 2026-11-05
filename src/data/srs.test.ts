import { describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import type { Attempt } from '../db'
import { dueCards, isDue, mistakes, newCards, ratingOf, review } from './srs'

const at = (node: string, iso: string, passed: boolean, x: Partial<Attempt> = {}): Attempt => ({ track: 'python', node, kind: 'exercise', date: iso, correct: +passed, total: 1, passed, ...x })

describe('Butterfly Mansion (SRS)', () => {
  const xs = [
    at('a', '2026-11-01T10:00:00.000Z', false, { meta: { err: 'syntax', msg: 'SyntaxError' } }), at('a', '2026-11-01T10:05:00.000Z', true),
    at('b', '2026-11-01T11:00:00.000Z', true),
    at('c', '2026-11-02T09:00:00.000Z', false),
  ]
  it('soal gagal → kartu mistake langsung jatuh tempo; soal dikuasai → dijadwalkan beberapa hari', () => {
    const cards = newCards(xs, new Set())
    const a = cards.find(c => c.id === 'a')!, b = cards.find(c => c.id === 'b')!
    expect(a.source).toBe('mistake')
    expect(isDue(a, new Date('2026-11-01T12:00:00Z'))).toBe(true)
    expect(b.source).toBe('learned')
    expect(isDue(b, new Date('2026-11-01T12:00:00Z'))).toBe(false)
    expect(isDue(b, new Date('2026-12-30T00:00:00Z'))).toBe(true)
    expect(newCards(xs, new Set(['a', 'b', 'c']))).toEqual([])
  })
  it('rating otomatis dari hasil', () => {
    expect(ratingOf({ passed: false, failedRuns: 1, hints: 0, difficulty: 2 })).toBe(Rating.Again)
    expect(ratingOf({ passed: true, failedRuns: 1, hints: 0, difficulty: 2 })).toBe(Rating.Hard)
    expect(ratingOf({ passed: true, failedRuns: 0, hints: 1, difficulty: 2 })).toBe(Rating.Hard)
    expect(ratingOf({ passed: true, failedRuns: 0, hints: 0, difficulty: 2 })).toBe(Rating.Good)
    expect(ratingOf({ passed: true, failedRuns: 0, hints: 0, difficulty: 1 })).toBe(Rating.Easy)
  })
  it('review menjadwalkan: Good makin jauh tiap kali, Again kembali cepat & menambah lapses', () => {
    let c = newCards(xs, new Set()).find(x => x.id === 'c')!
    const now = new Date('2026-11-02T10:00:00Z')
    c = review(c, Rating.Good, now)
    const gap1 = Date.parse(c.due) - now.getTime()
    const later = new Date(c.due)
    c = review(c, Rating.Good, later)
    const gap2 = Date.parse(c.due) - later.getTime()
    expect(gap2).toBeGreaterThan(gap1)
    const again = review(c, Rating.Again, new Date(c.due))
    expect(again.lapses).toBe(1)
    expect(Date.parse(again.due) - Date.parse(c.due)).toBeLessThan(864e5)
  })
  it('jatuh tempo: mistake dulu; Mistake Journal mencatat error & status perbaikan', () => {
    const cards = newCards(xs, new Set())
    expect(dueCards(cards, new Date('2027-06-01')).map(c => c.source)).toEqual(['mistake', 'mistake', 'learned'])
    const m = mistakes(xs)
    expect(m.map(x => [x.id, x.fails, x.fixed])).toEqual([['c', 1, false], ['a', 1, true]])
    expect(m[1].err).toBe('syntax')
  })
  it('Rehab Quest: lulus review menandai kesalahan sudah diperbaiki', () => {
    const rev = { track: 't', node: 'c', kind: 'review' as const, date: '2026-11-03T00:00:00Z', correct: 1, total: 1, passed: true, meta: { type: 'mistake' } }
    expect(mistakes([...xs, rev]).find(x => x.id === 'c')!.fixed).toBe(true)
  })
})
