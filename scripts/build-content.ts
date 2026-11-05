// Build konten: content/<track>/<bab>.yaml → src/generated/<track>.json
// Output yang diharapkan TIDAK ditulis tangan: dihitung dengan menjalankan solusi referensi
// (Python asli, eksekutor JS yang sama dengan worker, sql.js). Jalankan: npm run content
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import initSqlJs from 'sql.js'
import { parse } from 'yaml'
import { createHash } from 'node:crypto'
import { execSql, norm, type Lang, type Run } from '../src/run/exec.ts'
import { nodesOf } from '../src/data/curriculum.ts'
import { COMPILED, runCompiled, type CLang } from '../server/compiled.ts'
import { COMPLEXITIES, assemble, ruleOk, type Exercise } from '../src/data/exercise-types.ts'
import { Shell } from '../src/term/shell.ts'
import { runChecks, type Check } from '../src/run/htmlcheck.ts'
import { JSDOM } from 'jsdom'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Rule = { text: string; max_lines?: number; forbid?: string; require?: string }
type Src = {
  id: string; type: Exercise['type']; title: string; difficulty: number; story?: string; prompt: string
  lang?: Lang; starter?: string; code?: string; bug_line?: number; tests?: (string | { gen: string })[]; samples?: number
  hints?: string[] | string; solution?: string; concepts?: string[]
  after?: string // dijalankan setelah kode user (mis. SELECT pemeriksa setelah UPDATE)
  pre?: string; quiet?: boolean // bash: persiapan tersembunyi; output kode user dibuang
  checks?: Check[] // html: syarat yang diperiksa (jadi input tes)
  sim_only?: boolean // bash: jangan bandingkan dengan bash asli (mis. soal permission: build berjalan sebagai root)
  // jenis M5
  line?: number; vars?: string[]; rules?: Rule[]; answer?: string; explain?: string
  from_lang?: Lang; from_code?: string; issues?: { line: number; text: string }[]; options?: string[]
  accept?: string[] // answer
  lab?: string // lab: id lab CTF
}
type ChapterSrc = { lang?: Lang; setup?: string; lesson: { text: string; code?: string }[]; exercises: Src[] }

const TYPES: Exercise['type'][] = ['write', 'predict', 'bughunt', 'parsons', 'fill', 'trace', 'refactor', 'complexity', 'typing', 'translate', 'review', 'readerror', 'quiz', 'answer', 'lab']
const LAB_IDS = new Set((parse(readFileSync('content/ctf/labs.yaml', 'utf8')) as { id: string }[]).map(l => l.id))
const DEFAULT_LANG: Record<string, Lang> = { web: 'html', git: 'bash', bash: 'bash', network: 'python', python: 'python', js: 'javascript', sql: 'sql', c: 'c', cpp: 'cpp', java: 'java', dsa: 'python', go: 'go', rust: 'rust', csharp: 'csharp', mobile: 'kotlin' }
const SQL = await initSqlJs()

// Python & JS dijalankan di proses terpisah dengan batas waktu (starter yang sengaja lambat tidak boleh membekukan build).
const TIMEOUT = 6000
function run(lang: Lang, code: string, input: string): Run {
  if (lang === 'sql') return execSql(SQL, code, input)
  const r = lang === 'python'
    ? spawnSync('python3', ['-c', code], { input, encoding: 'utf8', timeout: TIMEOUT })
    : spawnSync(process.execPath, ['scripts/run-js.ts'], { input: JSON.stringify({ code, input, ts: lang === 'typescript' }), encoding: 'utf8', timeout: TIMEOUT })
  if (r.error || r.status === null) return { stdout: '', stderr: 'Waktu habis', ok: false, timeout: true }
  if (lang === 'python') return { stdout: r.stdout, stderr: r.stderr, ok: r.status === 0 }
  return JSON.parse(r.stdout)
}

// Bahasa compiled: compile sekali, jalankan semua input (executor yang sama dengan server eksekusi).
const runAll = async (lang: Lang, code: string, inputs: string[]): Promise<Run[]> => {
  if (lang === 'html') return inputs.map(i => ({ stdout: runChecks(new JSDOM(code).window.document, JSON.parse(i || '[]')), stderr: '', ok: true }))
  if (lang === 'bash') return Promise.all(inputs.map(async i => { const r = await new Shell().run(code, i); return { stdout: r.stdout, stderr: r.stderr, ok: r.code === 0 } }))
  return (COMPILED as string[]).includes(lang) ? runCompiled(lang as CLang, code, inputs, { timeoutMs: TIMEOUT }) : inputs.map(i => run(lang, code, i))
}

// Bash & git asli (LC_ALL=C, HOME sementara dengan .gitconfig) untuk memastikan terminal simulasi berperilaku sama.
function realBash(code: string, input: string) {
  const dir = mkdtempSync(join(tmpdir(), 'slayer-real-'))
  writeFileSync(join(dir, '.gitconfig'), '[user]\n\tname = Slayer\n\temail = slayer@korps.id\n[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n[pull]\n\trebase = false\n')
  try {
    const r = spawnSync('bash', ['-c', code], { cwd: dir, input, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1' }, timeout: 10000 })
    return r.stdout
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// Input tes boleh berupa { gen: "kode python" } untuk membuat input besar (uji performa).
const genInput = (t: string | { gen: string }) => typeof t === 'string' ? t : spawnSync('python3', ['-c', t.gen], { encoding: 'utf8' }).stdout

export async function buildTrack(track: string) {
  const chapters: Record<string, unknown> = {}
  const ids = new Set<string>()
  const valid = new Set(nodesOf(track).map(n => n.id))
  for (const file of readdirSync(`content/${track}`).filter(f => f !== 'placement.yaml' && !f.startsWith('_') && f.endsWith('.yaml')).sort()) {
    const chapter = file.replace('.yaml', '')
    const where = `content/${track}/${file}`
    if (!valid.has(chapter)) throw new Error(`${where}: bab "${chapter}" tidak ada di kurikulum`)
    const src: ChapterSrc = parse(readFileSync(where, 'utf8'))
    const exercises = []
    for (const e of src.exercises) {
      const at = `${where} › ${e.id}`
      const fail = (msg: string): never => { throw new Error(`${at}: ${msg}`) }
      if (ids.has(e.id)) fail('id ganda')
      ids.add(e.id)
      if (!TYPES.includes(e.type)) fail(`type "${e.type}" tidak dikenal`)
      if (!e.title || !e.prompt || !(e.difficulty >= 1 && e.difficulty <= 5)) fail('title/prompt/difficulty wajib')
      // hints boleh blok teks: satu hint per baris (aman untuk koma, titik dua, dan kutip).
      if (typeof e.hints === 'string') e.hints = e.hints.trim().split('\n')
      if (e.hints?.length !== 3 && !(e.type === 'typing' && !e.hints)) fail('hints harus 3 tingkat')
      const lang = e.lang ?? src.lang ?? DEFAULT_LANG[track]
      const setup = src.setup ?? ''
      const extra: Record<string, unknown> = {}

      // Fill the Blank: ⟦jawaban⟧ di dalam code → potongan kode + isian (⟦⟧ karena [[ ]] sah di Python/JS).
      if (e.type === 'fill') {
        if (!e.code) fail('fill butuh code dengan ⟦isian⟧')
        const bagian = e.code!.split(/⟦(.*?)⟧/)
        if (bagian.length < 3) fail('fill butuh minimal satu ⟦isian⟧')
        extra.parts = bagian.filter((_, i) => i % 2 === 0)
        extra.blank_sizes = bagian.filter((_, i) => i % 2 === 1).map(a => a.length)
        e.solution = bagian.join('')
      }
      if (['write', 'bughunt', 'parsons', 'refactor', 'translate'].includes(e.type) && !e.solution) fail('solution wajib')
      if (e.type === 'predict' && !e.code) fail('predict butuh code')
      if (e.type === 'bughunt' && !(e.starter && e.bug_line)) fail('bughunt butuh starter & bug_line')

      // Jenis yang dinilai dengan test case: hitung expected dari kode referensi.
      let tests: { input?: string; expected: string; hidden?: boolean }[] = []
      const graded = ['write', 'predict', 'bughunt', 'parsons', 'fill', 'refactor', 'translate'].includes(e.type)
      if (graded) {
        const inputs = e.checks ? [JSON.stringify(e.checks)] : (e.tests ?? ['']).map(genInput)
        if (lang === 'html' && !e.checks?.length) fail('soal html butuh checks')
        // Translate: kebenaran ditentukan oleh kode sumber di bahasa asal.
        const [refLang, ref] = e.type === 'translate' ? [e.from_lang!, e.from_code!] : [lang, e.type === 'predict' ? e.code! : e.solution!]
        if (e.type === 'translate' && !(e.from_lang && e.from_code)) fail('translate butuh from_lang & from_code')
        const asm = (code: string) => assemble({ lang, pre: e.pre, after: e.after, quiet: e.quiet }, code)
        const refCode = e.type === 'translate' ? ref : asm(ref)
        const refRuns = await runAll(refLang, refCode, inputs.map(i => setup + i))
        if (lang === 'bash' && !e.sim_only) for (const [i, input] of inputs.entries()) {
          const real = realBash(refCode, input)
          if (norm(real) !== norm(refRuns[i].stdout)) fail(`terminal simulasi berbeda dengan bash asli pada tes ${i + 1}:\n--- bash asli ---\n${real}\n--- simulasi ---\n${refRuns[i].stdout}${refRuns[i].stderr}`)
        }
        for (const [i, input] of inputs.entries()) {
          const r = refRuns[i]
          if (!r.ok) fail(`solusi error pada tes ${i + 1}:\n${r.stderr}`)
          if (!norm(r.stdout)) fail(`solusi tidak mencetak apa-apa pada tes ${i + 1}`)
          if (lang === 'html' && r.stdout.includes('✗')) fail(`solusi tidak memenuhi semua syarat:\n${r.stdout}`)
          tests.push({ ...(input ? { input } : {}), expected: norm(r.stdout) + '\n', ...(i >= (e.samples ?? (e.type === 'predict' ? 1 : 2)) ? { hidden: true } : {}) })
        }
      }
      const passes = async (code: string) =>
        (await runAll(lang, assemble({ lang, pre: e.pre, after: e.after, quiet: e.quiet }, code), tests.map(t => setup + (t.input ?? '')))).every((r, i) => r.ok && norm(r.stdout) === norm(tests[i].expected))
      if (e.type === 'bughunt') {
        if (await passes(e.starter!)) fail('kode bug ternyata lolos semua tes')
        if (e.starter!.split('\n')[e.bug_line! - 1] === e.solution!.split('\n')[e.bug_line! - 1]) fail('baris bug_line sama dengan solusi')
      }
      if (e.type === 'write' && e.starter && await passes(e.starter)) fail('starter sudah lolos semua tes')
      if (e.type === 'translate' && !(await passes(e.solution!))) fail('solusi terjemahan tidak menghasilkan output yang sama dengan kode sumber')
      if (e.type === 'translate') Object.assign(extra, { from_lang: e.from_lang, from_code: e.from_code })

      // Refactor: starter benar tapi melanggar aturan; solusi benar dan memenuhi semua aturan.
      if (e.type === 'refactor') {
        if (!e.starter || !e.rules?.length) fail('refactor butuh starter & rules')
        if (!(await passes(e.starter!))) fail('starter refactor harus sudah benar (lolos tes)')
        if (e.rules!.every(r => ruleOk(r, e.starter!))) fail('starter refactor tidak melanggar aturan mana pun')
        const gagal = e.rules!.filter(r => !ruleOk(r, e.solution!))
        if (gagal.length) fail(`solusi melanggar aturan: ${gagal.map(r => r.text).join('; ')}`)
        extra.rules = e.rules
      }
      // Trace Table: kunci dihasilkan tracer (sama dengan Step Debugger).
      if (e.type === 'trace') {
        if (lang !== 'python' || !e.code || !e.line || !e.vars?.length) fail('trace butuh code, line, vars (Python)')
        const r = spawnSync('python3', ['src/run/tracer.py'], { input: JSON.stringify({ code: e.code, line: e.line, names: e.vars }), encoding: 'utf8', timeout: TIMEOUT })
        if (r.status !== 0) fail(`tracer gagal: ${r.stderr}`)
        const rows: string[][] = JSON.parse(r.stdout)
        if (!rows.length || rows.length > 12) fail(`trace menghasilkan ${rows.length} baris (harus 1–12)`)
        extra.trace = { line: e.line, vars: e.vars, rows }
      }
      if (e.type === 'complexity') {
        if (!e.code || !COMPLEXITIES.includes(e.answer!)) fail(`complexity butuh code & answer salah satu dari ${COMPLEXITIES.join(', ')}`)
        Object.assign(extra, { answer: e.answer, explain: e.explain })
      }
      if (e.type === 'typing' && !(e.code && e.code.length <= 400)) fail('typing butuh code ≤ 400 karakter')
      if (e.type === 'review') {
        const n = e.code?.trimEnd().split('\n').length ?? 0
        if (!e.issues?.length || e.issues.some(i => i.line < 1 || i.line > n)) fail('review butuh issues dengan baris valid')
        extra.issues = e.issues
      }
      // Read the Error: pesan error asli dari menjalankan kodenya.
      // Kuis skenario: pilihan ganda (options[0] benar) + penjelasan. Jawaban singkat: daftar jawaban yang diterima.
      if (e.type === 'quiz') {
        if ((e.options?.length ?? 0) < 3 || new Set(e.options).size !== e.options!.length) fail('quiz butuh ≥ 3 options berbeda')
        if (!e.explain) fail('quiz butuh explain')
        Object.assign(extra, { options: e.options, explain: e.explain, ...(e.code ? { code: e.code } : {}) })
      }
      if (e.type === 'answer') {
        if (!e.accept?.length) fail('answer butuh accept')
        if (!e.explain) fail('answer butuh explain')
        Object.assign(extra, { accept: e.accept!.map(String), explain: e.explain, ...(e.code ? { code: e.code } : {}) })
      }
      if (e.type === 'lab') {
        if (!e.lab || !LAB_IDS.has(e.lab)) fail(`lab "${e.lab}" tidak ada di content/ctf/labs.yaml`)
        extra.lab = e.lab
      }
      if (e.type === 'readerror') {
        if (!e.code || (e.options?.length ?? 0) < 3) fail('readerror butuh code & ≥ 3 options')
        const input = String(genInput(e.tests?.[0] ?? ''))
        const [r] = await runAll(lang, e.code!, [setup + input])
        if (r.ok) fail('kode readerror tidak menghasilkan error')
        if (input) tests = [{ input, expected: '' }] // ditampilkan bersama kode, supaya error-nya bisa direproduksi
        extra.error = r.stderr.replaceAll('File "<string>"', 'File "<kode>"').trim().slice(-600)
        Object.assign(extra, { options: e.options, explain: e.explain })
      }

      exercises.push({
        id: e.id, type: e.type, title: e.title, difficulty: e.difficulty, ...(e.story ? { story: e.story } : {}), prompt: e.prompt, lang,
        ...(e.starter ? { starter: e.starter } : {}), ...(e.code && e.type !== 'fill' ? { code: e.code } : {}), ...(e.bug_line ? { bug_line: e.bug_line } : {}),
        ...(setup ? { setup } : {}), ...(e.after ? { after: e.after } : {}), ...(e.pre ? { pre: e.pre } : {}), ...(e.quiet ? { quiet: true } : {}), tests, hints: e.hints ?? [], solutions: e.solution ? [e.solution] : [], concepts: e.concepts ?? [], xp: e.difficulty * 10,
        ...extra, track, chapter,
      })
    }
    chapters[chapter] = { lesson: src.lesson ?? [], exercises }
  }
  await addGallery(track, chapters as Record<string, { exercises: GalleryTarget[] }>)
  return { hash: sourceHash(track), chapters }
}

// Solution Gallery: content/<track>/_gallery.yaml berisi solusi alternatif per soal; masing-masing harus lolos semua tes soalnya.
type GalleryTarget = { id: string; type: string; lang: Lang; setup?: string; pre?: string; after?: string; quiet?: boolean; tests: { input?: string; expected: string }[]; solutions: string[]; gallery?: unknown[] }
const STYLES = ['idiomatic', 'fastest', 'readable']
async function addGallery(track: string, chapters: Record<string, { exercises: GalleryTarget[] }>) {
  const file = `content/${track}/_gallery.yaml`
  if (!existsSync(file)) return
  const src: Record<string, { style: string; note: string; code: string }[]> = parse(readFileSync(file, 'utf8'))
  const all = Object.values(chapters).flatMap(c => c.exercises)
  for (const [id, alts] of Object.entries(src)) {
    const fail = (msg: string): never => { throw new Error(`${file} › ${id}: ${msg}`) }
    const e = all.find(x => x.id === id) ?? fail('soal tidak ditemukan')
    if (!['write', 'translate', 'refactor', 'bughunt'].includes(e.type)) fail(`jenis ${e.type} tidak punya galeri`)
    for (const [k, a] of alts.entries()) {
      if (!STYLES.includes(a.style) || !a.note || !a.code) fail(`alternatif ${k + 1}: style (${STYLES.join('/')}), note, code wajib`)
      if (norm(a.code) === norm(e.solutions[0])) fail(`alternatif ${k + 1} sama dengan solusi referensi`)
      const runs = await runAll(e.lang, assemble(e, a.code), e.tests.map(t => (e.setup ?? '') + (t.input ?? '')))
      runs.forEach((r, i) => { if (!r.ok || norm(r.stdout) !== norm(e.tests[i].expected)) fail(`alternatif ${k + 1} (${a.style}) gagal tes ${i + 1}:\n${r.stdout}${r.stderr}`) })
    }
    e.gallery = alts.map(a => ({ style: a.style, note: a.note.trim(), code: a.code }))
  }
}

// Sidik jari sumber: test memastikan JSON hasil build tidak basi tanpa menjalankan ulang semua solusi.
export function sourceHash(track: string) {
  const h = createHash('sha1')
  for (const f of readdirSync(`content/${track}`).filter(f => f !== 'placement.yaml' && f.endsWith('.yaml')).sort()) h.update(f).update(readFileSync(`content/${track}/${f}`))
  return h.digest('hex').slice(0, 12)
}

// ---- Swordsmith Village: project bertahap. Tahap k harus lolos tes tahap 1..k (kecuali regression: false).
type StageSrc = { title: string; prompt: string; tests?: string[]; hints?: string; solution: string; after?: string }
type ProjectSrc = { id: string; title: string; track: string; lang: Lang; requires: string; emoji: string; story: string; starter: string; regression?: boolean; stages: StageSrc[] }
export function projectsHash() {
  const h = createHash('sha1')
  for (const f of readdirSync('content/projects').sort()) h.update(f).update(readFileSync(`content/projects/${f}`))
  return h.digest('hex').slice(0, 12)
}
export async function buildProjects() {
  const out = []
  for (const file of readdirSync('content/projects').filter(f => f.endsWith('.yaml')).sort()) {
    const p: ProjectSrc = parse(readFileSync(`content/projects/${file}`, 'utf8'))
    const fail = (msg: string): never => { throw new Error(`content/projects/${file}: ${msg}`) }
    if (!nodesOf(p.track).some(n => n.id === p.requires)) fail(`requires ${p.requires} tidak ada di kurikulum ${p.track}`)
    if (p.stages.length < 3) fail('project butuh ≥ 3 tahap')
    const stages = []
    for (const [k, st] of p.stages.entries()) {
      const at = (msg: string) => fail(`tahap ${k + 1}: ${msg}`)
      const code = (c: string) => (st.after ? `${c}\n${st.after}` : c)
      const inputs = st.tests?.length ? st.tests : ['']
      const runs = await runAll(p.lang, code(st.solution), inputs)
      const tests = runs.map((r, i) => {
        if (!r.ok) at(`solusi error pada tes ${i + 1}:\n${r.stderr}`)
        if (!norm(r.stdout)) at(`solusi tidak mencetak apa-apa pada tes ${i + 1}`)
        return { ...(inputs[i] ? { input: inputs[i] } : {}), expected: norm(r.stdout) + '\n', ...(i ? { hidden: true } : {}) }
      })
      // Regresi: solusi tahap ini tetap lolos tes semua tahap sebelumnya.
      if (p.regression !== false) for (const [j, prev] of stages.entries()) {
        const rr = await runAll(p.lang, (prev.after ? `${st.solution}\n${prev.after}` : st.solution), prev.tests.map(t => t.input ?? ''))
        rr.forEach((r, i) => { if (norm(r.stdout) !== norm(prev.tests[i].expected)) at(`solusi merusak tes tahap ${j + 1} (tes ${i + 1})`) })
      }
      if (k === 0 && (await runAll(p.lang, code(p.starter), inputs)).every((r, i) => r.ok && norm(r.stdout) === norm(tests[i].expected))) at('starter sudah lolos')
      if (k > 0 && (await runAll(p.lang, code(p.stages[k - 1].solution), inputs)).every((r, i) => r.ok && norm(r.stdout) === norm(tests[i].expected))) at('solusi tahap sebelumnya sudah lolos tahap ini (tidak ada yang baru?)')
      stages.push({ title: st.title, prompt: st.prompt, hints: (st.hints ?? '').split('\n').filter(Boolean), solution: st.solution, ...(st.after ? { after: st.after } : {}), tests })
    }
    out.push({ id: p.id, title: p.title, track: p.track, lang: p.lang, requires: p.requires, emoji: p.emoji, story: p.story, starter: p.starter, ...(p.regression === false ? { regression: false } : {}), stages })
  }
  return { hash: projectsHash(), projects: out }
}

if (import.meta.main ?? process.argv[1]?.endsWith('build-content.ts')) {
  mkdirSync('src/generated', { recursive: true })
  // `npm run content -- go rust` membangun track tertentu; tanpa argumen hanya track yang sumbernya berubah (--force: semua).
  const args = process.argv.slice(2)
  const only = args.filter(a => !a.startsWith('--'))
  for (const track of readdirSync('content').filter(t => t !== 'projects' && t !== 'olymp' && t !== 'ctf' && existsSync(`content/${t}`) && readdirSync(`content/${t}`).some(f => f !== 'placement.yaml'))) {
    if (only.length && !only.includes(track)) continue
    if (!only.length && !args.includes('--force') && existsSync(`src/generated/${track}.json`) && JSON.parse(readFileSync(`src/generated/${track}.json`, 'utf8')).hash === sourceHash(track)) { console.log(`${track}: tidak berubah`); continue }
    const t0 = Date.now()
    const data = await buildTrack(track)
    writeFileSync(`src/generated/${track}.json`, JSON.stringify(data, null, 1) + '\n')
    const n = Object.values(data.chapters).reduce((s: number, c) => s + (c as { exercises: unknown[] }).exercises.length, 0)
    console.log(`${track}: ${n} soal, ${Object.keys(data.chapters).length} bab (${Date.now() - t0} ms)`)
  }
  const PJ = 'src/generated/meta/projects.json'
  if (!only.length || only.includes('projects')) {
    if (!only.length && !args.includes('--force') && existsSync(PJ) && JSON.parse(readFileSync(PJ, 'utf8')).hash === projectsHash()) console.log('projects: tidak berubah')
    else {
      const t0 = Date.now()
      const data = await buildProjects()
      mkdirSync('src/generated/meta', { recursive: true })
      writeFileSync(PJ, JSON.stringify(data, null, 1) + '\n')
      console.log(`projects: ${data.projects.length} project, ${data.projects.reduce((n, p) => n + p.stages.length, 0)} tahap (${Date.now() - t0} ms)`)
    }
  }
  // Jalur olimpiade & lab CTF punya builder sendiri; dijalankan juga saat membangun semua (atau diminta: olymp / ctf).
  for (const [name, script] of [['olymp', 'scripts/build-olymp.ts'], ['ctf', 'scripts/build-ctf.ts']]) {
    if (only.length && !only.includes(name)) continue
    const r = spawnSync(process.execPath, [script, ...args.filter(a => a.startsWith('--'))], { stdio: 'inherit' })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}
