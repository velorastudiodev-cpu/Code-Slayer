import { parse } from 'yaml'
import { useEffect, useState } from 'react'
import type { Exercise } from './exercise-types'
import { nodesOf } from './curriculum'

// Konten = data YAML di /content, dimuat lazy per track.
export type Mcq = { id: string; chapter: string; prompt: string; code?: string; options: string[]; explain?: string }

const banks = import.meta.glob('/content/*/placement.yaml', { query: '?raw', import: 'default' })

export const hasBank = (track: string) => `/content/${track}/placement.yaml` in banks

export function useBank(track: string) {
  const [bank, setBank] = useState<Mcq[] | null>(null)
  useEffect(() => {
    const load = banks[`/content/${track}/placement.yaml`]
    if (!load) return setBank([])
    load().then(raw => setBank(parse(raw as string)))
  }, [track])
  return bank
}

export const shuffle = <T,>(a: T[]) => a.map(v => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v)

export { TYPE_LABEL, type Exercise } from './exercise-types'

export type Lesson = { text: string; code?: string }
export type Chapter = { lesson: Lesson[]; exercises: Exercise[] }
export type TrackContent = { chapters: Record<string, Chapter> }

// Hasil `npm run content` (expected output dihitung dari solusi referensi), dimuat lazy per track.
const generated = import.meta.glob<TrackContent>('/src/generated/*.json', { import: 'default' })
export const exerciseTracks = Object.keys(generated).map(p => p.split('/').at(-1)!.replace('.json', ''))

export const loadTrack = (track: string): Promise<TrackContent> => generated[`/src/generated/${track}.json`]?.() ?? Promise.resolve({ chapters: {} })
export const loadBank = async (track: string): Promise<Mcq[]> => { const l = banks[`/content/${track}/placement.yaml`]; return l ? parse((await l()) as string) : [] }

export function useTrackContent(track: string) {
  const [c, setC] = useState<TrackContent | null>(null)
  useEffect(() => {
    const load = generated[`/src/generated/${track}.json`]
    if (load) load().then(setC)
    else setC({ chapters: {} })
  }, [track])
  return c
}

// Urut sesuai kurikulum.
export const allExercises = (c: TrackContent, track: string) => nodesOf(track).flatMap(n => c.chapters[n.id]?.exercises ?? [])

// Ujian: Lower Moon (bab) 4 soal, Upper Moon (level) 6 soal. Separuh pilihan ganda (kalau ada), sisanya soal kode.
export type ExamItem = { mcq: Mcq } | { ex: Exercise }
export function examItems(track: string, nodeId: string, bank: Mcq[], content: TrackContent): ExamItem[] {
  const nodes = nodesOf(track)
  const n = nodes.find(x => x.id === nodeId)
  if (!n) return []
  const ids = n.boss ? nodes.filter(x => x.level === n.level && !x.boss).map(x => x.id) : [n.id]
  const size = n.boss ? 6 : 4
  const mcq = shuffle(bank.filter(q => ids.includes(q.chapter))).slice(0, size / 2)
  const code = shuffle(ids.flatMap(id => content.chapters[id]?.exercises ?? [])).slice(0, size - mcq.length)
  const items = [...mcq.map(q => ({ mcq: q })), ...code.map(ex => ({ ex }))]
  return items.length === size && code.length >= 2 ? items : []
}
