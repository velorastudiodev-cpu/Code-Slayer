// Definisi jenis latihan (PRD bagian 6), dipakai bersama oleh aplikasi dan build konten.
import type { Lang } from '../run/exec'

export type ExerciseType =
  | 'write' | 'predict' | 'bughunt' | 'parsons'
  | 'fill' | 'trace' | 'refactor' | 'complexity' | 'typing' | 'translate' | 'review' | 'readerror'
  | 'quiz' | 'answer' | 'lab'

export const TYPE_LABEL: Record<ExerciseType, string> = {
  write: 'Write the Code', predict: 'Predict the Output', bughunt: 'Bug Hunt', parsons: 'Parsons Puzzle',
  fill: 'Fill the Blank', trace: 'Trace Table', refactor: 'Refactor Challenge', complexity: 'Complexity Guess',
  typing: 'Syntax Speed Typing', translate: 'Translate the Code', review: 'Code Review', readerror: 'Read the Error',
  quiz: 'Kuis Skenario', answer: 'Jawaban Singkat', lab: 'Lab Sandbox',
}

export const COMPLEXITIES = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)']

export type Rule = { text: string; max_lines?: number; forbid?: string; require?: string }

// Baris kode berarti: bukan kosong, bukan komentar.
const codeLines = (code: string) => code.split('\n').filter(l => l.trim() && !/^\s*(#|\/\/)/.test(l)).length

export function ruleOk(r: Rule, code: string) {
  if (r.max_lines !== undefined && codeLines(code) > r.max_lines) return false
  if (r.forbid && new RegExp(r.forbid, 'm').test(code)) return false
  if (r.require && !new RegExp(r.require, 'm').test(code)) return false
  return true
}

export type Test = { input?: string; expected: string; hidden?: boolean }

// Kode yang benar-benar dijalankan untuk menilai: persiapan + kode user + pemeriksa.
export function assemble(ex: { lang: string; pre?: string; after?: string; quiet?: boolean }, code: string) {
  if (ex.lang !== 'bash') return ex.after ? `${code}\n${ex.after}` : code
  return `${ex.pre ? `{\n${ex.pre}\n} >/dev/null 2>&1\n` : ''}${ex.quiet ? `{\n${code}\n} >/dev/null 2>&1` : code}${ex.after ? `\n${ex.after}` : ''}`
}

export type Exercise = {
  id: string
  type: ExerciseType
  title: string
  difficulty: number
  story?: string
  prompt: string
  lang: Lang
  starter?: string // write, bughunt, refactor, translate
  code?: string // predict, trace, complexity, typing, review, readerror
  bug_line?: number
  setup?: string // sql
  after?: string // dijalankan setelah kode user (SQL: query pemeriksa; bash/git: skrip pemeriksa state)
  pre?: string // bash: skrip persiapan tersembunyi (output dibuang), mis. repo dengan riwayat commit
  quiet?: boolean // bash: output kode user dibuang; yang dinilai hanya output `after`
  tests: Test[]
  hints: string[]
  solutions: string[]
  concepts: string[]
  xp: number
  track: string
  chapter: string
  parts?: string[] // fill: potongan kode di sekitar isian
  blank_sizes?: number[]
  trace?: { line: number; vars: string[]; rows: string[][] }
  rules?: Rule[]
  answer?: string // complexity
  explain?: string
  from_lang?: Lang // translate
  from_code?: string
  issues?: { line: number; text: string }[] // review
  error?: string // readerror: pesan error asli
  options?: string[] // readerror, quiz: options[0] benar
  accept?: string[] // answer: jawaban yang diterima (dibandingkan tanpa beda huruf besar/kecil & spasi)
  gallery?: Alt[] // Solution Gallery: alternatif yang lolos semua tes
  lab?: string // lab: id lab di content/ctf/labs.yaml (dinilai dengan flag)
}
export type Alt = { style: 'idiomatic' | 'fastest' | 'readable'; note: string; code: string }
