// Logika mode game (murni, teruji): siklus harian, Daily Kata, misi, Infinity Castle, Boss Raid, Time Attack, Bug Rush.
import type { Attempt } from '../db'
import { COMPLEXITIES, type Exercise } from './exercise-types'
import type { Mcq } from './content'
import { rng } from './visual'

// Hari & minggu menurut jam lokal user (siklus harian mengikuti hari di HP-nya).
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function weekKey(d = new Date()) {
  // ISO-8601: minggu dimulai Senin, minggu 1 berisi Kamis pertama tahun itu.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

export const seedOf = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)
export function pickN<T>(items: T[], n: number, seed: string) {
  const r = rng(seedOf(seed))
  return items.map(x => [r(), x] as const).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, x]) => x)
}

const today = (a: Attempt, day: string) => dayKey(new Date(a.date)) === day

// ---- Daily Kata: satu soal menulis kode per hari dari bab yang sudah terbuka.
export const dailyKata = (pool: Exercise[], day: string) => pickN(pool.filter(e => e.type === 'write'), 1, `kata:${day}`)[0] ?? null
export const kataDone = (attempts: Attempt[], day: string) => attempts.some(a => a.kind === 'kata' && a.passed && today(a, day))

// ---- Daily Missions (Gagak Kasugai): misi Kata selalu ada + 2 misi acak per hari.
export type Mission = { id: string; text: string; target: number; progress: (todayAttempts: Attempt[]) => number }
const passed = (a: Attempt) => a.passed
const uniq = (xs: string[]) => new Set(xs).size
const best = (xs: Attempt[], kind: Attempt['kind']) => Math.max(0, ...xs.filter(a => a.kind === kind).map(a => a.correct))

export const MISSIONS: Mission[] = [
  { id: 'kata', text: 'Selesaikan Daily Kata', target: 1, progress: t => (t.some(a => a.kind === 'kata' && a.passed) ? 1 : 0) },
  { id: 'latihan3', text: 'Tebas 3 latihan berbeda', target: 3, progress: t => uniq(t.filter(a => a.kind === 'exercise' && passed(a)).map(a => a.node)) },
  { id: 'bug2', text: 'Tebas 2 Bug Hunt', target: 2, progress: t => uniq(t.filter(a => a.kind === 'exercise' && passed(a) && a.meta?.type === 'bughunt').map(a => a.node)) },
  { id: 'castle5', text: 'Capai lantai 5 di Infinity Castle', target: 5, progress: t => best(t, 'castle') },
  { id: 'time8', text: 'Jawab 8 benar di Time Attack', target: 8, progress: t => best(t, 'timeattack') },
  { id: 'rush10', text: 'Skor 10 di Bug Rush', target: 10, progress: t => best(t, 'bugrush') },
  { id: 'raid', text: 'Serang Upper Moon di Boss Raid', target: 1, progress: t => (t.some(a => a.kind === 'raid' && a.correct > 0) ? 1 : 0) },
  { id: 'moon', text: 'Lulus 1 Lower/Upper Moon', target: 1, progress: t => (t.some(a => a.kind === 'exam' && a.passed) ? 1 : 0) },
]

export function dailyMissions(day: string) {
  return [MISSIONS[0], ...pickN(MISSIONS.slice(1), 2, `misi:${day}`)]
}
export function missionStatus(day: string, attempts: Attempt[]) {
  const t = attempts.filter(a => today(a, day))
  return dailyMissions(day).map(m => { const p = Math.min(m.target, m.progress(t)); return { ...m, done: p >= m.target, value: p } })
}

// ---- Soal pilihan cepat (Time Attack & Infinity Castle): pilihan ganda bank, Complexity, Read the Error.
export type Choice = { id: string; prompt: string; code?: string; error?: string; options: string[]; answer: string; explain?: string; difficulty: number }
export function choices(exercises: Exercise[], mcqs: Mcq[]): Choice[] {
  return [
    ...mcqs.map(q => ({ id: q.id, prompt: q.prompt, code: q.code, options: q.options, answer: q.options[0], explain: q.explain, difficulty: 1 })),
    ...exercises.filter(e => e.type === 'complexity').map(e => ({ id: e.id, prompt: e.prompt, code: e.code, options: COMPLEXITIES, answer: e.answer!, explain: e.explain, difficulty: e.difficulty })),
    ...exercises.filter(e => e.type === 'quiz').map(e => ({ id: e.id, prompt: e.prompt, code: e.code, options: e.options!, answer: e.options![0], explain: e.explain, difficulty: e.difficulty })),
    ...exercises.filter(e => e.type === 'readerror').map(e => ({ id: e.id, prompt: 'Apa penyebab error ini?', code: e.code, error: e.error, options: e.options!, answer: e.options![0], explain: e.explain, difficulty: e.difficulty })),
  ]
}

// ---- Infinity Castle: makin tinggi makin sulit; setiap lantai ke-10 adalah boss (soal menulis kode).
export const CASTLE_LIVES = 3
export const isBossFloor = (floor: number) => floor % 10 === 0
export const castleLevel = (floor: number) => Math.min(5, 1 + Math.floor((floor - 1) / 4))
export type Room = { floor: number; boss: boolean } & ({ choice: Choice } | { ex: Exercise })
export function castleRoom(floor: number, pool: Exercise[], quick: Choice[], seed: string): Room | null {
  const lvl = castleLevel(floor)
  const near = <T extends { difficulty: number }>(xs: T[]) => {
    const exact = xs.filter(x => x.difficulty <= lvl && x.difficulty >= lvl - 1)
    return exact.length ? exact : xs
  }
  if (isBossFloor(floor)) {
    const ex = pickN(near(pool.filter(e => ['write', 'fill', 'bughunt'].includes(e.type))), 1, `${seed}:${floor}`)[0]
    if (ex) return { floor, boss: true, ex }
  }
  // Ruangan biasa: pilihan cepat atau tebak output.
  const items: ({ choice: Choice } | { ex: Exercise })[] = [...near(quick).map(choice => ({ choice })), ...near(pool.filter(e => e.type === 'predict')).map(ex => ({ ex }))]
  const it = pickN(items, 1, `${seed}:${floor}`)[0]
  return it ? { floor, boss: false, ...it } : null
}

// ---- Boss Raid mingguan: 5 soal ber-test case; HP = jumlah test, damage = test terbanyak yang pernah lolos per soal.
export const UPPER_MOONS = [
  { name: 'Kokushibo', rank: 'Upper Moon Satu', sprites: ['kokushibo'] }, { name: 'Doma', rank: 'Upper Moon Dua', sprites: ['doma'] }, { name: 'Akaza', rank: 'Upper Moon Tiga', sprites: ['akaza'] },
  { name: 'Hantengu', rank: 'Upper Moon Empat', sprites: ['hantengu'] }, { name: 'Gyokko', rank: 'Upper Moon Lima', sprites: ['gyokko'] }, { name: 'Gyutaro & Daki', rank: 'Upper Moon Enam', sprites: ['gyutaro', 'daki'] },
]
export const raidBoss = (week: string) => UPPER_MOONS[Math.abs(seedOf(week)) % UPPER_MOONS.length]
export const raidProblems = (pool: Exercise[], week: string) => pickN(pool.filter(e => ['write', 'fill', 'bughunt', 'translate'].includes(e.type) && e.tests.length), 5, `raid:${week}`)
export const raidNode = (week: string, id: string) => `${week}:${id}`
export const raidDefeatNode = (week: string) => `${week}:tumbang` // dicatat sekali saat boss tumbang (pencapaian)
export function raidState(problems: Exercise[], attempts: Attempt[], week: string) {
  const dmg = problems.map(p => Math.max(0, ...attempts.filter(a => a.kind === 'raid' && a.node === raidNode(week, p.id)).map(a => a.correct)))
  const hp = problems.reduce((s, p) => s + p.tests.length, 0)
  const dealt = dmg.reduce((s, d) => s + d, 0)
  return { hp, dealt, left: hp - dealt, dmg, defeated: hp > 0 && dealt >= hp }
}

// ---- Bug Rush: kode Bug Hunt tampil sebagai versi ber-bug (starter) atau sudah benar (solusi).
export type RushItem = { id: string; code: string; buggy: boolean }
export function rushItem(pool: Exercise[], seed: string): RushItem | null {
  const bugs = pool.filter(e => e.type === 'bughunt')
  const r = rng(seedOf(seed))
  const e = bugs[Math.floor(r() * bugs.length)]
  if (!e) return null
  const buggy = r() < 0.5
  return { id: e.id, code: (buggy ? e.starter! : e.solutions[0]).trimEnd(), buggy }
}

export const TIME_ATTACK_SECONDS = 300
export const BUG_RUSH_SECONDS = 60
