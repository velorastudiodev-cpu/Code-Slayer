import type { Attempt } from './db'

// Final Selection: binary search atas bab yang bisa ditempatkan. Satu probe lulus kalau `need` soal benar berturut-turut.
export type Placement = { lo: number; hi: number; hits: number }

export const startPlacement = (chapters: number): Placement => ({ lo: 0, hi: chapters, hits: 0 })
export const probe = (p: Placement) => (p.lo < p.hi ? (p.lo + p.hi) >> 1 : null)

export function answer(p: Placement, correct: boolean, need = 2): Placement {
  const mid = probe(p)!
  if (!correct) return { lo: p.lo, hi: mid, hits: 0 }
  return p.hits + 1 >= need ? { lo: mid + 1, hi: p.hi, hits: 0 } : { ...p, hits: p.hits + 1 }
}

const DAY = 86_400_000
const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const MIN_PER_CHAPTER = 90 // shortcut: perkiraan statis sampai ada data waktu belajar nyata (M3)

// Pace Engine: ETA ke Kinoe dari laju nyata 14 hari terakhir (kalau sudah ada ≥2 exam lulus), kalau belum dari target menit/hari.
export function pace(remaining: number, minutesPerDay: number, attempts: Attempt[], today = new Date()) {
  const recent = attempts.filter(a => a.kind === 'exam' && today.getTime() - Date.parse(a.date) < 14 * DAY)
  const passed = recent.filter(a => a.passed).length
  const perDay = passed >= 2 ? passed / 14 : minutesPerDay / MIN_PER_CHAPTER
  const total = recent.reduce((s, a) => s + a.total, 0)
  const acc = total ? recent.reduce((s, a) => s + a.correct, 0) / total : 0.8
  // Makin sering salah, makin besar porsi review (20–50%).
  const review = Math.min(0.5, Math.max(0.2, 0.2 + (1 - acc) * 0.6))
  const newMin = Math.round(minutesPerDay * (1 - review))
  return {
    eta: new Date(today.getTime() + Math.ceil(remaining / perDay) * DAY),
    measured: passed >= 2,
    newMin,
    reviewMin: minutesPerDay - newMin,
  }
}

// Hari berturut-turut (sampai hari ini atau kemarin) yang punya aktivitas.
export function streak(dates: string[], today = new Date()) {
  const days = new Set(dates.map(d => dayKey(new Date(d))))
  let t = today.getTime()
  if (!days.has(dayKey(new Date(t)))) t -= DAY
  let n = 0
  while (days.has(dayKey(new Date(t)))) { n++; t -= DAY }
  return n
}
