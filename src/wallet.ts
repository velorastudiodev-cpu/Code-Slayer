// Hook ekonomi untuk UI + pembelian atomik (saldo dihitung ulang di dalam transaksi, jadi double-tap tidak bisa minus).
import { useMemo } from 'react'
import { db, useAllProgress, useAttempts, useSettings, useSpends, type Attempt, type Spend } from './db'
import { charById } from './characters/roster'
import type { Character } from './characters/rig'
import { achievementKoban, evaluate, stats } from './data/achievements'
import { activityDays, balance, freezeDays, itemById, slayerLevel, streakState, totalXp } from './data/economy'

export function computeEconomy(attempts: Parameters<typeof stats>[0], spends: Spend[], progress: Parameters<typeof stats>[2]) {
  const ach = evaluate(stats(attempts, spends, progress))
  const achKoban = achievementKoban(ach)
  const xp = totalXp(attempts)
  return {
    ach,
    achKoban,
    koban: balance(attempts, spends, achKoban),
    xp,
    level: slayerLevel(xp),
    streak: streakState(activityDays(attempts), freezeDays(spends)),
  }
}

export function useEconomy() {
  const attempts = useAttempts()
  const spends = useSpends()
  const progress = useAllProgress()
  const eco = useMemo(() => computeEconomy(attempts, spends, progress), [attempts, spends, progress])
  return { ...eco, attempts, spends, progress }
}

export class NotEnoughKoban extends Error {}

// Catat pengeluaran hanya kalau saldo cukup. `make` menerima saldo terkini dan mengembalikan baris pengeluaran.
export function buy(make: (koban: number, spends: Spend[], attempts: Attempt[]) => Spend[]) {
  return db.transaction('rw', db.attempts, db.spends, db.progress, async () => {
    const [attempts, spends, progress] = await Promise.all([db.attempts.toArray(), db.spends.toArray(), db.progress.toArray()])
    const { koban } = computeEconomy(attempts, spends, progress)
    const rows = make(koban, spends, attempts)
    if (rows.reduce((s, r) => s + r.cost, 0) > koban) throw new NotEnoughKoban()
    await db.spends.bulkAdd(rows)
    return rows
  })
}

// Companion yang sudah "berpakaian": skin haori, warna Nichirin, efek pernapasan dari gacha.
export function dress(c: Character, s: { skin?: string; nichirin?: string; effect?: string }): Character & { accent: string } {
  const skin = s.skin ? itemById(s.skin) : undefined
  const blade = s.nichirin ? itemById(s.nichirin) : undefined
  const fx = s.effect ? itemById(s.effect) : undefined
  return {
    ...c,
    pal: { ...c.pal, ...(c.haori ? skin?.pal : undefined), ...(blade?.color ? { x: blade.color } : undefined) },
    breath: fx?.fx ?? c.breath,
    accent: blade?.color ?? c.accent,
  }
}

export function useCompanion() {
  const s = useSettings()
  return dress(charById(s.companion), s)
}
