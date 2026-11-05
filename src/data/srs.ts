// Butterfly Mansion (murni, teruji): kartu SRS dari riwayat soal + penjadwalan FSRS.
// - Soal yang pernah gagal → kartu "mistake" (Rehab Quest), langsung jatuh tempo.
// - Soal yang lulus tanpa pernah gagal → kartu "learned", dijadwalkan dari tanggal lulus (rating Good).
import { Rating, createEmptyCard, fsrs, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import type { Attempt, Card } from '../db'

const scheduler = fsrs({ enable_fuzz: false })

const toStore = (c: FsrsCard): Record<string, unknown> => ({ ...c, due: c.due.toISOString(), last_review: c.last_review?.toISOString() })
const fromStore = (o: Record<string, unknown>): FsrsCard => ({ ...(o as unknown as FsrsCard), due: new Date(o.due as string), last_review: o.last_review ? new Date(o.last_review as string) : undefined })

// Kartu baru yang perlu dibuat dari attempts (yang sudah ada tidak disentuh).
export function newCards(attempts: Attempt[], existing: Set<string>): Card[] {
  const byNode = new Map<string, Attempt[]>()
  for (const a of attempts) if (a.kind === 'exercise') { const l = byNode.get(a.node) ?? []; l.push(a); byNode.set(a.node, l) }
  const out: Card[] = []
  for (const [id, list] of byNode) {
    if (existing.has(id)) continue
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const failed = sorted.find(a => !a.passed)
    if (failed) {
      const c = createEmptyCard(new Date(failed.date))
      out.push({ id, track: failed.track, source: 'mistake', due: failed.date, fsrs: toStore(c), reviews: 0, lapses: 0 })
      continue
    }
    const pass = sorted.find(a => a.passed)
    if (!pass) continue
    const when = new Date(pass.date)
    // Lulus tanpa gagal = langkah belajar FSRS sudah dilewati: Good dua kali (lulus dari tahap learning).
    const step = scheduler.next(createEmptyCard(when), when, Rating.Good).card
    const next = scheduler.next(step, step.due, Rating.Good).card
    out.push({ id, track: pass.track, source: 'learned', due: next.due.toISOString(), fsrs: toStore(next), reviews: 0, lapses: 0 })
  }
  return out
}

// Rating otomatis dari hasil review: lulus di percobaan pertama tanpa hint = Good (Easy kalau soalnya ★1),
// lulus setelah gagal atau dengan hint = Hard, belum lulus = Again.
export function ratingOf(r: { passed: boolean; failedRuns: number; hints: number; difficulty: number }): Grade {
  if (!r.passed) return Rating.Again
  if (r.failedRuns > 0 || r.hints > 0) return Rating.Hard
  return r.difficulty <= 1 ? Rating.Easy : Rating.Good
}

export function review(card: Card, grade: Grade, now = new Date()): Card {
  const next = scheduler.next(fromStore(card.fsrs), now, grade).card
  return { ...card, due: next.due.toISOString(), fsrs: toStore(next), reviews: card.reviews + 1, lapses: card.lapses + (grade === Rating.Again ? 1 : 0), source: card.source === 'mistake' && grade !== Rating.Again && card.reviews >= 1 ? 'learned' : card.source }
}

export const isDue = (c: Card, now = new Date()) => c.due <= now.toISOString()
export const dueCards = (cards: Card[], now = new Date()) => cards.filter(c => isDue(c, now)).sort((a, b) => (a.source === b.source ? a.due.localeCompare(b.due) : a.source === 'mistake' ? -1 : 1))

// Mistake Journal: ringkasan setiap soal yang pernah gagal.
export type Mistake = { id: string; track: string; fails: number; last: string; err?: string; msg?: string; fixed: boolean }
export function mistakes(attempts: Attempt[]): Mistake[] {
  const m = new Map<string, Mistake>()
  for (const a of [...attempts].filter(a => a.kind === 'exercise' || a.kind === 'review').sort((x, y) => x.date.localeCompare(y.date))) {
    const cur = m.get(a.node)
    if (a.kind === 'review') { if (cur && a.passed) cur.fixed = true; continue }
    if (!a.passed) m.set(a.node, { id: a.node, track: a.track, fails: (cur?.fails ?? 0) + 1, last: a.date, err: a.meta?.err, msg: a.meta?.msg, fixed: false })
    else if (cur) cur.fixed = true
  }
  return [...m.values()].sort((a, b) => b.last.localeCompare(a.last))
}
