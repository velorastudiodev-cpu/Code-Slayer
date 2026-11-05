// Build konten Hashira Trial (jalur olimpiade): content/olymp → src/generated/meta/olymp.json
// Setiap soal orisinal divalidasi dengan menjalankan solusi asli:
// - solusi referensi (C++) lolos semua tes dalam batas waktu → menghasilkan expected,
// - solusi Python (bila ada) memberi output sama dan cukup cepat,
// - solusi naive mendapat TEPAT skor yang dinyatakan (bukti subtask membedakan solusi lambat/salah).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { parse } from 'yaml'
import { norm } from '../src/run/exec.ts'
import { runCompiled } from '../server/compiled.ts'
import { genInput, type RawTest } from '../src/olymp/gen.ts'

type Lang = 'cpp' | 'python'
type Subtask = { points: number; desc: string; tests: RawTest[] }
type ProblemSrc = {
  id: string; title: string; stage: string; topics: string[]; tl?: number; statement: string; input: string; output: string; constraints?: string
  samples: string[]; subtasks: Subtask[]; solution: string; python?: string; naive?: { score: number; code: string; lang?: Lang }
  editorial: { hint: string; idea: string; solution: string; complexity: string }
}
export const STAGES = ['kabupaten', 'provinsi', 'nasional', 'pelatnas', 'internasional', 'cp'] as const
const DIR = 'content/olymp'
const PY_LIMIT = 1500 // Python (CPython) harus ≤ 1,5 dtk per tes; di Pyodide batasnya 4 dtk.

async function runLang(lang: Lang, code: string, inputs: string[], tl: number) {
  if (lang === 'cpp') return runCompiled('cpp', code, inputs, { timeoutMs: tl })
  return inputs.map(input => {
    const t0 = Date.now()
    const r = spawnSync('python3', ['-c', code], { input, encoding: 'utf8', timeout: tl, maxBuffer: 64 << 20 })
    const ms = Date.now() - t0
    if (r.error || r.status === null) return { stdout: '', stderr: 'Waktu habis', ok: false, timeout: true, ms }
    return { stdout: r.stdout, stderr: r.stderr, ok: r.status === 0, ms }
  })
}

export function olympHash() {
  const h = createHash('sha1')
  const walk = (d: string): void => { for (const f of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) f.isDirectory() ? walk(`${d}/${f.name}`) : h.update(f.name).update(readFileSync(`${d}/${f.name}`)) }
  walk(DIR)
  h.update(readFileSync('src/olymp/gen.ts'))
  return h.digest('hex').slice(0, 12)
}

async function buildProblem(p: ProblemSrc, file: string) {
  const fail = (msg: string): never => { throw new Error(`${file} › ${p.id}: ${msg}`) }
  if (!STAGES.includes(p.stage as never)) fail(`stage ${p.stage} tidak dikenal`)
  if (!p.editorial?.hint || !p.editorial.idea || !p.editorial.solution || !p.editorial.complexity) fail('editorial hint/idea/solution/complexity wajib')
  const total = p.subtasks.reduce((s, t) => s + t.points, 0)
  if (total !== 100) fail(`total poin subtask ${total}, harus 100`)
  const tl = p.tl ?? 1000
  const groups = [p.samples, ...p.subtasks.map(s => s.tests)]
  const inputs = groups.flat().map(genInput)
  const ref = await runLang('cpp', p.solution, inputs, tl)
  ref.forEach((r, i) => {
    if (!r.ok) fail(`solusi referensi gagal/TLE pada tes ${i + 1}: ${r.stderr.slice(0, 300)}`)
    if (!norm(r.stdout)) fail(`solusi referensi tidak mencetak apa-apa pada tes ${i + 1}`)
    if (r.stdout.length > 4096) fail(`output tes ${i + 1} terlalu besar (${r.stdout.length} B): rancang output kecil`)
  })
  const expected = ref.map(r => norm(r.stdout) + '\n')
  // skor = jumlah poin subtask yang semua tesnya lolos
  const score = (runs: { ok: boolean; stdout: string }[]) => {
    let k = p.samples.length, s = 0
    for (const st of p.subtasks) { const ok = st.tests.every((_, j) => runs[k + j].ok && norm(runs[k + j].stdout) === norm(expected[k + j])); if (ok) s += st.points; k += st.tests.length }
    return s
  }
  if (p.python) {
    const py = await runLang('python', p.python, inputs, PY_LIMIT)
    py.forEach((r, i) => { if (!r.ok || norm(r.stdout) !== norm(expected[i])) fail(`solusi Python beda/lambat pada tes ${i + 1} (${(r as { ms?: number }).ms} ms): ${r.stderr.slice(0, 200)}`) })
  }
  if (p.naive) {
    const nv = await runLang(p.naive.lang ?? 'cpp', p.naive.code, inputs, tl)
    const s = score(nv)
    if (s !== p.naive.score) fail(`solusi naive mendapat ${s}, bukan ${p.naive.score}`)
    const samplesOk = p.samples.every((_, i) => nv[i].ok && norm(nv[i].stdout) === norm(expected[i]))
    if (!samplesOk) fail('solusi naive harus lolos contoh (agar bedanya hanya di subtask)')
  }
  let k = 0
  const take = (ts: RawTest[]) => ts.map(t => ({ ...(typeof t === 'string' ? { input: t } : { gen: t.gen, seed: t.seed }), expected: expected[k++] }))
  const samples = take(p.samples).map(t => ({ input: (t as { input: string }).input, expected: t.expected }))
  return {
    id: p.id, title: p.title, stage: p.stage, topics: p.topics, tl, statement: p.statement, input: p.input, output: p.output, constraints: p.constraints,
    samples, subtasks: p.subtasks.map(s => ({ points: s.points, desc: s.desc, tests: take(s.tests) })),
    solution: p.solution, ...(p.python ? { python: p.python } : {}), editorial: p.editorial,
    ...(p.naive ? { naive: { score: p.naive.score } } : {}),
  }
}

export async function buildOlymp(force = false) {
  // Cache per soal: soal yang sumbernya tidak berubah tidak dijalankan ulang (kecuali --force).
  const OUT = 'src/generated/meta/olymp.json'
  const prev = new Map<string, Awaited<ReturnType<typeof buildProblem>> & { srcHash?: string }>(!force && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).problems.map((p: { id: string }) => [p.id, p]) : [])
  const genSrc = readFileSync('src/olymp/gen.ts', 'utf8')
  const problems = []
  const ids = new Set<string>()
  for (const file of readdirSync(`${DIR}/problems`).filter(f => f.endsWith('.yaml')).sort()) {
    for (const p of parse(readFileSync(`${DIR}/problems/${file}`, 'utf8')) as ProblemSrc[]) {
      if (ids.has(p.id)) throw new Error(`id ganda ${p.id}`)
      ids.add(p.id)
      const srcHash = createHash('sha1').update(JSON.stringify(p)).update(genSrc).digest('hex').slice(0, 12)
      const old = prev.get(p.id)
      if (old?.srcHash === srcHash) { problems.push(old); continue }
      const t0 = Date.now()
      problems.push({ ...(await buildProblem(p, file)), srcHash })
      console.log(`  ${p.id} ✓ (${Date.now() - t0} ms)`)
    }
  }
  const archive = parse(readFileSync(`${DIR}/archive.yaml`, 'utf8'))
  for (const a of archive.problems) if (!/^https:\/\/tlx\.toki\.id\/problems\/[\w-]+\/[\w-]+$/.test(a.link) || !a.summary || !a.source) throw new Error(`archive ${a.id}: link/summary/source wajib`)
  const extra = (f: string) => (existsSync(`${DIR}/${f}`) ? parse(readFileSync(`${DIR}/${f}`, 'utf8')) : undefined)
  const objective: { id: string; stage: string; topic: string; options: string[]; explain: string }[] = extra('objective.yaml') ?? []
  for (const o of objective) if (o.options?.length !== 4 || new Set(o.options).size !== 4 || !o.explain) throw new Error(`objektif ${o.id}: butuh 4 opsi berbeda + pembahasan`)
  const contests: { id: string; kind: string; problems?: string[]; count?: number; topics?: string[]; stage: string; minutes: number; medals: Record<string, number> }[] = extra('contests.yaml') ?? []
  for (const c of contests) {
    if (!(c.minutes > 0) || !c.medals) throw new Error(`kontes ${c.id}: minutes & medals wajib`)
    if (c.kind === 'programming') for (const id of c.problems ?? []) if (!ids.has(id)) throw new Error(`kontes ${c.id}: soal ${id} tidak ada`)
    if (c.kind === 'objective' && objective.filter(o => o.stage === c.stage && (!c.topics || c.topics.includes(o.topic))).length < (c.count ?? 0)) throw new Error(`kontes ${c.id}: soal objektif kurang`)
  }
  const modules = extra('modules.yaml') ?? {}
  const topicIds = new Set((modules.topics ?? []).map((t: { id: string }) => t.id))
  for (const p of problems) for (const t of p.topics) if (!topicIds.has(t) && !['hash-map', 'counting', 'tipe-data', 'sieve', 'priority-queue', 'knapsack', 'bfs', 'modular', 'topological-sort', 'convex-hull', 'binary-lifting', 'pohon', 'kmp', 'hashing', 'offline-query', 'rerooting', 'matriks', 'eksponensiasi', 'matematika', 'fast-io', 'map', 'set'].includes(t)) throw new Error(`soal ${p.id}: topik ${t} tidak ada di modules.yaml`)
  return { hash: olympHash(), problems, archive, objective, contests, modules }
}

if (process.argv[1]?.endsWith('build-olymp.ts')) {
  const OUT = 'src/generated/meta/olymp.json'
  if (!process.argv.includes('--force') && existsSync(OUT) && JSON.parse(readFileSync(OUT, 'utf8')).hash === olympHash()) console.log('olymp: tidak berubah')
  // (soal yang berubah saja yang dijalankan ulang)
  else {
    const t0 = Date.now()
    const data = await buildOlymp(process.argv.includes('--force'))
    mkdirSync('src/generated/meta', { recursive: true })
    writeFileSync(OUT, JSON.stringify(data) + '\n')
    console.log(`olymp: ${data.problems.length} soal orisinal, ${data.archive.problems.length} soal arsip, ${data.objective.length} soal objektif, ${data.contests.length} kontes (${Date.now() - t0} ms)`)
  }
}
