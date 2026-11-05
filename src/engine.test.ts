import { describe, expect, it } from 'vitest'
import { answer, pace, probe, startPlacement, streak } from './engine'
import { canTakeExam, currentIndex, nodesOf, passedFromPlacement, placeable, rankOf } from './data/curriculum'
import type { Attempt } from './db'

// Simulasi peserta yang menguasai bab < `knows`.
function place(chapters: number, knows: number) {
  let p = startPlacement(chapters), asked = 0
  for (let mid = probe(p); mid !== null; mid = probe(p)) { p = answer(p, mid < knows); asked++ }
  return { lo: p.lo, asked }
}

describe('Final Selection', () => {
  it('menempatkan tepat di bab pertama yang belum dikuasai', () => {
    for (let k = 0; k <= 13; k++) expect(place(13, k).lo).toBe(k)
  })
  it('singkat (≤ 8 soal untuk 13 bab)', () => {
    for (let k = 0; k <= 13; k++) expect(place(13, k).asked).toBeLessThanOrEqual(8)
  })
  it('maksimal sampai awal level Lanjut, tidak pernah ke level akhir', () => {
    const nodes = nodesOf('python')
    const passed = passedFromPlacement(nodes, placeable(nodes).length)
    expect(nodes[currentIndex(nodes, passed)].level).toBe('Lanjut')
    expect(passed).toContain('m-boss')
    expect(passed.some(id => id.startsWith('p'))).toBe(false)
  })
})

describe('Skill Tree', () => {
  const nodes = nodesOf('python')
  it('exam hanya untuk node berikutnya', () => {
    expect(canTakeExam(nodes, [], 'f1')).toBe(true)
    expect(canTakeExam(nodes, [], 'f2')).toBe(false)
    expect(canTakeExam(nodes, [], 'p-boss')).toBe(false)
  })
  it('Upper Moon mengunci level berikutnya', () => {
    const fondasi = nodes.filter(n => n.level === 'Fondasi' && !n.boss).map(n => n.id)
    expect(canTakeExam(nodes, fondasi, 'm1')).toBe(false)
    expect(canTakeExam(nodes, fondasi, 'f-boss')).toBe(true)
  })
  it('rank Kinoe hanya kalau semua bab lulus', () => {
    const all = nodes.map(n => n.id)
    expect(rankOf(nodes, [])).toBe(0)
    expect(rankOf(nodes, all.slice(0, -2))).toBeLessThan(9)
    expect(rankOf(nodes, all)).toBe(9)
  })
})

describe('Pace Engine', () => {
  const today = new Date('2026-10-30T12:00:00Z')
  const exam = (daysAgo: number, passed: boolean, correct = 2): Attempt =>
    ({ track: 'python', node: 'f1', kind: 'exam', date: new Date(today.getTime() - daysAgo * 864e5).toISOString(), correct, total: 2, passed })

  it('tanpa data: pakai target menit/hari', () => {
    const r = pace(10, 90, [], today)
    expect(r.measured).toBe(false)
    expect(r.eta.toISOString().slice(0, 10)).toBe('2026-11-09')
  })
  it('dengan data: pakai laju nyata', () => {
    const r = pace(7, 30, [exam(1, true), exam(2, true)], today) // 2 bab / 14 hari
    expect(r.measured).toBe(true)
    expect(r.eta.toISOString().slice(0, 10)).toBe('2026-12-18')
  })
  it('akurasi rendah menaikkan porsi review', () => {
    const good = pace(5, 60, [exam(1, true)], today)
    const bad = pace(5, 60, [exam(1, false, 0)], today)
    expect(bad.reviewMin).toBeGreaterThan(good.reviewMin)
    expect(bad.newMin + bad.reviewMin).toBe(60)
  })
})

it('streak menghitung hari berturut-turut', () => {
  const t = new Date('2026-10-30T12:00:00Z')
  expect(streak(['2026-10-30T01:00:00Z', '2026-10-29T10:00:00Z', '2026-10-27T10:00:00Z'], t)).toBe(2)
  expect(streak(['2026-10-29T10:00:00Z'], t)).toBe(1)
  expect(streak([], t)).toBe(0)
})
