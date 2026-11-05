// Sinkron kartu Butterfly Mansion dengan riwayat soal: soal baru (gagal/lulus) otomatis jadi kartu.
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useAttempts, type Card } from '../db'
import { dueCards, newCards } from './srs'

export function useCards(): Card[] | undefined {
  const attempts = useAttempts()
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  useEffect(() => {
    if (!attempts.length) return
    // Baca ulang id di dalam transaksi: dua hook yang sinkron bersamaan tidak membuat kartu ganda / menimpa jadwal.
    db.transaction('rw', db.cards, async () => {
      const fresh = newCards(attempts, new Set((await db.cards.toCollection().primaryKeys()) as string[]))
      if (fresh.length) await db.cards.bulkAdd(fresh)
    }).catch(() => {})
  }, [attempts])
  return cards
}

export const useDueCount = () => {
  const cards = useCards()
  return cards ? dueCards(cards).length : 0
}
