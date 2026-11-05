// Ekonomi (murni, teruji): Koban, XP & Slayer Level, gacha + pity, Bond, buff companion, Streak Freeze.
// Koban yang diperoleh SELALU dihitung ulang dari attempts (tidak bisa dobel/hilang); yang disimpan hanya pengeluaran.
import type { Attempt, Spend } from '../db'
import { CHARACTERS, STARTERS } from '../characters/roster'
import type { Breath } from '../characters/rig'
import { dayKey, missionStatus } from './game'

// ---------------------------------------------------------------- Buff pasif companion
export type Buff =
  | { kind: 'hintFree'; n: number }
  | { kind: 'castleLives'; n: number }
  | { kind: 'timeMul'; m: number }
  | { kind: 'rushSec'; s: number }
  | { kind: 'koban'; pct: number; of?: Attempt['kind']; types?: string[]; track?: string }
  | { kind: 'gachaDiscount'; pct: number }
  | { kind: 'freezeDiscount'; pct: number }
  | { kind: 'bondMul'; m: number }

export const BUFFS: Record<string, Buff> = {
  tanjiro: { kind: 'hintFree', n: 1 },
  zenitsu: { kind: 'timeMul', m: 1.2 },
  inosuke: { kind: 'rushSec', s: 15 },
  shinobu: { kind: 'koban', pct: 50, types: ['bughunt', 'readerror'] },
  rengoku: { kind: 'koban', pct: 10 },
  giyu: { kind: 'castleLives', n: 1 },
  kanao: { kind: 'koban', pct: 50, of: 'timeattack' },
  muichiro: { kind: 'rushSec', s: 10 },
  mitsuri: { kind: 'bondMul', m: 2 },
  obanai: { kind: 'koban', pct: 50, of: 'raid' },
  sanemi: { kind: 'koban', pct: 50, of: 'castle' },
  gyomei: { kind: 'castleLives', n: 2 },
  tengen: { kind: 'gachaDiscount', pct: 10 },
  genya: { kind: 'koban', pct: 30, of: 'exam' },
  nezuko: { kind: 'freezeDiscount', pct: 50 },
  urokodaki: { kind: 'hintFree', n: 2 },
  sabito: { kind: 'koban', pct: 20, types: ['write'] },
  makomo: { kind: 'koban', pct: 30, types: ['refactor', 'parsons', 'fill'] },
  murata: { kind: 'koban', pct: 5 },
  aoi: { kind: 'koban', pct: 50, of: 'kata' },
  kanae: { kind: 'koban', pct: 30, types: ['review', 'translate', 'typing'] },
  tamayo: { kind: 'koban', pct: 20, track: 'dsa' },
  yushiro: { kind: 'koban', pct: 50, of: 'bugrush' },
}

const KIND_NAME: Partial<Record<Attempt['kind'], string>> = {
  timeattack: 'Time Attack', raid: 'Boss Raid', castle: 'Infinity Castle', exam: 'Lower/Upper Moon', kata: 'Daily Kata', bugrush: 'Bug Rush',
}
export function buffText(b: Buff): string {
  switch (b.kind) {
    case 'hintFree': return b.n === 1 ? 'Hint pertama gratis di setiap soal' : `${b.n} hint pertama gratis di setiap soal`
    case 'castleLives': return `+${b.n} nyawa di Infinity Castle`
    case 'timeMul': return `Waktu Time Attack ×${b.m}`
    case 'rushSec': return `Bug Rush +${b.s} detik`
    case 'gachaDiscount': return `Gacha ${b.pct}% lebih murah`
    case 'freezeDiscount': return `Streak Freeze ${b.pct}% lebih murah`
    case 'bondMul': return `Bond naik ${b.m}× lebih cepat`
    case 'koban': return `+${b.pct}% Koban${b.of ? ` dari ${KIND_NAME[b.of]}` : b.types ? ` dari latihan ${b.types.join(', ')}` : b.track ? ` dari track ${b.track.toUpperCase()}` : ''}`
  }
}
export const buffOf = (companion: string) => BUFFS[companion]
const buffNum = <K extends Buff['kind']>(companion: string, kind: K, key: string, none: number) => {
  const b = BUFFS[companion]
  return b?.kind === kind ? (b as unknown as Record<string, number>)[key] : none
}
export const castleLives = (companion: string, base = 3) => base + buffNum(companion, 'castleLives', 'n', 0)
export const timeAttackSeconds = (companion: string, base = 300) => Math.round(base * buffNum(companion, 'timeMul', 'm', 1))
export const bugRushSeconds = (companion: string, base = 60) => base + buffNum(companion, 'rushSec', 's', 0)
export const freeHints = (companion: string) => buffNum(companion, 'hintFree', 'n', 0)

// ---------------------------------------------------------------- Harga
export const PULL_PRICE = 100
export const TEN_PULL_PRICE = 900
export const FREEZE_PRICE = 150
export const FREEZE_MAX = 2
export const HINT_PRICE = 10
export const DUP_REFUND = 0.3
const discount = (price: number, pct: number) => Math.round(price * (1 - pct / 100))
export const pullPrice = (companion: string, ten = false) => discount(ten ? TEN_PULL_PRICE : PULL_PRICE, buffNum(companion, 'gachaDiscount', 'pct', 0))
export const freezePrice = (companion: string) => discount(FREEZE_PRICE, buffNum(companion, 'freezeDiscount', 'pct', 0))

// Hint: soal ★1–★2 gratis; soal ★3+ gratis setelah 2 kali gagal, sebelumnya 10 Koban per hint (kecuali buff).
export const withBuff = (koban: number, x: Pick<Earning, 'kind' | 'companion' | 'type' | 'track'>) => Math.round(koban * (1 + bonusPct(x) / 100))
export const hintCost = (difficulty: number, fails: number, index: number, companion: string) =>
  difficulty <= 2 || fails >= 2 || index < freeHints(companion) ? 0 : HINT_PRICE

// ---------------------------------------------------------------- Koban & XP
export type Earning = { koban: number; xp: number; why: string; date: string; companion?: string; kind: Attempt['kind'] | 'mission'; type?: string; track: string }

const isUpper = (node: string) => node.endsWith('-boss')
export const exerciseKoban = (xp: number) => Math.round(xp / 2) + 5

// Daftar penghasilan dari riwayat attempts. Anti-farming: latihan & ujian hanya sekali (lulus pertama),
// mode game dihitung dari skor TERBAIK per hari (raid: rekor per soal per minggu), misi harian sekali per hari.
export function earnings(attempts: Attempt[]): Earning[] {
  const out: Earning[] = []
  const sorted = [...attempts].sort((a, b) => a.date.localeCompare(b.date))
  const first = new Set<string>()
  const once = (key: string) => (first.has(key) ? false : (first.add(key), true))
  const best = new Map<string, Attempt>()
  const keep = (key: string, a: Attempt) => { const b = best.get(key); if (!b || a.correct > b.correct) best.set(key, a) }
  const e = (a: Attempt, koban: number, xp: number, why: string) => out.push({ koban, xp, why, date: a.date, companion: a.companion, kind: a.kind, type: a.meta?.type, track: a.track })
  for (const a of sorted) {
    const day = dayKey(new Date(a.date))
    if (a.kind === 'exercise' && a.passed && once(`ex:${a.node}`)) { const xp = a.meta?.xp ?? 10; e(a, exerciseKoban(xp), xp, 'Latihan pertama kali lulus') }
    if (a.kind === 'kata' && a.passed && once(`kata:${day}`)) e(a, 30, 20, 'Daily Kata')
    if (a.kind === 'exam' && a.passed && once(`exam:${a.track}:${a.node}`)) e(a, isUpper(a.node) ? 150 : 50, isUpper(a.node) ? 300 : 100, isUpper(a.node) ? 'Upper Moon tertebas' : 'Lower Moon tertebas')
    if (a.kind === 'placement' && once(`place:${a.track}`)) e(a, 20, 0, 'Final Selection')
    if (a.kind === 'project' && a.passed && once(`proj:${a.node}`)) { e(a, 40, 40, 'Tahap project Swordsmith Village'); if (a.meta?.type === 'final') e(a, 100, 100, 'Project tuntas') }
    if (a.kind === 'review' && a.passed && once(`rev:${a.node}:${day}`)) e(a, 5, 5, 'Review Butterfly Mansion')
    if (a.kind === 'olymp' && a.passed && once(`olymp:${a.node}`)) e(a, 80, 80, 'Soal Hashira Trial skor 100')
    if (a.kind === 'arsip' && a.passed && once(`arsip:${a.node}`)) e(a, 30, 30, 'Soal arsip asli Accepted di TLX')
    if (a.kind === 'ctf' && a.passed && once(`ctf:${a.node}`)) e(a, Math.round(a.total / 2), a.total, 'Flag CTF tervalidasi')
    if (a.kind === 'contest' && a.passed && a.meta?.type && once(`contest:${a.node}:${a.meta.type}`)) { const k = { emas: 300, perak: 200, perunggu: 100 }[a.meta.type] ?? 0; e(a, k, k, `Medali ${a.meta.type} virtual contest`) }
    if (a.kind === 'castle' || a.kind === 'timeattack' || a.kind === 'bugrush') keep(`${a.kind}:${day}`, a)
    if (a.kind === 'raid') keep(`raid:${a.node}`, a)
  }
  const RATE: Partial<Record<Attempt['kind'], [number, string]>> = { castle: [3, 'Infinity Castle (rekor hari ini)'], timeattack: [2, 'Time Attack (rekor hari ini)'], bugrush: [1, 'Bug Rush (rekor hari ini)'], raid: [3, 'Boss Raid (damage terbaik)'] }
  for (const a of best.values()) { const [k, why] = RATE[a.kind]!; if (a.correct > 0) e(a, a.correct * k, a.correct * k, why) }
  // Misi harian: 15 per misi, +25 kalau ketiganya tuntas.
  for (const day of new Set(sorted.map(a => dayKey(new Date(a.date))))) {
    const done = missionStatus(day, attempts).filter(m => m.done).length
    const at = `${day}T23:59:59`
    if (done) out.push({ koban: done * 15 + (done === 3 ? 25 : 0), xp: done * 10, why: 'Misi harian', date: at, kind: 'mission', track: 'game' })
  }
  return out.map(x => ({ ...x, koban: Math.round(x.koban * (1 + bonusPct(x) / 100)) }))
}

export function bonusPct(x: Pick<Earning, 'kind' | 'companion' | 'type' | 'track'>) {
  if (x.kind === 'mission' || !x.companion) return 0
  const b = BUFFS[x.companion]
  if (b?.kind !== 'koban') return 0
  if (b.of && b.of !== x.kind) return 0
  if (b.types && !(x.kind === 'exercise' && x.type && b.types.includes(x.type))) return 0
  if (b.track && b.track !== x.track) return 0
  return b.pct
}

export const sum = (xs: { koban: number }[]) => xs.reduce((s, x) => s + x.koban, 0)
export const spent = (spends: Spend[]) => spends.reduce((s, x) => s + x.cost - (x.refund ?? 0), 0)
export const balance = (attempts: Attempt[], spends: Spend[], achievementKoban = 0) => sum(earnings(attempts)) + achievementKoban - spent(spends)
export const totalXp = (attempts: Attempt[]) => earnings(attempts).reduce((s, x) => s + x.xp, 0)

// Slayer Level global: level n butuh 50·n·(n−1) XP total (0, 100, 300, 600, ...).
export const levelXp = (n: number) => 50 * n * (n - 1)
export function slayerLevel(xp: number) {
  let n = 1
  while (xp >= levelXp(n + 1)) n++
  return { level: n, into: xp - levelXp(n), need: levelXp(n + 1) - levelXp(n) }
}

// ---------------------------------------------------------------- Gacha kosmetik
export type ItemKind = 'char' | 'nichirin' | 'skin' | 'theme' | 'fx'
export type Item = { id: string; kind: ItemKind; name: string; rarity: 1 | 2 | 3; color?: string; pal?: Record<string, string>; fx?: Breath }

const HASHIRA = ['giyu', 'muichiro', 'mitsuri', 'obanai', 'sanemi', 'gyomei', 'tengen']
export const ITEMS: Item[] = [
  ...CHARACTERS.filter(c => !STARTERS.includes(c.id)).map(c => ({ id: `char:${c.id}`, kind: 'char' as const, name: c.name, rarity: (HASHIRA.includes(c.id) ? 3 : 2) as 2 | 3 })),
  ...([
    ['hitam', 'Bilah Hitam', '#3a3a44'], ['biru', 'Bilah Biru Air', '#3b6fd1'], ['merah', 'Bilah Merah Api', '#e2452c'], ['kuning', 'Bilah Kuning Petir', '#d99a0b'],
    ['hijau', 'Bilah Hijau Angin', '#2f9a5e'], ['ungu', 'Bilah Ungu Serangga', '#7a4bb0'], ['pink', 'Bilah Merah Muda', '#d9558f'], ['kabut', 'Bilah Abu Kabut', '#6f8394'],
  ] as const).map(([id, name, color]) => ({ id: `nichirin:${id}`, kind: 'nichirin' as const, name, rarity: 1 as const, color })),
  { id: 'skin:malam', kind: 'skin', name: 'Haori Malam', rarity: 1, pal: { a: '#2a2f4a', b: '#4a5a8a', c: '#2a2f4a', C: '#4a5a8a' } },
  { id: 'skin:salju', kind: 'skin', name: 'Haori Salju', rarity: 1, pal: { a: '#eef3fb', b: '#bcd0e8', c: '#eef3fb', C: '#bcd0e8' } },
  { id: 'skin:sakura', kind: 'skin', name: 'Haori Sakura', rarity: 2, pal: { a: '#f6c6d8', b: '#fbeff4', c: '#e48ab0', C: '#fbeff4' } },
  { id: 'skin:emas', kind: 'skin', name: 'Haori Emas', rarity: 2, pal: { a: '#e0b33a', b: '#8a5a1a', c: '#e0b33a', C: '#8a5a1a' } },
  { id: 'skin:wisteria', kind: 'skin', name: 'Haori Wisteria', rarity: 2, pal: { a: '#b38be6', b: '#e6d6f6', c: '#7d4fc0', C: '#e6d6f6' } },
  { id: 'theme:washi', kind: 'theme', name: 'Editor Washi (terang)', rarity: 2 },
  { id: 'theme:wisteria', kind: 'theme', name: 'Editor Wisteria', rarity: 2 },
  { id: 'theme:bulan', kind: 'theme', name: 'Editor Bulan Merah', rarity: 2 },
  { id: 'fx:mist', kind: 'fx', name: 'Efek Kabut', rarity: 2, fx: 'mist' },
  { id: 'fx:flower', kind: 'fx', name: 'Efek Bunga', rarity: 2, fx: 'flower' },
  { id: 'fx:sound', kind: 'fx', name: 'Efek Suara', rarity: 2, fx: 'sound' },
  { id: 'fx:love', kind: 'fx', name: 'Efek Cinta', rarity: 2, fx: 'love' },
  { id: 'fx:sun', kind: 'fx', name: 'Efek Hinokami Kagura', rarity: 3, fx: 'sun' },
  { id: 'fx:moon', kind: 'fx', name: 'Efek Pernapasan Bulan', rarity: 3, fx: 'moon' },
]
export const itemById = (id: string) => ITEMS.find(i => i.id === id)
export const RATES = { 3: 0.04, 2: 0.26 } // sisanya ★1
export const PITY_RARE = 10 // paling lambat tarikan ke-10 dapat ★2+
export const PITY_LEGEND = 50 // paling lambat tarikan ke-50 dapat ★3

export const pulls = (spends: Spend[]) => spends.filter(s => s.kind === 'pull' && s.item).sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0))
export const owned = (spends: Spend[]) => new Set([...STARTERS.map(id => `char:${id}`), ...pulls(spends).map(p => p.item!)])
export function pity(spends: Spend[]) {
  const ps = pulls(spends)
  const since = (r: number) => { let n = 0; for (let i = ps.length - 1; i >= 0 && (ps[i].rarity ?? 1) < r; i--) n++; return n }
  return { rare: since(2), legend: since(3) }
}

// Satu tarikan. `r` = sumber acak (crypto di aplikasi, deterministik di test).
export function roll(r: () => number, p: { rare: number; legend: number }, have: Set<string>) {
  const x = r()
  let rarity: 1 | 2 | 3 = x < RATES[3] ? 3 : x < RATES[3] + RATES[2] ? 2 : 1
  if (p.legend + 1 >= PITY_LEGEND) rarity = 3
  else if (rarity === 1 && p.rare + 1 >= PITY_RARE) rarity = 2
  // Item yang belum dimiliki 3× lebih mungkin keluar.
  const pool = ITEMS.filter(i => i.rarity === rarity)
  const w = pool.map(i => (have.has(i.id) ? 1 : 3))
  let t = r() * w.reduce((s, v) => s + v, 0)
  const item = pool.find((_, i) => (t -= w[i]) < 0) ?? pool[pool.length - 1]
  return { item, rarity, dup: have.has(item.id) }
}
export function rollMany(n: number, r: () => number, spends: Spend[], price: number) {
  let p = pity(spends)
  const have = owned(spends)
  return Array.from({ length: n }, () => {
    const res = roll(r, p, have)
    p = { rare: res.rarity >= 2 ? 0 : p.rare + 1, legend: res.rarity === 3 ? 0 : p.legend + 1 }
    have.add(res.item.id)
    const cost = price / n
    return { ...res, cost, refund: res.dup ? Math.round(cost * DUP_REFUND) : 0 }
  })
}
export const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32

// ---------------------------------------------------------------- Bond
export const BOND_LEVELS = [3, 10, 25, 50, 100] // poin untuk level 1..5
export const BOND_UNLOCK = ['Kutipan', 'Tips dari Hashira #1', 'Cerita pendek', 'Tips dari Hashira #2', 'Ikatan penuh']
// Poin = aktivitas berhasil saat jadi companion (+10 per duplikat gacha karakter itu).
export function bondPoints(id: string, attempts: Attempt[], spends: Spend[]) {
  const act = attempts.filter(a => a.companion === id && (a.passed || a.correct > 0) && a.kind !== 'placement').length
  const dup = pulls(spends).filter(p => p.item === `char:${id}` && p.refund).length
  return Math.round(act * buffNum(id, 'bondMul', 'm', 1)) + dup * 10
}
export const bondLevel = (points: number) => BOND_LEVELS.filter(t => points >= t).length

// ---------------------------------------------------------------- Streak + Streak Freeze
const addDays = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)) }
export function streakState(activity: string[], freezeBuys: string[], today = dayKey()) {
  const active = new Set(activity)
  const days = [...activity, ...freezeBuys].sort()
  let run = 0, best = 0, held = 0
  const frozen: string[] = []
  if (!days.length) return { current: 0, best: 0, held: 0, frozen }
  for (let d = days[0]; d <= today; d = addDays(d, 1)) {
    held = Math.min(FREEZE_MAX, held + freezeBuys.filter(b => b === d).length)
    if (active.has(d)) run++
    else if (d === today) { /* hari ini belum berakhir */ }
    else if (run > 0 && held > 0) { held--; frozen.push(d) }
    else run = 0
    best = Math.max(best, run)
  }
  return { current: run, best, held, frozen }
}
export const activityDays = (attempts: Attempt[]) => [...new Set(attempts.map(a => dayKey(new Date(a.date))))]
export const freezeDays = (spends: Spend[]) => spends.filter(s => s.kind === 'freeze').map(s => dayKey(new Date(s.date)))

// Heatmap ala GitHub: jumlah aktivitas per hari, `weeks` minggu terakhir (kolom = minggu Senin..Minggu).
export function heatmap(attempts: Attempt[], weeks = 18, today = new Date()) {
  const count = new Map<string, number>()
  for (const a of attempts) { const d = dayKey(new Date(a.date)); count.set(d, (count.get(d) ?? 0) + 1) }
  const dow = (today.getDay() + 6) % 7 // Senin = 0
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow - (weeks - 1) * 7)
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))
    return { day, n: count.get(day) ?? 0, future: day > dayKey(today) }
  }))
}

