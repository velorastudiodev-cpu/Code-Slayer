import { Suspense, lazy, useEffect } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useProfile, useSettings } from './db'
import { Icon } from './pixel'
import { useCompanion, useEconomy } from './wallet'
import { AchievementToast } from './Toast'
import { setPublicCompiler, setUserApi } from './run'
import Home from './pages/Home'
import Learn from './pages/Learn'
import Track from './pages/Track'
import Onboarding, { PathPage } from './pages/Onboarding'
import Profile from './pages/Profile'
import Characters, { CharacterDetail } from './pages/Characters'
import Achievements from './pages/Achievements'
import Practice from './pages/Practice'

// Editor & runtime berat: dimuat hanya saat dibutuhkan.
const ExercisePage = lazy(() => import('./pages/Exercise'))
const Playground = lazy(() => import('./pages/Playground'))
const Placement = lazy(() => import('./pages/Quiz').then(m => ({ default: m.Placement })))
const Exam = lazy(() => import('./pages/Quiz').then(m => ({ default: m.Exam })))
const ChapterPage = lazy(() => import('./pages/Chapter'))
const Visual = lazy(() => import('./pages/Visual'))
const GamePage = lazy(() => import('./pages/Games'))
const Gacha = lazy(() => import('./pages/Gacha'))
const Village = lazy(() => import('./pages/Village'))
const ProjectPage = lazy(() => import('./pages/Village').then(m => ({ default: m.ProjectPage })))
const Mansion = lazy(() => import('./pages/Mansion'))
const TerminalPage = lazy(() => import('./pages/TerminalPage'))
const CtfArena = lazy(() => import('./pages/Ctf'))
const CtfLab = lazy(() => import('./pages/Ctf').then(m => ({ default: m.CtfLab })))
const TrialHub = lazy(() => import('./pages/Trial'))
const TrialStage = lazy(() => import('./pages/Trial').then(m => ({ default: m.TrialStage })))
const TrialObjective = lazy(() => import('./pages/Trial').then(m => ({ default: m.TrialObjective })))
const TrialTopics = lazy(() => import('./pages/Trial').then(m => ({ default: m.TrialTopics })))
const TrialCp = lazy(() => import('./pages/Trial').then(m => ({ default: m.TrialCp })))
const TrialStei = lazy(() => import('./pages/Trial').then(m => ({ default: m.TrialStei })))
const TrialProblem = lazy(() => import('./pages/TrialProblem'))
const ContestList = lazy(() => import('./pages/TrialProblem').then(m => ({ default: m.ContestList })))
const ContestSession = lazy(() => import('./pages/TrialProblem').then(m => ({ default: m.ContestSession })))
const MansionSession = lazy(() => import('./pages/Mansion').then(m => ({ default: m.MansionSession })))

const TABS = [
  { to: '/', icon: 'home', label: 'Beranda' },
  { to: '/belajar', icon: 'scroll', label: 'Belajar' },
  { to: '/latihan', icon: 'sword', label: 'Latihan' },
  { to: '/playground', icon: 'term', label: 'Playground' },
  { to: '/profil', icon: 'slayer', label: 'Profil' },
] as const

const Soon = ({ title, when }: { title: string; when: string }) => (
  <div className="page">
    <h1>{title}</h1>
    <p className="muted">Dibuka di {when}.</p>
  </div>
)

// Saldo Koban selalu terlihat, satu tap ke Gacha.
function KobanChip() {
  const { koban } = useEconomy()
  return <Link className="koban" to="/gacha" aria-label={`${koban} Koban, buka Gacha`}><Icon name="coin" size={18} /> <b>{koban}</b></Link>
}

export default function App() {
  const s = useSettings()
  const companion = useCompanion()
  const profile = useProfile()
  const { pathname } = useLocation()
  useEffect(() => {
    const root = document.documentElement
    if (s.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = s.theme
    root.dataset.motion = s.reduceMotion ? 'reduce' : 'full'
    root.style.setProperty('--accent', companion.accent)
    root.style.setProperty('--editor-font', `${s.editorFont}px`)
  }, [s.theme, s.reduceMotion, companion.accent, s.editorFont])
  useEffect(() => { setUserApi(s.execServer || null) }, [s.execServer])
  useEffect(() => { setPublicCompiler(s.publicCompiler ?? true) }, [s.publicCompiler])

  if (profile === undefined) return null
  const onboarding = pathname === '/mulai'
  if (profile === null && !onboarding) return <Navigate to="/mulai" replace />

  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo">鬼殺コード <b>Code Slayer</b></span>
        {profile && <KobanChip />}
      </header>
      <main>
        <Suspense fallback={<p className="muted">Memuat…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mulai" element={<Onboarding />} />
          <Route path="/jalur" element={<PathPage />} />
          <Route path="/belajar" element={<Learn />} />
          <Route path="/belajar/:track" element={<Track />} />
          <Route path="/belajar/:track/bab/:chapter" element={<ChapterPage />} />
          <Route path="/belajar/:track/seleksi" element={<Placement />} />
          <Route path="/belajar/:track/ujian/:node" element={<Exam />} />
          <Route path="/latihan" element={<Practice />} />
          <Route path="/latihan/:track/:id" element={<ExercisePage />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/karakter" element={<Characters />} />
          <Route path="/karakter/:id" element={<CharacterDetail />} />
          <Route path="/gacha" element={<Gacha />} />
          <Route path="/pencapaian" element={<Achievements />} />
          <Route path="/game/:mode" element={<GamePage />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/ctf" element={<CtfArena />} />
          <Route path="/ctf/:id" element={<CtfLab />} />
          <Route path="/desa" element={<Village />} />
          <Route path="/desa/:id" element={<ProjectPage />} />
          <Route path="/mansion" element={<Mansion />} />
          <Route path="/mansion/sesi/:mode" element={<MansionSession />} />
          <Route path="/olimpiade" element={<TrialHub />} />
          <Route path="/olimpiade/tahap/:stage" element={<TrialStage />} />
          <Route path="/olimpiade/objektif/:key" element={<TrialObjective />} />
          <Route path="/olimpiade/soal/:id" element={<TrialProblem />} />
          <Route path="/olimpiade/kontes" element={<ContestList />} />
          <Route path="/olimpiade/kontes/:id/:run" element={<ContestSession />} />
          <Route path="/olimpiade/topik" element={<TrialTopics />} />
          <Route path="/olimpiade/cp" element={<TrialCp />} />
          <Route path="/olimpiade/stei" element={<TrialStei />} />
          <Route path="/visual" element={<Visual />} />
          <Route path="/visual/:algo" element={<Visual />} />
          <Route path="*" element={<Soon title="Tersesat di hutan" when="—" />} />
        </Routes>
        </Suspense>
      </main>
      {profile && <AchievementToast />}
      {!onboarding && (
        <nav className="tabs" aria-label="Navigasi utama">
          {TABS.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}>
              <Icon name={t.icon} size={22} />
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
