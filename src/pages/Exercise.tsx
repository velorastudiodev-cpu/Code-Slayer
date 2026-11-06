import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { db, useAttempts, useProgress } from '../db'
import { NotEnoughKoban, buy, useCompanion } from '../wallet'
import { useLiveQuery } from 'dexie-react-hooks'
import { exerciseKoban, hintCost, withBuff } from '../data/economy'
import { Avatar, type Expr } from '../characters/rig'
import { TYPE_LABEL, allExercises, shuffle, useTrackContent, type Exercise } from '../data/content'
import { isOpen, nodesOf } from '../data/curriculum'
import { grade, type Graded } from '../run'
import { norm } from '../run/exec'
import { explainError, explainMismatch } from '../run/explain'
import { Editor } from '../Editor'
import { Debugger } from '../Debugger'
import { assemble, ruleOk } from '../data/exercise-types'
import { Complexity, Fill, Quiz, ReadError, Review, RuleList, ShortAnswer, SourceView, TraceTable, Typing, verdict } from './tasks'
import { ServerBanner, useServerStatus } from '../run/status'
import { GitGraph, useGitSnapshot } from '../components/GitGraph'
import { HtmlPreview } from '../components/HtmlPreview'
import { describe as describeCheck, type Check } from '../run/htmlcheck'
import { Gallery } from '../components/Gallery'
import { Mentor } from '../components/Mentor'
import { sfx } from '../sfx'
import { FlagForm, LabTools, Writeup, useLabs } from '../labs/LabView'
import { recordSolve } from './Ctf'

type Status = '' | 'loading' | 'running'

export default function ExercisePage() {
  const { track = '', id = '' } = useParams()
  const content = useTrackContent(track)
  const prog = useProgress(track)
  const attempts = useAttempts(track)
  if (!content || prog === undefined) return null
  const ex = allExercises(content, track).find(x => x.id === id)
  if (!ex) return <Navigate to="/latihan" replace />
  const back = `/belajar/${track}/bab/${ex.chapter}`
  if (!prog || !isOpen(nodesOf(track), prog.passed, ex.chapter))
    return <div className="page"><h1>Terkunci</h1><p className="muted">Selesaikan bab sebelumnya dulu.</p><Link className="btn-primary" to={`/belajar/${track}`}>Ke Skill Tree</Link></div>
  const list = content.chapters[ex.chapter].exercises
  const next = list[list.indexOf(ex) + 1]
  const solved = attempts.some(a => a.kind === 'exercise' && a.node === id && a.passed)
  return <ExerciseView key={id} ex={ex} next={next ? `/latihan/${track}/${next.id}` : back} nextLabel={next ? `Berikutnya: ${next.title}` : 'Kembali ke bab'} solved={solved} />
}

export function ExerciseView({ ex, next, nextLabel, solved, kata }: { ex: Exercise; next: string; nextLabel: string; solved: boolean; kata?: boolean }) {
  const c = useCompanion()
  const [mood, setMood] = useState<Expr>('focus')
  const [won, setWon] = useState(false)
  const [first, setFirst] = useState(false) // lulus pertama kali → dapat XP & Koban
  const [hintMsg, setHintMsg] = useState('')
  const [opening, setOpening] = useState(false) // kunci double-tap: satu hint, satu kali bayar
  const [mine, setMine] = useState<string | null>(null) // kode yang baru lulus (Solution Gallery)
  const fails = useAttempts(ex.track).filter(a => a.kind === 'exercise' && a.node === ex.id && !a.passed).length
  const hints = (useLiveQuery(() => db.kv.get(`hints:${ex.id}`), [ex.id])?.value as number | undefined) ?? 0
  const cost = hintCost(ex.difficulty, fails, hints, c.id)
  const reward = withBuff(exerciseKoban(ex.xp), { kind: 'exercise', companion: c.id, type: ex.type, track: ex.track })

  async function openHint() {
    if (opening) return
    setHintMsg('')
    setOpening(true)
    try {
      if (cost) await buy(() => [{ date: new Date().toISOString(), kind: 'hint', cost, node: ex.id }])
      await db.kv.put({ key: `hints:${ex.id}`, value: hints + 1 })
    } catch (e) { setHintMsg(e instanceof NotEnoughKoban ? 'Koban belum cukup. Hint jadi gratis setelah 2 kali gagal.' : String(e)) }
    setOpening(false)
  }

  function onResult(r: Graded[], code?: string) {
    const pass = r.every(x => x.pass)
    setWon(pass)
    sfx(pass ? 'win' : 'lose')
    if (pass && code !== undefined) { setMine(code); db.kv.put({ key: `sol:${ex.id}`, value: code }) }
    setMood(pass ? 'victory' : 'encourage')
    const date = new Date().toISOString(), correct = r.filter(x => x.pass).length
    db.transaction('rw', db.attempts, async () => {
      if (pass) setFirst(!(await db.attempts.where('track').equals(ex.track).filter(a => a.kind === 'exercise' && a.node === ex.id && a.passed).count()))
      await db.attempts.add({ track: ex.track, node: ex.id, kind: 'exercise', date, correct, total: r.length, passed: pass, meta: { type: ex.type, xp: ex.xp, err: errKind(r), hints, ...(pass ? {} : { msg: failMsg(r) }) } })
      if (kata && pass) await db.attempts.add({ track: ex.track, node: ex.id, kind: 'kata', date, correct, total: r.length, passed: true })
    })
  }

  return (
    <div className="page">
      <section className="hero">
        <Avatar c={c} expr={mood} size={96} />
        <div>
          <small className="muted">{kata && 'Daily Kata · '}{TYPE_LABEL[ex.type]} · {'★'.repeat(ex.difficulty)}{solved && ' · ✓ sudah ditebas'}</small>
          <h1>{ex.title}</h1>
        </div>
      </section>
      <Task ex={ex} onResult={onResult} onMood={setMood} />
      {won && (
        <section className="card win">
          <h2>Iblis tertebas!{first && <> +{ex.xp} XP · +{reward} Koban</>}</h2>
          <Link className="btn-primary" to={next}>{nextLabel}</Link>
        </section>
      )}
      {won && mine !== null && <Gallery ex={ex} mine={mine} />}
      {!won && (
        <section className="hints">
          {ex.hints.slice(0, hints).map((h, i) => <p key={i} className="feedback"><b>Hint {i + 1}:</b> {h}</p>)}
          {hints < ex.hints.length && (
            <button className="btn-ghost" disabled={opening} onClick={openHint}>Minta hint ({hints + 1}/{ex.hints.length}) · {cost ? `${cost} Koban` : 'gratis'}</button>
          )}
          {hintMsg && <p className="feedback wrong">{hintMsg}</p>}
        </section>
      )}
    </div>
  )
}

// Jenis kegagalan pertama (untuk pencapaian seperti Segfault Survivor).
export function errKind(r: Graded[]) {
  const bad = r.find(x => !x.pass)
  if (!bad) return undefined
  const e = bad.run.stderr
  if (bad.run.timeout) return 'timeout'
  if (/Segmentation fault|SIGSEGV/.test(e)) return 'segfault'
  if (/SyntaxError|IndentationError|TabError|error: expected|syntax error/.test(e)) return 'syntax'
  return bad.run.ok ? 'wrong' : 'error'
}

// Ringkasan satu baris kegagalan untuk Mistake Journal.
export function failMsg(r: Graded[]) {
  const i = r.findIndex(x => !x.pass)
  if (i < 0) return undefined
  const bad = r[i]
  const line = bad.run.stderr.trim().split('\n').filter(Boolean).at(-1)
  return (bad.label ? `${bad.label}` : line ? line : `Tes ${i + 1}: output beda dari yang diharapkan`).slice(0, 160)
}

// Soal + area kerja + hasil. `once`: satu kali serah (mode ujian).
export function Task({ ex, onResult, onMood, once }: { ex: Exercise; onResult: (r: Graded[], code?: string) => void; onMood?: (e: Expr) => void; once?: boolean }) {
  const [status, setStatus] = useState<Status>('')
  const [results, setResults] = useState<Graded[] | null>(null)
  const [found, setFound] = useState(false)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const locked = once && !!results
  const server = useServerStatus(ex.lang)

  function done(r: Graded[], code?: string) { setResults(r); onResult(r, code) }
  async function run(code: string) {
    setStatus('loading')
    setResults(null)
    setLastCode(code)
    const r = await grade(ex.lang, assemble(ex, code), ex.tests, ex.setup ?? '', () => setStatus('running'))
    setStatus('')
    // Refactor: benar saja tidak cukup, aturan kebersihan kode juga harus terpenuhi.
    done([...r, ...(ex.rules ?? []).map(rule => verdict(ruleOk(rule, code), `Aturan: ${rule.text}`))], code)
  }
  const work = { ex, status: locked ? ('running' as Status) : status, onRun: run, label: once ? 'Serahkan jawaban' : undefined, blocked: ['offline', 'checking', 'none'].includes(server) }

  const samples = ex.tests.filter(t => !t.hidden)
  return (
    <>
      {ex.story && <p className="story">{ex.story}</p>}
      <p className="prompt">{ex.prompt}</p>
      {ex.type !== 'predict' && <ServerBanner status={server} />}
      {ex.setup && <details><summary>Dataset (SQL)</summary><pre className="code">{ex.setup.trimEnd()}</pre></details>}
      {ex.pre && <details><summary>Persiapan (sudah dijalankan otomatis)</summary><pre className="code">{ex.pre.trimEnd()}</pre></details>}
      {ex.lang === 'html' && <HtmlChecks ex={ex} />}
      {ex.type !== 'predict' && ex.lang !== 'html' && samples.length > 0 && (
        <div className="samples">
          {samples.map((t, i) => (
            <div key={i}>
              {t.input && <><small>Contoh input {i + 1}</small><pre className="code">{t.input.trimEnd()}</pre></>}
              <small>{ex.quiet ? 'Keadaan yang diharapkan (diperiksa setelah perintahmu)' : `Contoh output ${i + 1}`}</small><pre className="code">{t.expected.trimEnd()}</pre>
            </div>
          ))}
        </div>
      )}
      {ex.type === 'translate' && <SourceView ex={ex} />}
      {(ex.type === 'write' || ex.type === 'translate' || (ex.type === 'bughunt' && found)) && <CodeTask {...work} initial={ex.starter ?? ''} />}
      {ex.type === 'refactor' && <CodeTask {...work} initial={ex.starter ?? ''} extra={code => <RuleList rules={ex.rules!} code={code} />} />}
      {ex.type === 'fill' && <Fill ex={ex} disabled={!!work.status || !!work.blocked} label={runLabel(work.status, work.label)} onRun={run} />}
      {ex.type === 'trace' && <TraceTable ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'complexity' && <Complexity ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'typing' && <Typing ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'review' && <Review ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'readerror' && <ReadError ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'quiz' && <Quiz ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'answer' && <ShortAnswer ex={ex} done={!!results} onCheck={done} />}
      {ex.type === 'lab' && <LabTask ex={ex} solved={!!results} onSolved={() => done([verdict(true, 'Flag valid')])} />}
      {ex.type === 'bughunt' && !found && <BugPicker code={ex.starter ?? ''} line={ex.bug_line ?? 0} onFound={() => { setFound(true); onMood?.('happy') }} />}
      {ex.type === 'parsons' && <Parsons {...work} code={ex.solutions[0]} />}
      {ex.type === 'predict' && <Predict ex={ex} done={!!results} onCheck={ans => done([{ ...ex.tests[0], run: { stdout: ans, stderr: '', ok: true }, pass: norm(ans) === norm(ex.tests[0].expected) }])} />}
      {ex.track === 'git' && <GitPanel ex={ex} code={ex.type === 'predict' ? null : lastCode} />}
      {results && <Results results={results} predict={ex.type === 'predict'} track={ex.track} />}
      {results && lastCode !== null && !once && <Mentor key={lastCode} ex={ex} code={lastCode} results={results} />}
      {results && ex.type === 'trace' && <DebugAfter ex={ex} />}
    </>
  )
}

// Soal HTML/CSS: daftar syarat yang akan diperiksa.
function HtmlChecks({ ex }: { ex: Exercise }) {
  const checks = useMemo(() => JSON.parse(ex.tests[0]?.input ?? '[]') as Check[], [ex])
  return (
    <section className="card">
      <h3>Syarat yang diperiksa</h3>
      <ul className="checklist">{checks.map((c, i) => <li key={i}>{describeCheck(c)}</li>)}</ul>
    </section>
  )
}

// Graf commit sebelum & sesudah perintah user (soal Git).
function GitPanel({ ex, code }: { ex: Exercise; code: string | null }) {
  const before = useGitSnapshot(ex.pre ? `{\n${ex.pre}\n} >/dev/null 2>&1` : null)
  const after = useGitSnapshot(code === null ? null : assemble(ex, code))
  return (
    <>
      {before && !after && <details className="card" open><summary>Repo saat ini</summary><GitGraph snap={before} /></details>}
      {after && <section className="card"><h3>Repo setelah perintahmu</h3><GitGraph snap={after} /></section>}
    </>
  )
}

const runLabel = (s: Status, label = 'Tebas! Jalankan tes') => (s === 'loading' ? 'Menyiapkan runtime…' : s === 'running' ? 'Menjalankan tes…' : label)

type Work = { ex: Exercise; status: Status; onRun: (code: string) => void; label?: string; blocked?: boolean }

function CodeTask({ ex, initial, status, onRun, label, blocked, extra }: Work & { initial: string; extra?: (code: string) => React.ReactNode }) {
  const [code, setCode] = useState(initial)
  const [debug, setDebug] = useState<string | null>(null)
  return (
    <>
      <Editor value={initial} lang={ex.lang} onChange={setCode} label={`Editor: ${ex.title}`} />
      {ex.lang === 'html' && <HtmlPreview code={code} />}
      {extra?.(code)}
      <div className="row-actions">
        {ex.lang === 'python' && <button className="btn-ghost" onClick={() => setDebug(code)}>🐞 Debug</button>}
        <button className="btn-primary" disabled={!!status || blocked} onClick={() => onRun(code)}>{runLabel(status, label)}</button>
      </div>
      {debug !== null && <Debugger key={debug} code={debug} stdin={ex.tests[0]?.input ?? ''} onClose={() => setDebug(null)} />}
    </>
  )
}

function BugPicker({ code, line, onFound }: { code: string; line: number; onFound: () => void }) {
  const [wrong, setWrong] = useState<number[]>([])
  return (
    <>
      <p className="prompt">Langkah 1: tap baris yang mengandung bug.</p>
      <ol className="lines code">
        {code.trimEnd().split('\n').map((t, i) => (
          <li key={i}>
            <button disabled={wrong.includes(i + 1)} onClick={() => (i + 1 === line ? onFound() : setWrong([...wrong, i + 1]))}>{t || ' '}</button>
          </li>
        ))}
      </ol>
      {wrong.length > 0 && <p className="feedback wrong">Bukan baris itu. Coba telusuri nilai variabelnya baris demi baris.</p>}
    </>
  )
}

// Parsons: tap baris dari tumpukan untuk menyusun program; tap lagi untuk mengembalikan. Indentasi sudah tetap.
function Parsons({ code, status, onRun, label, blocked }: Work & { code: string }) {
  type L = { t: string; i: number }
  const [pool, setPool] = useState<L[]>(() => shuffle(code.trimEnd().split('\n').map((t, i) => ({ t, i }))))
  const [ans, setAns] = useState<L[]>([])
  const move = (l: L, from: L[], to: L[], setFrom: (x: L[]) => void, setTo: (x: L[]) => void) => { setFrom(from.filter(x => x !== l)); setTo([...to, l]) }
  return (
    <>
      <small className="muted">Programmu ({ans.length} baris)</small>
      <ol className="lines code answer">
        {ans.map(l => <li key={l.i}><button onClick={() => move(l, ans, pool, setAns, setPool)}>{l.t}</button></li>)}
        {ans.length === 0 && <li className="muted">Tap baris di bawah untuk menyusun.</li>}
      </ol>
      {pool.length > 0 && (
        <>
          <small className="muted">Potongan baris</small>
          <ol className="lines code">
            {pool.map(l => <li key={l.i}><button onClick={() => move(l, pool, ans, setPool, setAns)}>{l.t}</button></li>)}
          </ol>
        </>
      )}
      <button className="btn-primary" disabled={pool.length > 0 || !!status || blocked} onClick={() => onRun(ans.map(l => l.t).join('\n'))}>
        {pool.length ? `Susun semua baris dulu (${pool.length} lagi)` : runLabel(status, label)}
      </button>
    </>
  )
}

function Predict({ ex, done, onCheck }: { ex: Exercise; done: boolean; onCheck: (answer: string) => void }) {
  const [ans, setAns] = useState('')
  return (
    <>
      <pre className="code">{ex.code?.trimEnd()}</pre>
      {ex.tests[0].input && <><small className="muted">Input</small><pre className="code">{ex.tests[0].input.trimEnd()}</pre></>}
      <label className="field">
        <small className="muted">Output menurutmu</small>
        <textarea rows={Math.max(2, norm(ex.tests[0].expected).split('\n').length)} value={ans} disabled={done} spellCheck={false} onChange={e => setAns(e.target.value)} />
      </label>
      {!done && <button className="btn-primary" disabled={!ans.trim()} onClick={() => onCheck(ans)}>Periksa</button>}
    </>
  )
}

export function Results({ results, predict, track }: { results: Graded[]; predict: boolean; track: string }) {
  const n = results.filter(r => r.pass).length
  // Satu penjelasan error cukup (biasanya semua tes gagal karena hal yang sama).
  const err = results.find(r => r.run.stderr)?.run.stderr
  const why = err ? explainError(err) : null
  return (
    <section className="results" aria-live="polite">
      <h2>{n}/{results.length} tes lolos</h2>
      {why && (
        <p className="feedback explain">
          <b>{why.title}.</b> {why.text}{' '}
          {why.chapter && <Link to={`/belajar/${track}/bab/${why.chapter}`}>Ulas pelajarannya →</Link>}
        </p>
      )}
      <ol>
        {results.map((r, i) => {
          const hint = !r.pass && r.run.ok && !r.hidden ? explainMismatch(r.expected, r.run.stdout) : null
          return (
            <li key={i} className={r.pass ? 'pass' : 'fail'}>
              {r.label ? <><b>{r.pass ? '✓' : '✗'} {r.label}</b>{r.note && <p className="muted small">{r.note}</p>}</> : <>
              <b>{r.pass ? '✓' : '✗'} {predict ? 'Jawabanmu' : `Tes ${i + 1}`}{r.hidden ? ' (tersembunyi)' : ''}</b>
              {!r.hidden && !r.pass && (
                <div className="diff">
                  <div><small>Diharapkan</small><pre>{r.expected.trimEnd()}</pre></div>
                  <div><small>{predict ? 'Jawabanmu' : 'Output kodemu'}</small><pre>{r.run.stdout.trimEnd() || '(kosong)'}</pre></div>
                </div>
              )}
              {hint && <p className="muted small">{hint}</p>}
              {r.run.stderr && <pre className="stderr">{r.run.stderr.trimEnd()}</pre>}
              </>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Setelah Trace Table diperiksa: tonton langkahnya di Step Debugger.
function DebugAfter({ ex }: { ex: Exercise }) {
  const [open, setOpen] = useState(false)
  return open ? <Debugger code={ex.code!} stdin="" onClose={() => setOpen(false)} /> : <button className="btn-ghost" onClick={() => setOpen(true)}>🐞 Tonton langkahnya di Step Debugger</button>
}

// Lab sandbox di dalam bab: dinilai dengan flag (sama dengan CTF Arena; solve dicatat di keduanya).
function LabTask({ ex, solved, onSolved }: { ex: Exercise; solved: boolean; onSolved: () => void }) {
  const labs = useLabs()
  const lab = labs?.find(l => l.id === ex.lab)
  if (!lab) return <p className="muted">Memuat lab…</p>
  return (
    <>
      <p className="story">{lab.story}</p>
      <p className="prompt">🎯 {lab.task}</p>
      <LabTools lab={lab} />
      <FlagForm lab={lab} solved={solved} onSolve={() => { void recordSolve(lab, 'cyber'); onSolved() }} />
      {solved && <Writeup lab={lab} />}
    </>
  )
}
