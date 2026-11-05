import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useAllProgress, useAttempts } from '../db'
import { useCompanion } from '../wallet'
import { Avatar, Chibi, type Expr } from '../characters/rig'
import { demonById } from '../characters/demons'
import { buffOf, buffText, bugRushSeconds, castleLives, timeAttackSeconds, type Buff } from '../data/economy'
import { allExercises, exerciseTracks, loadBank, loadTrack, shuffle, type Exercise, type Mcq } from '../data/content'
import { isOpen, nodesOf } from '../data/curriculum'
import {
  castleRoom, choices, dailyKata, dayKey, isBossFloor,
  raidBoss, raidDefeatNode, raidNode, raidProblems, raidState, rushItem, weekKey, type Choice,
} from '../data/game'
import { streak } from '../engine'
import { ExerciseView, Task } from './Exercise'

export type Pool = { exercises: Exercise[]; mcqs: Mcq[] }

// Soal game hanya dari bab yang sudah terbuka di track yang sudah dimulai (progres tetap bertahap).
export function useGamePool(): Pool | null {
  const progress = useAllProgress()
  const [pool, setPool] = useState<Pool | null>(null)
  const key = progress.map(p => `${p.track}:${p.passed.length}`).join('|')
  useEffect(() => {
    Promise.all(progress.filter(p => exerciseTracks.includes(p.track)).map(async p => {
      const nodes = nodesOf(p.track)
      const open = (id: string) => isOpen(nodes, p.passed, id)
      const [c, bank] = await Promise.all([loadTrack(p.track), loadBank(p.track)])
      return { ex: allExercises(c, p.track).filter(e => open(e.chapter)), mcq: bank.filter(q => open(q.chapter)) }
    })).then(rs => setPool({ exercises: rs.flatMap(r => r.ex), mcqs: rs.flatMap(r => r.mcq) }))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return pool
}

// Nilai yang dibekukan di Dexie: dihitung sekali (misalnya soal Kata hari ini), lalu tetap.
export function useFrozen<T>(key: string, compute: () => T | null, ready: boolean): T | null | undefined {
  const saved = useLiveQuery(() => db.kv.get(key).then(r => r ?? null), [key])
  useEffect(() => {
    if (saved !== null || !ready) return
    const v = compute()
    if (v !== null) db.kv.put({ key, value: v })
  }, [saved, ready, key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (saved === undefined) return undefined
  // Belum tersimpan: hitung sekarang (deterministik), effect di atas menyimpannya.
  return saved ? (saved.value as T) : ready ? compute() : null
}

export function useTodayKata(pool: Pool | null) {
  const day = dayKey()
  const id = useFrozen(`kata:${day}`, () => dailyKata(pool!.exercises, day)?.id ?? null, !!pool)
  if (!pool || id === undefined) return undefined
  return id ? pool.exercises.find(e => e.id === id) ?? null : null
}

export function useWeekRaid(pool: Pool | null) {
  const week = weekKey()
  const ids = useFrozen(`raid:${week}`, () => { const p = raidProblems(pool!.exercises, week); return p.length ? p.map(e => e.id) : null }, !!pool)
  const problems = pool && ids ? ids.map(id => pool.exercises.find(e => e.id === id)).filter(Boolean) as Exercise[] : []
  return { week, boss: raidBoss(week), problems }
}

const Hearts = ({ n, max }: { n: number; max: number }) => <span className="hearts" aria-label={`${n} nyawa`}>{'♥'.repeat(n)}<span className="lost">{'♥'.repeat(Math.max(0, max - n))}</span></span>

// Buff companion yang aktif di mode ini (ditampilkan supaya pemain tahu kenapa nyawa/waktunya berbeda).
function BuffNote({ kinds }: { kinds: Buff['kind'][] }) {
  const c = useCompanion()
  const b = buffOf(c.id)
  return b && kinds.includes(b.kind) ? <p className="muted small buff">Buff {c.name}: {buffText(b)}</p> : null
}

function ChoiceCard({ c, onAnswer, fast }: { c: Choice; onAnswer: (ok: boolean) => void; fast?: boolean }) {
  const opts = useMemo(() => shuffle(c.options), [c])
  const [pick, setPick] = useState<string | null>(null)
  return (
    <section className="question">
      <p className="prompt">{c.prompt}</p>
      {c.code && <pre className="code">{c.code.trimEnd()}</pre>}
      {c.error && <pre className="stderr">{c.error}</pre>}
      <div className={`choices ${c.options.length === 6 ? 'grid2' : ''}`}>
        {opts.map(o => (
          <button key={o} className="opt" disabled={pick !== null}
            data-state={pick === null || fast ? undefined : o === c.answer ? 'right' : o === pick ? 'wrong' : undefined}
            onClick={() => { setPick(o); onAnswer(o === c.answer) }}>
            {o}
          </button>
        ))}
      </div>
      {pick !== null && !fast && c.explain && <p className="feedback">{c.explain}</p>}
    </section>
  )
}

function Hud({ title, children, expr }: { title: string; children: React.ReactNode; expr: Expr }) {
  const c = useCompanion()
  return (
    <section className="hero">
      <Avatar c={c} expr={expr} size={80} />
      <div className="grow"><h1>{title}</h1><div className="hud">{children}</div></div>
    </section>
  )
}

// Detik tersisa, dihitung dari jam (bukan jumlah tick) supaya akurat walau tab sempat tidur.
function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds)
  const end = useRef(0)
  const done = useRef(onEnd)
  done.current = onEnd
  useEffect(() => {
    if (!running) return
    end.current = Date.now() + seconds * 1000
    setLeft(seconds)
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((end.current - Date.now()) / 1000))
      setLeft(l)
      if (l === 0) { clearInterval(t); done.current() }
    }, 250)
    return () => clearInterval(t)
  }, [running, seconds])
  return left
}

// Penjaga lantai boss: makin tinggi makin kuat, Muzan di lantai 100.
const CASTLE_ORDER = ['enmu', 'rui', 'daki', 'gyutaro', 'gyokko', 'hantengu', 'akaza', 'doma', 'kokushibo', 'muzan']
const castleDemon = (floor: number) => demonById(CASTLE_ORDER[(floor / 10 - 1) % CASTLE_ORDER.length])

const record = (kind: 'castle' | 'timeattack' | 'bugrush', correct: number, total: number) =>
  db.attempts.add({ track: 'game', node: kind, kind, date: new Date().toISOString(), correct, total, passed: true })

const bestOf = (attempts: { kind: string; correct: number }[], kind: string) => Math.max(0, ...attempts.filter(a => a.kind === kind).map(a => a.correct))

function Castle({ pool }: { pool: Pool }) {
  const quick = useMemo(() => choices(pool.exercises, pool.mcqs), [pool])
  const [run, setRun] = useState(() => String(Date.now()))
  const [floor, setFloor] = useState(1)
  const [tries, setTries] = useState(0)
  const maxLives = castleLives(useCompanion().id)
  const [lives, setLives] = useState(maxLives)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const rooms = useRef(0)
  const best = bestOf(useAttempts(), 'castle')
  const room = useMemo(() => castleRoom(floor, pool.exercises, quick, `${run}:${tries}`), [floor, tries, run, pool, quick])

  const finish = (cleared: number) => { record('castle', cleared, rooms.current); setOver(cleared) }
  const answer = (ok: boolean) => { rooms.current++; setAnswered(ok) }
  function next() {
    if (answered) setFloor(f => f + 1)
    else if (lives - 1 <= 0) return finish(floor - 1)
    else { setLives(l => l - 1); setTries(t => t + 1) }
    setAnswered(null)
  }
  if (!room) return <><h1>Infinity Castle</h1><p className="muted">Buka beberapa bab dulu. Kastil butuh soal dari bab yang sudah terbuka.</p></>
  if (over !== null)
    return (
      <>
        <Hud title="Kastil runtuh!" expr={over > best ? 'victory' : 'encourage'}><span>Lantai dilewati: <b>{over}</b> · rekor {Math.max(best, over)}</span></Hud>
        <button className="btn-primary" onClick={() => { setRun(String(Date.now())); setFloor(1); setLives(maxLives); setTries(0); setAnswered(null); rooms.current = 0; setOver(null) }}>Masuk lagi</button>
      </>
    )
  return (
    <>
      <Hud title={room.boss ? `Lantai ${floor}: BOSS` : `Lantai ${floor}`} expr={answered === null ? 'focus' : answered ? 'happy' : 'encourage'}>
        <Hearts n={lives} max={maxLives} /> <span className="muted small">rekor {best}</span>
      </Hud>
      {floor === 1 && answered === null && <BuffNote kinds={['castleLives']} />}
      {isBossFloor(floor) && (
        <div className="versus">
          <Chibi c={castleDemon(floor)} expr={answered === null ? 'happy' : answered ? 'encourage' : 'victory'} size={72} />
          <p className="feedback">{castleDemon(floor).name} menjaga lantai {floor}! Tulis kodenya, satu kali serah.</p>
        </div>
      )}
      {'choice' in room
        ? <ChoiceCard key={`${floor}:${tries}`} c={room.choice} onAnswer={answer} />
        : <Task key={`${floor}:${tries}`} ex={room.ex} once onResult={r => answer(r.every(x => x.pass))} />}
      {answered !== null && <button className="btn-primary" onClick={next}>{answered ? 'Naik ke lantai berikutnya' : lives - 1 <= 0 ? 'Lihat hasil' : 'Kehilangan 1 nyawa. Lanjut'}</button>}
      {answered === null && floor > 1 && <button className="btn-ghost" onClick={() => finish(floor - 1)}>Mundur dengan selamat (simpan lantai {floor - 1})</button>}
    </>
  )
}

function TimeAttack({ pool }: { pool: Pool }) {
  const quick = useMemo(() => shuffle(choices(pool.exercises, pool.mcqs)), [pool])
  const [state, setState] = useState<'ready' | 'play' | 'done'>('ready')
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const scoreRef = useRef({ score: 0, total: 0 })
  const best = bestOf(useAttempts(), 'timeattack')
  const seconds = timeAttackSeconds(useCompanion().id)
  const left = useCountdown(seconds, state === 'play', () => { record('timeattack', scoreRef.current.score, scoreRef.current.total); setState('done') })
  if (quick.length < 3) return <p className="muted">Belum cukup soal pilihan cepat dari bab yang terbuka.</p>
  if (state === 'ready')
    return (
      <>
        <Hud title="Time Attack" expr="focus"><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} menit, jawab sebanyak mungkin. Rekor: <b>{best}</b></span></Hud>
        <BuffNote kinds={['timeMul']} />
        <button className="btn-primary" onClick={() => { scoreRef.current = { score: 0, total: 0 }; setScore(0); setI(0); setState('play') }}>Mulai!</button>
      </>
    )
  if (state === 'done')
    return (
      <>
        <Hud title="Waktu habis!" expr={scoreRef.current.score >= best ? 'victory' : 'encourage'}><span>Benar <b>{scoreRef.current.score}</b> dari {scoreRef.current.total} · rekor {Math.max(best, scoreRef.current.score)}</span></Hud>
        <button className="btn-primary" onClick={() => setState('ready')}>Main lagi</button>
      </>
    )
  const answer = (ok: boolean) => {
    scoreRef.current.total++
    if (ok) { scoreRef.current.score++; setScore(s => s + 1) }
    setTimeout(() => setI(n => n + 1), 250)
  }
  return (
    <>
      <Hud title="Time Attack" expr="focus"><span className="timer">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span> <span>Skor <b>{score}</b></span></Hud>
      <ChoiceCard key={i} c={quick[i % quick.length]} onAnswer={answer} fast />
    </>
  )
}

function BugRush({ pool }: { pool: Pool }) {
  const [state, setState] = useState<'ready' | 'play' | 'done'>('ready')
  const [run, setRun] = useState('')
  const [i, setI] = useState(0)
  const [flash, setFlash] = useState<boolean | null>(null)
  const s = useRef({ score: 0, total: 0, combo: 0 })
  const best = bestOf(useAttempts(), 'bugrush')
  const seconds = bugRushSeconds(useCompanion().id)
  const left = useCountdown(seconds, state === 'play', () => { record('bugrush', s.current.score, s.current.total); setState('done') })
  const item = useMemo(() => rushItem(pool.exercises, `${run}:${i}`), [pool, run, i])
  if (!rushItem(pool.exercises, 'cek')) return <p className="muted">Belum ada Bug Hunt di bab yang terbuka.</p>
  if (state === 'ready')
    return (
      <>
        <Hud title="Bug Rush" expr="focus"><span>{seconds} detik. Ada bug atau aman? Rekor: <b>{best}</b></span></Hud>
        <BuffNote kinds={['rushSec']} />
        <button className="btn-primary" onClick={() => { s.current = { score: 0, total: 0, combo: 0 }; setRun(String(Date.now())); setI(0); setState('play') }}>Mulai!</button>
      </>
    )
  if (state === 'done')
    return (
      <>
        <Hud title="Waktu habis!" expr={s.current.score >= best ? 'victory' : 'encourage'}><span>Skor <b>{s.current.score}</b> dari {s.current.total} kode · rekor {Math.max(best, s.current.score)}</span></Hud>
        <button className="btn-primary" onClick={() => setState('ready')}>Main lagi</button>
      </>
    )
  const jawab = (buggy: boolean) => {
    const ok = buggy === item!.buggy
    s.current.total++
    s.current.combo = ok ? s.current.combo + 1 : 0
    if (ok) s.current.score++
    setFlash(ok)
    setI(n => n + 1)
  }
  return (
    <>
      <Hud title="Bug Rush" expr={flash === null ? 'focus' : flash ? 'happy' : 'encourage'}>
        <span className="timer">{left}s</span> <span>Skor <b>{s.current.score}</b></span> {s.current.combo > 1 && <span className="combo">combo ×{s.current.combo}</span>}
      </Hud>
      <pre className={`code rush ${flash === null ? '' : flash ? 'right' : 'wrong'}`} key={i}>{item!.code}</pre>
      <div className="row-actions rush-btn">
        <button className="btn-ghost danger" onClick={() => jawab(true)}>🐛 Ada bug</button>
        <button className="btn-ghost" onClick={() => jawab(false)}>✓ Aman</button>
      </div>
    </>
  )
}

function Raid({ pool }: { pool: Pool }) {
  const { week, boss, problems } = useWeekRaid(pool)
  const attempts = useAttempts('game')
  const [open, setOpen] = useState<string | null>(null)
  const st = raidState(problems, attempts, week)
  const tumbang = attempts.some(a => a.node === raidDefeatNode(week))
  useEffect(() => {
    if (st.defeated && !tumbang) db.attempts.add({ track: 'game', node: raidDefeatNode(week), kind: 'raid', date: new Date().toISOString(), correct: 0, total: 0, passed: true })
  }, [st.defeated, tumbang, week])
  if (!problems.length) return <p className="muted">Boss belum muncul. Buka bab dengan soal ber-test case dulu.</p>
  return (
    <>
      <section className="hero boss">
        <div className="sprites">{boss.sprites.map(id => <Chibi key={id} c={demonById(id)} expr={st.defeated ? 'encourage' : st.dealt ? 'focus' : 'happy'} size={boss.sprites.length > 1 ? 64 : 88} />)}</div>
        <div className="grow"><h1>{boss.name}</h1><span className="muted small">{boss.rank} · minggu {week.slice(-3)}</span></div>
      </section>
      <div className="hp" role="progressbar" aria-label="HP Upper Moon" aria-valuenow={st.left} aria-valuemax={st.hp}><i style={{ width: `${(st.left / st.hp) * 100}%` }} /></div>
      <p className="muted small">HP {st.left}/{st.hp}. Setiap test case yang lolos memberi 1 damage (rekor terbaik per soal).</p>
      {st.defeated && <p className="feedback right"><b>{boss.name} tumbang!</b> Upper Moon minggu ini berhasil ditebas.</p>}
      <ul className="tracks">
        {problems.map((p, k) => (
          <li key={p.id}>
            <button className="card track raid-item" onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span className="grow"><b>{st.dmg[k] === p.tests.length && '✓ '}{p.title}</b><small>damage {st.dmg[k]}/{p.tests.length} · {'★'.repeat(p.difficulty)}</small></span>
            </button>
            {open === p.id && (
              <div className="raid-task">
                <Task key={p.id} ex={p} onResult={r => db.attempts.add({ track: 'game', node: raidNode(week, p.id), kind: 'raid', date: new Date().toISOString(), correct: r.filter(x => x.pass).length, total: r.length, passed: r.every(x => x.pass) })} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Kata({ pool }: { pool: Pool }) {
  const kata = useTodayKata(pool)
  const attempts = useAttempts()
  if (kata === undefined) return null
  if (!kata) return <p className="muted">Belum ada soal menulis kode di bab yang terbuka. Mulai sebuah track dulu.</p>
  const solved = attempts.some(a => a.kind === 'exercise' && a.node === kata.id && a.passed)
  const s = streak(attempts.filter(a => a.kind === 'kata').map(a => a.date))
  return (
    <>
      <p className="muted small">Streak Kata: <b>{s}</b> hari. Satu soal baru setiap hari.</p>
      <ExerciseView key={kata.id} ex={kata} kata solved={solved} next="/" nextLabel="Kembali ke Beranda" />
    </>
  )
}

const MODES: Record<string, (p: { pool: Pool }) => React.ReactNode> = { kata: Kata, castle: Castle, raid: Raid, time: TimeAttack, rush: BugRush }

export default function GamePage() {
  const { mode = '' } = useParams()
  const pool = useGamePool()
  const M = MODES[mode]
  if (!M) return <Navigate to="/latihan" replace />
  return (
    <div className="page game">
      <small className="muted"><Link to="/latihan">← Latihan</Link></small>
      {pool ? <M pool={pool} /> : <p className="muted">Memuat…</p>}
    </div>
  )
}
