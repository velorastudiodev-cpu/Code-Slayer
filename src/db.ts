import Dexie, { liveQuery, type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'

export type Settings = {
  id: 'me'
  theme: 'system' | 'dark' | 'light'
  companion: string
  reduceMotion: boolean
  editorFont: number
  // Kosmetik dari gacha (id item, kosong = bawaan karakter).
  nichirin?: string
  skin?: string
  editorTheme?: string
  effect?: string
  // AI Mentor opsional (mati secara default): API key Anthropic milik user, hanya disimpan di perangkat ini.
  mentor?: boolean
  mentorKey?: string
  sound?: boolean // efek suara chiptune (bawaan: nyala)
  publicCompiler?: boolean // cadangan wandbox.org bila belum ada server sendiri (bawaan: nyala)
  execServer?: string // alamat server eksekusi untuk bahasa compiled (mis. https://slayer.domainku.com/api)
}

export type Profile = {
  id: 'me'
  goal: string
  experience: number
  minutesPerDay: number
  interests: string[]
  path: string[] // urutan track
}

// Ada baris = track sudah dimulai (lewat Final Selection atau mulai dari Bab 1).
export type Progress = { track: string; passed: string[] }

export type Attempt = {
  id?: number
  track: string
  node: string
  kind: 'placement' | 'exam' | 'exercise' | 'kata' | 'castle' | 'raid' | 'timeattack' | 'bugrush' | 'project' | 'review' | 'olymp' | 'contest' | 'arsip' | 'ctf' | 'lesson'
  date: string // ISO
  correct: number
  total: number
  passed: boolean
  meta?: { type?: string; xp?: number; err?: string; hints?: number; msg?: string } // exercise: jenis, XP soal, jenis error, hint yang dibuka, ringkasan kegagalan
  companion?: string // companion saat attempt dibuat (Bond & buff Koban); diisi otomatis
}

// Pengeluaran Koban. Saldo = Koban yang diperoleh (dihitung dari attempts & pencapaian) − (cost − refund).
export type Spend = {
  id?: number
  date: string
  kind: 'pull' | 'freeze' | 'hint'
  cost: number
  refund?: number // gacha duplikat
  item?: string // gacha: id item
  rarity?: number
  node?: string // hint: id soal
}

const DEFAULTS: Settings = { id: 'me', theme: 'system', companion: 'tanjiro', reduceMotion: false, editorFont: 15 }

export const db = new Dexie('code-slayer') as Dexie & {
  settings: EntityTable<Settings, 'id'>
  profile: EntityTable<Profile, 'id'>
  progress: EntityTable<Progress, 'track'>
  attempts: EntityTable<Attempt, 'id'>
  kv: EntityTable<{ key: string; value: unknown }, 'key'>
  spends: EntityTable<Spend, 'id'>
  cards: EntityTable<Card, 'id'>
  subs: EntityTable<Sub, 'id'>
  runs: EntityTable<ContestRun, 'id'>
  obj: EntityTable<ObjAnswer, 'id'>
}

// Hashira Trial (M11): submisi soal olimpiade, sesi virtual contest, jawaban soal objektif.
export type Sub = { id?: number; problem: string; run?: number; date: string; lang: string; code: string; earned: number[]; score: number }
export type ContestRun = { id?: number; contest: string; start: string; end?: string; seed: number; score?: number; max?: number; answers?: Record<string, string> }
export type ObjAnswer = { id?: number; q: string; topic: string; correct: boolean; date: string; run?: number }

// Kartu SRS Butterfly Mansion: satu per soal; jadwal dihitung FSRS (ts-fsrs), tanggal disimpan sebagai ISO.
export type Card = {
  id: string // id soal
  track: string
  source: 'mistake' | 'learned' // dari Mistake Journal atau soal yang sudah dikuasai
  due: string
  fsrs: Record<string, unknown>
  reviews: number
  lapses: number
}
db.version(1).stores({ settings: 'id' })
db.version(2).stores({ settings: 'id', profile: 'id', progress: 'track', attempts: '++id, track, date' })
// v3: kv untuk nilai yang dibekukan (soal Kata hari ini, soal Raid minggu ini).
db.version(3).stores({ settings: 'id', profile: 'id', progress: 'track', attempts: '++id, track, date', kv: 'key' })
// v4: pengeluaran Koban (gacha, Streak Freeze, hint).
db.version(4).stores({ settings: 'id', profile: 'id', progress: 'track', attempts: '++id, track, date', kv: 'key', spends: '++id, date, kind' })
// v5: kartu SRS (Butterfly Mansion).
db.version(5).stores({ settings: 'id', profile: 'id', progress: 'track', attempts: '++id, track, date', kv: 'key', spends: '++id, date, kind', cards: 'id, due, track' })
// v6: Hashira Trial (submisi, sesi kontes, jawaban objektif).
db.version(6).stores({ settings: 'id', profile: 'id', progress: 'track', attempts: '++id, track, date', kv: 'key', spends: '++id, date, kind', cards: 'id, due, track', subs: '++id, problem, run', runs: '++id, contest', obj: '++id, q, run' })

// Setiap attempt mencatat companion yang sedang aktif (sumber Bond & buff Koban).
let activeCompanion = DEFAULTS.companion
if (typeof indexedDB !== 'undefined') liveQuery(() => db.settings.get('me')).subscribe(s => { activeCompanion = s?.companion ?? DEFAULTS.companion })
db.attempts.hook('creating', (_, a) => { a.companion ??= activeCompanion })

export function useSettings(): Settings {
  const saved = useLiveQuery(() => db.settings.get('me'), [])
  return { ...DEFAULTS, ...saved }
}

export const saveSettings = (patch: Partial<Settings>) =>
  db.transaction('rw', db.settings, async () => {
    db.settings.put({ ...DEFAULTS, ...(await db.settings.get('me')), ...patch })
  })

// undefined = masih memuat, null = belum onboarding.
export const useProfile = () => useLiveQuery(() => db.profile.get('me').then(p => p ?? null), [])
export const useProgress = (track: string) => useLiveQuery(() => db.progress.get(track).then(p => p ?? null), [track])
export const useAllProgress = () => useLiveQuery(() => db.progress.toArray(), []) ?? []
export const useAttempts = (track?: string) =>
  useLiveQuery(() => (track ? db.attempts.where('track').equals(track).toArray() : db.attempts.toArray()), [track]) ?? []
export const useSpends = () => useLiveQuery(() => db.spends.toArray(), []) ?? []
