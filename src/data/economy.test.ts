import { describe, expect, it } from 'vitest'
import type { Attempt, Spend } from '../db'
import {
  BUFFS, FREEZE_MAX, ITEMS, PITY_LEGEND, PITY_RARE, balance, bondLevel, bondPoints, bugRushSeconds, castleLives, earnings, freezePrice,
  heatmap, hintCost, owned, pity, pullPrice, rollMany, slayerLevel, streakState, sum, timeAttackSeconds, totalXp,
} from './economy'
import { CHARACTERS, STARTERS } from '../characters/roster'
import { rng } from './visual'

const T = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString()
const at = (kind: Attempt['kind'], d: number, x: Partial<Attempt> = {}): Attempt => ({ track: 'python', node: 'n', kind, date: T(d), correct: 1, total: 1, passed: true, ...x })
const ex = (node: string, d: number, x: Partial<Attempt> = {}) => at('exercise', d, { node, meta: { type: 'write', xp: 20 }, ...x })

describe('Koban & XP', () => {
  it('latihan hanya memberi Koban saat lulus pertama kali', () => {
    const e = earnings([ex('a', 1, { passed: false, correct: 0 }), ex('a', 1), ex('a', 2), ex('b', 2)])
    expect(e.filter(x => x.why.startsWith('Latihan'))).toHaveLength(2)
    expect(sum(e.filter(x => x.why.startsWith('Latihan')))).toBe(2 * (20 / 2 + 5))
  })
  it('mode game: hanya rekor terbaik per hari; raid: rekor per soal', () => {
    const e = earnings([at('castle', 1, { correct: 3 }), at('castle', 1, { correct: 7 }), at('castle', 2, { correct: 2 }),
      at('raid', 1, { node: 'W1:x', correct: 2 }), at('raid', 3, { node: 'W1:x', correct: 4 })])
    expect(e.filter(x => x.kind === 'castle').map(x => x.koban).sort((a, b) => a - b)).toEqual([6, 21])
    expect(e.filter(x => x.kind === 'raid').map(x => x.koban)).toEqual([12])
  })
  it('ujian: Lower 50, Upper 150, sekali per node', () => {
    const e = earnings([at('exam', 1, { node: 'f1' }), at('exam', 2, { node: 'f1' }), at('exam', 3, { node: 'f-boss' }), at('exam', 3, { node: 'f2', passed: false })])
    expect(e.filter(x => x.kind === 'exam').map(x => x.koban)).toEqual([50, 150])
  })
  it('misi harian: 15/misi + 25 kalau tuntas semua', () => {
    const e = earnings([at('kata', 30)]).filter(x => x.kind === 'mission')
    expect(e).toEqual([expect.objectContaining({ koban: 15 })])
  })
  it('buff Koban companion hanya berlaku sesuai syaratnya', () => {
    const base = sum(earnings([ex('a', 1)]))
    expect(sum(earnings([ex('a', 1, { companion: 'rengoku' })]))).toBe(Math.round(base * 1.1))
    expect(sum(earnings([ex('a', 1, { companion: 'sabito' })]))).toBe(Math.round(base * 1.2)) // write
    expect(sum(earnings([ex('a', 1, { companion: 'shinobu' })]))).toBe(base) // bukan bughunt
    expect(sum(earnings([at('castle', 1, { correct: 4, companion: 'sanemi' })]).filter(x => x.kind === 'castle'))).toBe(18)
  })
  it('saldo = diperoleh + pencapaian − (biaya − refund)', () => {
    const atts = [ex('a', 1), ex('b', 1)]
    const sp: Spend[] = [{ date: T(2), kind: 'pull', cost: 100, refund: 30, item: 'nichirin:biru', rarity: 1 }, { date: T(2), kind: 'hint', cost: 10 }]
    expect(balance(atts, sp, 50)).toBe(sum(earnings(atts)) + 50 - 80)
  })
  it('Slayer Level dari XP', () => {
    expect(slayerLevel(0)).toEqual({ level: 1, into: 0, need: 100 })
    expect(slayerLevel(100).level).toBe(2)
    expect(slayerLevel(299).level).toBe(2)
    expect(slayerLevel(300).level).toBe(3)
    expect(totalXp([ex('a', 1), at('exam', 1, { node: 'f1' })])).toBeGreaterThanOrEqual(120)
  })
})

describe('Gacha', () => {
  const pulled = (n: number, seed = 1) => {
    const spends: Spend[] = []
    for (let i = 0; i < n; i++) { const [r] = rollMany(1, rng(seed + i), spends, 100); spends.push({ id: i, date: T(1), kind: 'pull', cost: r.cost, refund: r.refund, item: r.item.id, rarity: r.rarity }) }
    return spends
  }
  it('pity: ★2+ paling lambat tiap 10 tarikan, ★3 paling lambat tiap 50', () => {
    for (const seed of [1, 99, 1234]) {
      const ps = pulled(300, seed)
      let rare = 0, legend = 0
      for (const p of ps) {
        rare = p.rarity! >= 2 ? 0 : rare + 1
        legend = p.rarity === 3 ? 0 : legend + 1
        expect(rare).toBeLessThan(PITY_RARE)
        expect(legend).toBeLessThan(PITY_LEGEND)
      }
    }
    expect(pity([])).toEqual({ rare: 0, legend: 0 })
  })
  it('selalu menang lawan sumber acak terburuk (r = 0.999)', () => {
    const worst = () => 0.999
    const sp: Spend[] = []
    const got = []
    for (let i = 0; i < 50; i++) { const [r] = rollMany(1, worst, sp, 100); sp.push({ date: T(1), kind: 'pull', cost: 100, item: r.item.id, rarity: r.rarity, id: i }); got.push(r.rarity) }
    expect(got[9]).toBe(2)
    expect(got[49]).toBe(3)
  })
  it('duplikat → refund 30%, karakter starter sudah dimiliki', () => {
    const sp = pulled(120)
    const dups = sp.filter(s => s.refund)
    expect(dups.length).toBeGreaterThan(0)
    expect(dups.every(d => d.refund === 30)).toBe(true)
    expect(STARTERS.every(id => owned([]).has(`char:${id}`))).toBe(true)
    expect(ITEMS.filter(i => i.kind === 'char')).toHaveLength(CHARACTERS.length - STARTERS.length)
  })
  it('10× tarikan sekaligus memakai harga paket', () => {
    const r = rollMany(10, rng(5), [], pullPrice('tanjiro', true))
    expect(r.reduce((s, x) => s + x.cost, 0)).toBe(900)
    expect(r.some(x => x.rarity >= 2)).toBe(true)
    expect(pullPrice('tengen')).toBe(90)
  })
})

describe('Buff, Bond, Streak', () => {
  it('setiap karakter punya tepat satu buff', () => {
    expect(Object.keys(BUFFS).sort()).toEqual(CHARACTERS.map(c => c.id).sort())
    expect(castleLives('giyu')).toBe(4)
    expect(castleLives('gyomei')).toBe(5)
    expect(castleLives('tanjiro')).toBe(3)
    expect(timeAttackSeconds('zenitsu')).toBe(360)
    expect(bugRushSeconds('inosuke')).toBe(75)
    expect(freezePrice('nezuko')).toBe(75)
  })
  it('hint: gratis untuk ★1–2, setelah 2 gagal, atau buff', () => {
    expect(hintCost(1, 0, 0, 'zenitsu')).toBe(0)
    expect(hintCost(3, 0, 0, 'zenitsu')).toBe(10)
    expect(hintCost(3, 2, 0, 'zenitsu')).toBe(0)
    expect(hintCost(3, 0, 0, 'tanjiro')).toBe(0)
    expect(hintCost(3, 0, 1, 'tanjiro')).toBe(10)
    expect(hintCost(3, 0, 1, 'urokodaki')).toBe(0)
  })
  it('bond naik dari aktivitas saat jadi companion', () => {
    const xs = [ex('a', 1, { companion: 'giyu' }), ex('b', 1, { companion: 'giyu' }), ex('c', 1, { companion: 'giyu', passed: false, correct: 0 }), ex('d', 1, { companion: 'tanjiro' })]
    expect(bondPoints('giyu', xs, [])).toBe(2)
    expect(bondPoints('mitsuri', xs.map(x => ({ ...x, companion: 'mitsuri' })), [])).toBe(6)
    expect([0, 2, 3, 10, 99, 100].map(bondLevel)).toEqual([0, 0, 1, 2, 4, 5])
  })
  it('streak: freeze menutup hari bolong, hanya kalau dibeli SEBELUMNYA, maks 2', () => {
    expect(streakState(['2026-10-01', '2026-10-02', '2026-10-04'], [], '2026-10-04').current).toBe(1)
    const f = streakState(['2026-10-01', '2026-10-02', '2026-10-04'], ['2026-10-01'], '2026-10-04')
    expect(f).toMatchObject({ current: 3, held: 0, frozen: ['2026-10-03'] })
    expect(streakState(['2026-10-01', '2026-10-04'], ['2026-10-04'], '2026-10-04').current).toBe(1) // telat beli
    expect(streakState(['2026-10-01'], ['2026-10-01', '2026-10-01', '2026-10-01'], '2026-10-01').held).toBe(FREEZE_MAX)
    expect(streakState(['2026-10-01', '2026-10-02'], [], '2026-10-03').current).toBe(2) // hari ini belum selesai
    expect(streakState([], [], '2026-10-03')).toMatchObject({ current: 0, best: 0 })
  })
  it('heatmap 18 minggu × 7 hari, hari ini terhitung', () => {
    const h = heatmap([ex('a', 30), ex('b', 30)], 18, new Date(2026, 9, 30, 12))
    expect(h).toHaveLength(18)
    expect(h.flat().find(c => c.day === '2026-10-30')!.n).toBe(2)
    expect(h[17].filter(c => c.future).length).toBe(2) // Jumat → Sabtu & Minggu belum datang
  })
})
