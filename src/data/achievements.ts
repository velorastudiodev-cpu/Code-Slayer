// Pencapaian (murni, teruji): diturunkan dari data yang ada, tidak disimpan, jadi tidak bisa hilang atau dobel.
// Tier 4 = Demon Slayer Mark (pencapaian langka).
import type { Attempt, Progress, Spend } from '../db'
import { TYPE_LABEL, type ExerciseType } from './exercise-types'
import { CHARACTERS } from '../characters/roster'
import { LEVELS } from './curriculum'
import { dayKey, missionStatus } from './game'
import { ITEMS, activityDays, bondLevel, bondPoints, freezeDays, owned, pulls, slayerLevel, streakState, totalXp } from './economy'

export type Tier = 1 | 2 | 3 | 4
export type Achievement = { id: string; name: string; desc: string; tier: Tier; target: number; value: (s: Stats) => number }
export const TIER_KOBAN: Record<Tier, number> = { 1: 20, 2: 50, 3: 100, 4: 300 }
export const TIER_NAME: Record<Tier, string> = { 1: 'Perunggu', 2: 'Perak', 3: 'Emas', 4: 'Demon Slayer Mark' }

export type Stats = ReturnType<typeof stats>

export function stats(attempts: Attempt[], spends: Spend[], progress: Progress[]) {
  const ex = attempts.filter(a => a.kind === 'exercise').sort((a, b) => a.date.localeCompare(b.date))
  const solved = new Map<string, Attempt>() // node → attempt lulus pertama
  for (const a of ex) if (a.passed && !solved.has(a.node)) solved.set(a.node, a)
  const count = (f: (a: Attempt) => boolean) => [...solved.values()].filter(f).length
  const exams = attempts.filter(a => a.kind === 'exam' && a.passed)
  const examKeys = (upper: boolean) => new Set(exams.filter(a => a.node.endsWith('-boss') === upper).map(a => `${a.track}:${a.node}`)).size
  const best = (k: Attempt['kind']) => Math.max(0, ...attempts.filter(a => a.kind === k).map(a => a.correct))
  // Gagal karena error tertentu, lalu kemudian lulus di soal yang sama.
  const survived = (err: string) => [...solved.entries()].filter(([node, win]) => ex.some(a => a.node === node && a.meta?.err === err && a.date <= win.date)).length
  const firstTry = [...solved.entries()].filter(([node, win]) => ex.find(a => a.node === node) === win).length
  const days = activityDays(attempts)
  const streak = streakState(days, freezeDays(spends))
  const hour = (a: Attempt) => new Date(a.date).getHours()
  const weekendWeeks = new Set(days.filter(d => new Date(d + 'T12:00').getDay() === 6).filter(d => {
    const n = new Date(d + 'T12:00'); n.setDate(n.getDate() + 1); return days.includes(dayKey(n))
  }))
  const bond = CHARACTERS.map(c => bondLevel(bondPoints(c.id, attempts, spends)))
  const have = owned(spends)
  const passedNode = (track: string, node: string) => progress.find(p => p.track === track)?.passed.includes(node) ?? false
  return {
    solved: solved.size,
    byType: (t: string) => count(a => a.meta?.type === t),
    byTrack: (t: string) => count(a => a.track === t),
    started: (t: string) => (progress.some(p => p.track === t) ? 1 : 0),
    levelDone: (t: string, l: string) => (passedNode(t, `${l}-boss`) ? 1 : 0),
    examPassed: (t: string, node: string) => (exams.some(a => a.track === t && a.node === node) ? 1 : 0), // harus lewat ujian, bukan placement
    lower: examKeys(false),
    upper: examKeys(true),
    bestStreak: streak.best,
    frozen: streak.frozen.length,
    kataDays: new Set(attempts.filter(a => a.kind === 'kata' && a.passed).map(a => dayKey(new Date(a.date)))).size,
    castle: best('castle'),
    timeattack: best('timeattack'),
    bugrush: best('bugrush'),
    raidHit: attempts.some(a => a.kind === 'raid' && a.correct > 0) ? 1 : 0,
    raidDefeated: new Set(attempts.filter(a => a.kind === 'raid' && a.node.endsWith(':tumbang')).map(a => a.node)).size,
    missionDays: days.filter(d => missionStatus(d, attempts).every(m => m.done)).length,
    pulls: pulls(spends).length,
    legend: pulls(spends).some(p => p.rarity === 3) ? 1 : 0,
    items: [...have].filter(id => ITEMS.some(i => i.id === id)).length,
    allChars: CHARACTERS.every(c => have.has(`char:${c.id}`)) ? 1 : 0,
    bondMax: Math.max(0, ...bond),
    bonded: bond.filter(b => b >= 1).length,
    segfault: survived('segfault'),
    timeout: survived('timeout'),
    syntax: survived('syntax'),
    firstTry,
    noHint: count(a => (a.meta?.hints ?? 0) === 0 && (a.meta?.xp ?? 10) >= 20),
    night: attempts.some(a => a.kind === 'exercise' && a.passed && hour(a) < 4) ? 1 : 0,
    early: attempts.some(a => a.kind === 'exercise' && a.passed && hour(a) >= 4 && hour(a) < 7) ? 1 : 0,
    weekend: weekendWeeks.size,
    languages: ['python', 'js', 'c', 'cpp', 'java', 'sql', 'go', 'rust', 'csharp', 'mobile'].filter(t => [...solved.values()].some(a => a.track === t)).length,
    placement: attempts.some(a => a.kind === 'placement') ? 1 : 0,
    level: slayerLevel(totalXp(attempts)).level,
    projectsDone: new Set(attempts.filter(a => a.kind === 'project' && a.passed && a.meta?.type === 'final').map(a => a.node.split(':')[0])).size,
    stagesDone: new Set(attempts.filter(a => a.kind === 'project' && a.passed).map(a => a.node)).size,
    reviews: attempts.filter(a => a.kind === 'review').length,
    ctf: new Set(attempts.filter(a => a.kind === 'ctf' && a.passed).map(a => a.node)).size,
    ctfPoints: [...new Map(attempts.filter(a => a.kind === 'ctf' && a.passed).map(a => [a.node, a.total])).values()].reduce((s, x) => s + x, 0),
    olympFull: new Set(attempts.filter(a => a.kind === 'olymp' && a.passed).map(a => a.node)).size,
    arsip: new Set(attempts.filter(a => a.kind === 'arsip' && a.passed).map(a => a.node)).size,
    medals: attempts.filter(a => a.kind === 'contest' && a.passed).length,
    golds: attempts.filter(a => a.kind === 'contest' && a.passed && a.meta?.type === 'emas').length,
    rehab: new Set(attempts.filter(a => a.kind === 'review' && a.passed && a.meta?.type === 'mistake').map(a => a.node)).size,
  }
}

// ---------------------------------------------------------------- Daftar pencapaian
const A: Achievement[] = []
const add = (id: string, name: string, desc: string, tier: Tier, target: number, value: (s: Stats) => number) => A.push({ id, name, desc, tier, target, value })
const tierOf = (i: number, n: number): Tier => (i < n / 3 ? 1 : i < (2 * n) / 3 ? 2 : 3)

// 1. Total latihan yang ditebas.
const SOLVED: [number, string][] = [[1, 'First Blood'], [5, 'Pedang Pertama'], [10, 'Mizunoto Sejati'], [25, 'Pemburu Muda'], [50, 'Ahli Tebas'], [100, 'Seratus Iblis'], [200, 'Dua Ratus Tebasan'], [300, 'Penjaga Desa'], [450, 'Pedang Tak Tertandingi']]
SOLVED.forEach(([n, name], i) => add(`solved-${n}`, name, n === 1 ? 'Test pertamamu lolos semua.' : `Tebas ${n} latihan berbeda.`, tierOf(i, SOLVED.length), n, s => s.solved))

// 2. Per jenis latihan.
for (const [t, label] of Object.entries(TYPE_LABEL) as [ExerciseType, string][])
  ([[1, 'Kenalan'], [5, 'Terlatih'], [10, 'Ahli']] as const).forEach(([n, rank], i) => add(`type-${t}-${n}`, `${label}: ${rank}`, `Lulus ${n} soal ${label}.`, (i + 1) as Tier, n, s => s.byType(t)))

// 3. Per track.
const TRACK_NAME: Record<string, string> = { python: 'Python', js: 'JavaScript', dsa: 'DSA', c: 'C', cpp: 'C++', java: 'Java', sql: 'SQL' }
for (const t of ['python', 'js', 'dsa']) {
  const n = TRACK_NAME[t]
  add(`track-${t}-start`, `Langkah Pertama ${n}`, `Mulai track ${n}.`, 1, 1, s => s.started(t))
  add(`track-${t}-10`, `Pernapasan ${n}`, `Lulus 10 soal ${n}.`, 1, 10, s => s.byTrack(t))
  add(`track-${t}-30`, `Bentuk Lanjutan ${n}`, `Lulus 30 soal ${n}.`, 2, 30, s => s.byTrack(t))
  LEVELS.forEach((l, i) => add(`track-${t}-${l}`, `${n}: ${l} Tuntas`, `Tebas Upper Moon level ${l} di ${n}.`, ([2, 2, 3, 4] as Tier[])[i], 1, s => s.levelDone(t, l[0].toLowerCase())))
}
for (const t of ['c', 'cpp', 'java']) {
  const n = TRACK_NAME[t]
  add(`track-${t}-start`, `Langkah Pertama ${n}`, `Mulai track ${n}.`, 1, 1, s => s.started(t))
  add(`track-${t}-10`, `Pernapasan ${n}`, `Lulus 10 soal ${n}.`, 2, 10, s => s.byTrack(t))
  add(`track-${t}-Fondasi`, `${n}: Fondasi Tuntas`, `Tebas Upper Moon level Fondasi di ${n}.`, 3, 1, s => s.levelDone(t, 'f'))
}
add('track-sql-1', 'Ramuan Tamayo', 'Lulus soal SQL pertamamu.', 1, 1, s => s.byTrack('sql'))

// 4. Ujian.
;[[1, 'Lower Moon Pertama', 1], [5, 'Pemburu Lower Moon', 1], [15, 'Pembasmi Dua Belas Kizuki', 2], [30, 'Lower Moon Tak Bersisa', 3]].forEach(([n, name, t]) =>
  add(`lower-${n}`, name as string, `Lulus ${n} Lower Moon Exam.`, t as Tier, n as number, s => s.lower))
;[[1, 'Upper Moon Pertama', 2], [3, 'Pemburu Upper Moon', 3], [6, 'Fajar Menyingsing', 4]].forEach(([n, name, t]) =>
  add(`upper-${n}`, name as string, `Lulus ${n} Upper Moon Exam.`, t as Tier, n as number, s => s.upper))

// 5. Streak.
;[[3, 'Tiga Hari Berturut', 1], [7, 'Seminggu Penuh', 2], [14, 'Dua Minggu Tanpa Henti', 3], [30, 'Tanda Sebulan', 4], [100, 'Seratus Fajar', 4]].forEach(([n, name, t]) =>
  add(`streak-${n}`, name as string, `Streak ${n} hari.`, t as Tier, n as number, s => s.bestStreak))
add('freeze-1', 'Selamat oleh Es', 'Streak Freeze menyelamatkan streak-mu.', 1, 1, s => s.frozen)
;[[1, 1], [7, 2], [30, 3]].forEach(([n, t]) => add(`kata-${n}`, n === 1 ? 'Kata Pertama' : `${n} Hari Kata`, `Selesaikan Daily Kata di ${n} hari berbeda.`, t as Tier, n, s => s.kataDays))

// 6. Mode game.
;[[5, 1], [10, 2], [20, 3], [30, 4]].forEach(([n, t]) => add(`castle-${n}`, n === 30 ? 'Penakluk Infinity Castle' : `Lantai ${n}`, `Capai lantai ${n} di Infinity Castle.`, t as Tier, n, s => s.castle))
;[[10, 1], [20, 2], [30, 3]].forEach(([n, t]) => add(`time-${n}`, `Kilat ${n}`, `Jawab ${n} benar dalam satu Time Attack.`, t as Tier, n, s => s.timeattack))
;[[10, 1], [20, 2], [30, 3]].forEach(([n, t]) => add(`rush-${n}`, `Pemburu Bug ${n}`, `Skor ${n} dalam satu Bug Rush.`, t as Tier, n, s => s.bugrush))
add('raid-hit', 'Luka Pertama', 'Beri damage pada Upper Moon di Boss Raid.', 1, 1, s => s.raidHit)
add('raid-1', 'Upper Moon Tumbang', 'Kalahkan boss Raid mingguan.', 3, 1, s => s.raidDefeated)
add('raid-4', 'Empat Bulan Purnama', 'Kalahkan boss Raid di 4 minggu berbeda.', 4, 4, s => s.raidDefeated)
;[[1, 1], [7, 2], [30, 3]].forEach(([n, t]) => add(`mission-${n}`, n === 1 ? 'Gagak Bangga' : `Gagak Setia ${n}`, `Tuntaskan semua misi harian di ${n} hari.`, t as Tier, n, s => s.missionDays))

// 7. Gacha, koleksi, Bond.
;[[1, 'Tarikan Pertama', 1], [10, 'Sepuluh Undian', 2], [50, 'Kolektor', 3]].forEach(([n, name, t]) => add(`pull-${n}`, name as string, `Tarik gacha ${n} kali.`, t as Tier, n as number, s => s.pulls))
add('legend', 'Cahaya Bintang Tiga', 'Dapatkan item ★★★ dari gacha.', 2, 1, s => s.legend)
add('items-10', 'Lemari Kosmetik', 'Miliki 10 item gacha.', 2, 10, s => s.items)
add('items-25', 'Gudang Desa Penempa', 'Miliki 25 item gacha.', 3, 25, s => s.items)
add('all-chars', 'Seluruh Korps', 'Kumpulkan semua karakter.', 4, 1, s => s.allChars)
;[[1, 1], [3, 2], [5, 3]].forEach(([n, t]) => add(`bond-${n}`, n === 5 ? 'Ikatan Abadi' : `Ikatan Level ${n}`, `Bond satu karakter mencapai level ${n}.`, t as Tier, n, s => s.bondMax))
add('bonded-3', 'Teman Seperjuangan', 'Bond level 1 dengan 3 karakter.', 2, 3, s => s.bonded)
add('bonded-10', 'Sahabat Korps', 'Bond level 1 dengan 10 karakter.', 3, 10, s => s.bonded)

// 8. Spesial.
add('segfault', 'Segfault Survivor', 'Kena segmentation fault, lalu tetap menebas soalnya.', 2, 1, s => s.segfault)
add('timeout', 'Lolos dari Akaza', 'Kena infinite loop (timeout), lalu tetap menebas soalnya.', 2, 1, s => s.timeout)
add('syntax', 'Typo Slayer', 'Kena syntax error, lalu tetap menebas soalnya.', 1, 1, s => s.syntax)
add('recursion', 'Recursion Master', 'Lulus Lower Moon bab Rekursi di DSA.', 3, 1, s => s.examPassed('dsa', 'f4'))
add('graph', 'Penjelajah Jaring Rui', 'Lulus Lower Moon bab Graph, BFS & DFS di DSA.', 3, 1, s => s.examPassed('dsa', 'l1'))
add('dp', 'Pembelah Kokushibo', 'Lulus Lower Moon bab Dynamic Programming di DSA.', 4, 1, s => s.examPassed('dsa', 'l3'))
;[[10, 1], [50, 3], [100, 4]].forEach(([n, t]) => add(`firsttry-${n}`, n === 100 ? 'Tebasan Sempurna' : `Satu Tebasan ${n}`, `Lulus ${n} soal pada percobaan pertama.`, t as Tier, n, s => s.firstTry))
add('nohint-25', 'Tanpa Petunjuk', 'Lulus 25 soal ★2+ tanpa membuka hint.', 3, 25, s => s.noHint)
add('night', 'Waktu Iblis Keluar', 'Menebas soal antara jam 00.00 dan 04.00.', 1, 1, s => s.night)
add('early', 'Latihan Fajar', 'Menebas soal antara jam 04.00 dan 07.00.', 1, 1, s => s.early)
add('weekend', 'Pejuang Akhir Pekan', 'Belajar di hari Sabtu dan Minggu yang sama.', 1, 1, s => s.weekend)
add('poly-3', 'Poliglot', 'Lulus soal di 3 bahasa berbeda.', 2, 3, s => s.languages)
add('poly-5', 'Semua Pernapasan', 'Lulus soal di 5 bahasa berbeda.', 3, 5, s => s.languages)
add('placement', 'Lolos Final Selection', 'Selesaikan placement test sebuah track.', 1, 1, s => s.placement)
;[[5, 1], [10, 2], [20, 3]].forEach(([n, t]) => add(`level-${n}`, `Slayer Level ${n}`, `Capai Slayer Level ${n}.`, t as Tier, n, s => s.level))

// 9. Swordsmith Village & Butterfly Mansion (M10).
add('stage-1', 'Palu Pertama', 'Selesaikan satu tahap project di Swordsmith Village.', 1, 1, s => s.stagesDone)
add('stage-10', 'Penempa Tekun', 'Selesaikan 10 tahap project.', 2, 10, s => s.stagesDone)
add('project-1', 'Pedang Pertama Ditempa', 'Tuntaskan satu project Swordsmith Village.', 2, 1, s => s.projectsDone)
add('project-4', 'Murid Haganezuka', 'Tuntaskan 4 project.', 3, 4, s => s.projectsDone)
add('project-8', 'Ahli Desa Penempa', 'Tuntaskan semua 8 project.', 4, 8, s => s.projectsDone)
add('review-1', 'Kunjungan ke Mansion', 'Selesaikan review pertama di Butterfly Mansion.', 1, 1, s => s.reviews)
add('review-50', 'Pasien Rajin', 'Selesaikan 50 review.', 2, 50, s => s.reviews)
add('review-200', 'Ingatan Baja', 'Selesaikan 200 review.', 3, 200, s => s.reviews)
// 11. Cyber & CTF Arena (M8).
add('ctf-1', 'Flag Pertama', 'Validasi flag CTF pertamamu.', 1, 1, s => s.ctf)
add('ctf-10', 'Pemburu Flag', 'Validasi 10 flag CTF.', 2, 10, s => s.ctf)
add('ctf-1000', 'Racun Kupu-kupu', 'Kumpulkan 1.000 poin CTF.', 3, 1000, s => s.ctfPoints)
add('ctf-all', 'Hashira Serangga', 'Validasi semua flag di CTF Arena.', 4, 36, s => s.ctf)
// 10. Hashira Trial (M11).
add('olymp-1', 'Lolos Seleksi Hashira', 'Raih skor 100 pada satu soal Hashira Trial.', 2, 1, s => s.olympFull)
add('olymp-10', 'Pilar Muda', 'Raih skor 100 pada 10 soal Hashira Trial.', 3, 10, s => s.olympFull)
add('olymp-30', 'Pilar Sejati', 'Raih skor 100 pada 30 soal Hashira Trial.', 4, 30, s => s.olympFull)
add('arsip-10', 'Penjelajah Arsip TOKI', 'Tandai 10 soal asli (OSN/IOI) Accepted di TLX.', 2, 10, s => s.arsip)
add('medal-1', 'Medali Pertama', 'Raih medali di virtual contest.', 2, 1, s => s.medals)
add('gold-1', 'Emas di Benteng', 'Raih medali emas di virtual contest.', 3, 1, s => s.golds)
add('rehab-10', 'Pulih Sepenuhnya', 'Tuntaskan 10 Rehab Quest (soal yang dulu salah).', 2, 10, s => s.rehab)

export const ACHIEVEMENTS = A

export function evaluate(s: Stats) {
  return ACHIEVEMENTS.map(a => { const v = a.value(s); return { ...a, current: Math.min(v, a.target), done: v >= a.target } })
}
export const achievementKoban = (done: { tier: Tier; done: boolean }[]) => done.filter(a => a.done).reduce((t, a) => t + TIER_KOBAN[a.tier], 0)
