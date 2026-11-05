import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import type { Attempt } from '../db'
import type { Exercise } from './exercise-types'
import { MISSIONS, castleLevel, castleRoom, choices, dailyKata, dailyMissions, dayKey, isBossFloor, missionStatus, raidBoss, raidProblems, raidState, raidNode, rushItem, weekKey } from './game'

const EX: Exercise[] = readdirSync('src/generated').filter(f => f.endsWith('.json')).flatMap(f => Object.values(JSON.parse(readFileSync(`src/generated/${f}`, 'utf8')).chapters).flatMap(c => (c as { exercises: Exercise[] }).exercises))
const at = (kind: Attempt['kind'], date: string, extra: Partial<Attempt> = {}): Attempt => ({ track: 'python', node: 'x', kind, date, correct: 1, total: 1, passed: true, ...extra })

describe('siklus harian', () => {
  it('dayKey & weekKey (ISO) benar', () => {
    expect(dayKey(new Date(2026, 9, 30, 23, 59))).toBe('2026-10-30')
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-W01') // Kamis
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53') // Jumat, ikut minggu terakhir 2026
    expect(weekKey(new Date(2026, 9, 26))).toBe(weekKey(new Date(2026, 10, 1))) // Senin..Minggu sama
    expect(weekKey(new Date(2026, 10, 1))).not.toBe(weekKey(new Date(2026, 10, 2)))
  })
  it('Daily Kata & misi deterministik per hari, berbeda antar hari', () => {
    expect(dailyKata(EX, '2026-10-30')?.id).toBe(dailyKata(EX, '2026-10-30')?.id)
    expect(dailyKata(EX, '2026-10-30')?.type).toBe('write')
    const hari = Array.from({ length: 20 }, (_, i) => dailyKata(EX, `2026-11-${i + 1}`)?.id)
    expect(new Set(hari).size).toBeGreaterThan(10)
    const m = dailyMissions('2026-10-30')
    expect(m).toHaveLength(3)
    expect(m[0].id).toBe('kata')
    expect(new Set(m.map(x => x.id)).size).toBe(3)
    expect(dailyKata([], '2026-10-30')).toBeNull()
  })
  it('progres misi hanya menghitung aktivitas hari ini', () => {
    const day = '2026-10-30'
    const t = (h: number) => new Date(2026, 9, 30, h).toISOString()
    const kemarin = new Date(2026, 9, 29, 12).toISOString()
    const s = (xs: Attempt[]) => Object.fromEntries(missionStatus(day, xs).map(m => [m.id, m.value]))
    expect(s([at('kata', kemarin)]).kata).toBe(0)
    expect(s([at('kata', t(8))]).kata).toBe(1)
  })
  it('progres setiap jenis misi', () => {
    const p = (id: string, xs: Attempt[]) => MISSIONS.find(m => m.id === id)!.progress(xs)
    const ex = (node: string, type: string, passed = true) => at('exercise', '', { node, passed, meta: { type } })
    expect(p('latihan3', [ex('a', 'write'), ex('a', 'write'), ex('b', 'predict'), ex('c', 'write', false)])).toBe(2)
    expect(p('bug2', [ex('a', 'bughunt'), ex('b', 'write'), ex('c', 'bughunt')])).toBe(2)
    expect(p('castle5', [at('castle', '', { correct: 3 }), at('castle', '', { correct: 7 })])).toBe(7)
    expect(p('time8', [at('timeattack', '', { correct: 9 })])).toBe(9)
    expect(p('rush10', [])).toBe(0)
    expect(p('raid', [at('raid', '', { correct: 0 })])).toBe(0)
    expect(p('raid', [at('raid', '', { correct: 2 })])).toBe(1)
    expect(p('moon', [at('exam', '', { passed: false })])).toBe(0)
  })
})

describe('Infinity Castle', () => {
  const quick = choices(EX, [])
  it('setiap lantai ke-10 adalah boss berisi soal kode, kesulitan naik', () => {
    expect([10, 20, 30].every(isBossFloor)).toBe(true)
    expect(castleLevel(1)).toBe(1)
    expect(castleLevel(17)).toBe(5)
    const boss = castleRoom(10, EX, quick, 's')!
    expect(boss.boss && 'ex' in boss && ['write', 'fill', 'bughunt'].includes(boss.ex.type)).toBe(true)
    const r = castleRoom(3, EX, quick, 's')!
    expect(r.boss).toBe(false)
    expect('choice' in r || ('ex' in r && r.ex.type === 'predict')).toBe(true)
  })
  it('pilihan cepat valid: jawaban ada di opsi', () => {
    for (const c of quick) expect(c.options).toContain(c.answer)
    expect(quick.length).toBeGreaterThanOrEqual(20)
  })
})

describe('Boss Raid & Bug Rush', () => {
  it('raid: 5 soal ber-test, HP = jumlah test, damage = rekor per soal', () => {
    const w = '2026-W44'
    const p = raidProblems(EX, w)
    expect(p).toHaveLength(5)
    const hp = p.reduce((s, e) => s + e.tests.length, 0)
    const hit = (id: string, correct: number) => at('raid', new Date().toISOString(), { node: raidNode(w, id), correct })
    expect(raidState(p, [], w)).toMatchObject({ hp, dealt: 0, defeated: false })
    const st = raidState(p, [hit(p[0].id, 1), hit(p[0].id, p[0].tests.length), hit(p[0].id, 0), hit('lain', 99)], w)
    expect(st.dealt).toBe(p[0].tests.length)
    expect(raidState(p, p.map(e => hit(e.id, e.tests.length)), w).defeated).toBe(true)
    expect(raidState(p, p.map(e => hit(e.id, e.tests.length)), '2026-W45').dealt).toBe(0) // minggu lain tidak dihitung
    expect(raidBoss(w)).toEqual(raidBoss(w))
  })
  it('bug rush: kode ber-bug = starter, aman = solusi', () => {
    let bug = 0, aman = 0
    for (let i = 0; i < 200; i++) {
      const it = rushItem(EX, `r${i}`)!
      const e = EX.find(x => x.id === it.id)!
      expect(e.type).toBe('bughunt')
      expect(it.code).toBe((it.buggy ? e.starter! : e.solutions[0]).trimEnd())
      if (it.buggy) bug++
      else aman++
    }
    expect(bug).toBeGreaterThan(60)
    expect(aman).toBeGreaterThan(60)
  })
})
