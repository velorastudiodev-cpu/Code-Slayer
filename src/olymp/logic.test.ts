import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { nodesOf } from '../data/curriculum'
import { bestScore, medal, objectiveScore, pickObjective, readiness, subtaskScore, topicStatus, trialGate, type Contest, type Olymp } from './logic'
import { genInput, rng } from './gen'
import { olympHash } from '../../scripts/build-olymp'

const O: Olymp & { hash: string } = JSON.parse(readFileSync('src/generated/meta/olymp.json', 'utf8'))
const all = (t: string) => nodesOf(t).filter(n => !n.boss).map(n => n.id)

describe('Hashira Trial', () => {
  it('terkunci sampai rank Kinoe (Python atau C++) + DSA Fondasi lulus', () => {
    expect(trialGate([]).open).toBe(false)
    const dsaF = nodesOf('dsa').filter(n => n.level === 'Fondasi' && !n.boss).map(n => n.id)
    expect(trialGate([{ track: 'python', passed: all('python').slice(0, -1) }, { track: 'dsa', passed: dsaF }]).open).toBe(false) // belum Kinoe
    expect(trialGate([{ track: 'python', passed: all('python') }, { track: 'dsa', passed: dsaF.slice(1) }]).open).toBe(false) // DSA kurang satu
    expect(trialGate([{ track: 'python', passed: all('python') }, { track: 'dsa', passed: dsaF }]).open).toBe(true)
    expect(trialGate([{ track: 'cpp', passed: all('cpp') }, { track: 'dsa', passed: dsaF }]).open).toBe(true)
  })
  it('skor subtask gaya IOI: subtask bernilai hanya jika semua tesnya lolos; terbaik per subtask lintas submisi', () => {
    const st = { points: 30, desc: '', tests: [{ expected: '' }, { expected: '' }] }
    expect(subtaskScore(st, [true, true])).toBe(30)
    expect(subtaskScore(st, [true, false])).toBe(0)
    expect(bestScore([[30, 0, 0], [0, 20, 0], [30, 0, 50]])).toEqual({ total: 100, per: [30, 20, 50] })
  })
  it('medali & skor objektif (benar +4, salah −1)', () => {
    const c = O.contests.find(x => x.id === 'sim-osnk') as Contest
    const qs = pickObjective(O.objective, c, 42)
    expect(qs).toHaveLength(25)
    expect(pickObjective(O.objective, c, 42).map(q => q.id)).toEqual(qs.map(q => q.id)) // deterministik
    const ans = Object.fromEntries(qs.map((q, i) => [q.id, i < 20 ? q.options[0] : i < 23 ? q.options[1] : undefined]))
    const r = objectiveScore(c, qs, ans)
    expect(r).toEqual({ score: 20 * 4 - 3, right: 20, wrong: 3, blank: 2, max: 100 })
    expect(medal(c, r.score, r.max)).toBe('perak')
    expect(medal(c, 10, 100)).toBe(null)
  })
  it('topic tracker & readiness meter', () => {
    const best = new Map(O.problems.filter(p => p.topics.includes('dsu')).map(p => [p.id, 100]))
    const t = topicStatus(O, best, new Set()).find(x => x.id === 'dsu')!
    expect(t.mastered).toBe(true)
    expect(readiness({ objektif: 0.3, problem: 0.4, diskrit: 0.3 }, { objektif: 100, problem: 50, diskrit: 0 })).toEqual({ total: 50, label: 'Sedang berlatih' })
  })
})

describe('konten olimpiade', () => {
  it('olymp.json tidak basi', () => expect(O.hash).toBe(olympHash()))
  it('skala konten: ≥ 150 problem solving, ≥ 200 objektif, ≥ 5 virtual contest', () => {
    expect(O.problems.length + O.archive.problems.length).toBeGreaterThanOrEqual(150)
    expect(O.objective.length).toBeGreaterThanOrEqual(200)
    expect(O.contests.length).toBeGreaterThanOrEqual(5)
  })
  it('soal asli beratribusi: sumber, tahun, tautan TLX, ringkasan', () => {
    for (const a of O.archive.problems) {
      expect(a.link).toMatch(/^https:\/\/tlx\.toki\.id\/problems\/[\w-]+\/[\w-]+$/)
      expect(a.source && a.year && a.summary).toBeTruthy()
    }
  })
  it('setiap soal orisinal: subtask total 100, editorial bertingkat, masuk topic tracker', () => {
    const topics = new Set(O.modules.topics.map(t => t.id))
    for (const p of O.problems) {
      expect(p.subtasks.reduce((s, x) => s + x.points, 0)).toBe(100)
      expect(p.editorial.hint && p.editorial.idea && p.editorial.solution && p.editorial.complexity).toBeTruthy()
      expect(p.topics.some(t => topics.has(t)), p.id).toBe(true)
    }
  })
  it('generator input deterministik', () => {
    const t = O.problems.flatMap(p => p.subtasks.flatMap(s => s.tests)).find(t => t.gen)!
    expect(genInput({ gen: t.gen!, seed: t.seed! })).toBe(genInput({ gen: t.gen!, seed: t.seed! }))
    expect(rng(7).int(1, 1e9)).toBe(rng(7).int(1, 1e9))
  })
})
