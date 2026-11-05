// Logika murni Hashira Trial (teruji): syarat buka, skor subtask gaya IOI, medali, topic tracker, readiness meter.
import { nodesOf, rankOf } from '../data/curriculum'
import type { Progress } from '../db'

export type Test = { input?: string; gen?: string; seed?: number; expected: string }
export type Subtask = { points: number; desc: string; tests: Test[] }
export type Problem = {
  id: string; title: string; stage: string; topics: string[]; tl: number; statement: string; input: string; output: string; constraints?: string
  samples: { input: string; expected: string }[]; subtasks: Subtask[]; solution: string; python?: string
  editorial: { hint: string; idea: string; solution: string; complexity: string }; naive?: { score: number }
}
export type ArchiveRef = { id: string; stage: string; source: string; year: number; title: string; link: string; summary: string; tags?: string[]; tl_ms?: number; ml_kb?: number }
export type Objective = { id: string; stage: string; topic: string; prompt: string; code?: string; options: string[]; explain: string }
export type Contest = {
  id: string; name: string; stage: string; kind: 'objective' | 'programming'; minutes: number; medals: Record<'emas' | 'perak' | 'perunggu', number>; real?: string; note?: string
  problems?: string[]; count?: number; topics?: string[]; scoring?: { right: number; wrong: number; blank: number }
}
export type Modules = {
  stages: { id: string; name: string; level: string; desc: string }[]
  topics: { id: string; name: string }[]
  cp_lessons: { title: string; text: string; code?: string }[]
  stei: { roadmap: { title: string; text: string }[]; disclaimer: string; readiness: { weights: { objektif: number; problem: number; diskrit: number } } }
}
export type Olymp = { problems: Problem[]; archive: { problems: ArchiveRef[]; objective: ArchiveRef[] }; objective: Objective[]; contests: Contest[]; modules: Modules }

// ---- Syarat buka: rank Kinoe (rank tertinggi) di Python ATAU C++, dan semua bab Fondasi DSA lulus.
export function trialGate(progress: Progress[]) {
  const passed = (t: string) => progress.find(p => p.track === t)?.passed ?? []
  const rank = (t: string) => rankOf(nodesOf(t), passed(t))
  const fondasi = nodesOf('dsa').filter(n => n.level === 'Fondasi' && !n.boss)
  const dsaDone = fondasi.filter(n => passed('dsa').includes(n.id)).length
  const py = rank('python'), cpp = rank('cpp')
  return { open: (py === 9 || cpp === 9) && dsaDone === fondasi.length, python: py, cpp, dsaDone, dsaTotal: fondasi.length }
}

// ---- Skor gaya IOI: per subtask, ambil yang terbaik di antara semua submisi.
export const subtaskScore = (sub: Subtask, verdicts: boolean[]) => (verdicts.length === sub.tests.length && verdicts.every(Boolean) ? sub.points : 0)
export function bestScore(earned: number[][]) {
  if (!earned.length) return { total: 0, per: [] as number[] }
  const per = earned[0].map((_, i) => Math.max(...earned.map(e => e[i] ?? 0)))
  return { total: per.reduce((a, b) => a + b, 0), per }
}

export function medal(c: Contest, score: number, max: number) {
  const pct = max ? (100 * score) / max : 0
  return pct >= c.medals.emas ? 'emas' : pct >= c.medals.perak ? 'perak' : pct >= c.medals.perunggu ? 'perunggu' : null
}

// Skor kontes objektif: benar/salah/kosong sesuai aturan kontes.
export function objectiveScore(c: Contest, qs: Objective[], answers: Record<string, string | undefined>) {
  const s = c.scoring ?? { right: 1, wrong: 0, blank: 0 }
  let score = 0, right = 0, wrong = 0
  for (const q of qs) {
    const a = answers[q.id]
    if (a === undefined) score += s.blank
    else if (a === q.options[0]) { score += s.right; right++ }
    else { score += s.wrong; wrong++ }
  }
  return { score, right, wrong, blank: qs.length - right - wrong, max: qs.length * s.right }
}

// Pilihan soal objektif kontes: deterministik dari seed (kontes yang sama + seed sama = soal sama).
export function pickObjective(all: Objective[], c: Contest, seed: number) {
  const pool = all.filter(o => o.stage === c.stage && (!c.topics || c.topics.includes(o.topic)))
  let s = seed >>> 0 || 1
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
  const p = [...pool]
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  return p.slice(0, c.count ?? 10)
}

// ---- Topic Tracker: topik dikuasai bila semua soal orisinalnya mendapat 100.
export function topicStatus(o: Olymp, best: Map<string, number>, accepted: Set<string>) {
  return o.modules.topics.map(t => {
    const probs = o.problems.filter(p => p.topics.includes(t.id))
    const full = probs.filter(p => (best.get(p.id) ?? 0) === 100).length
    const next = probs.find(p => (best.get(p.id) ?? 0) < 100)
    return { ...t, total: probs.length, full, mastered: probs.length > 0 && full === probs.length, next: next?.id, accepted: accepted.size }
  }).filter(t => t.total > 0)
}

// ---- Readiness Meter (Menuju CS/STEI ITB): rata-rata berbobot tiga komponen, masing-masing 0..100.
export function readiness(w: { objektif: number; problem: number; diskrit: number }, parts: { objektif: number; problem: number; diskrit: number }) {
  const v = w.objektif * parts.objektif + w.problem * parts.problem + w.diskrit * parts.diskrit
  const total = Math.round(v / (w.objektif + w.problem + w.diskrit))
  return { total, label: total >= 80 ? 'Siap bertarung' : total >= 55 ? 'Hampir siap' : total >= 30 ? 'Sedang berlatih' : 'Baru mulai' }
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
