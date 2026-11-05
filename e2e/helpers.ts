import { expect, type Page } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'

type Ex = { id: string; track: string; chapter: string; solutions: string[] }
export const EXERCISES: Ex[] = readdirSync('src/generated').filter(f => f.endsWith('.json'))
  .flatMap(f => Object.values(JSON.parse(readFileSync(`src/generated/${f}`, 'utf8')).chapters as Record<string, { exercises: Ex[] }>).flatMap(c => c.exercises))
export const ex = (id: string) => EXERCISES.find(e => e.id === id)!

export async function onboard(page: Page, goal = 'Kerja jadi backend dev') {
  await page.goto('/')
  await page.waitForURL('**/mulai')
  for (const t of [goal, 'Lanjut', 'Pernah coba sedikit', 'Lanjut', '30 menit', 'Lanjut', 'Lanjut', 'Mulai perjalanan']) await page.click(`text=${t}`)
  await page.waitForURL(/\/$/)
}

// Isi editor CodeMirror (insertText: tanpa auto-indent).
export async function typeCode(page: Page, code: string) {
  // Tunggu halaman stabil (konten lazy & data IndexedDB termuat) agar editor tidak dipasang ulang setelah diketik.
  await page.waitForSelector('.cm-content')
  await page.waitForLoadState('networkidle')
  await page.click('.cm-content')
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(code)
}

// Atur progres langsung di IndexedDB lewat modul aplikasi (dev server).
export async function setProgress(page: Page, entries: Record<string, 'all' | string[]>) {
  await page.evaluate(async entries => {
    const { db } = await import('/src/db.ts')
    const { nodesOf } = await import('/src/data/curriculum.ts')
    for (const [track, v] of Object.entries(entries)) await db.progress.put({ track, passed: v === 'all' ? nodesOf(track).filter(n => !n.boss).map(n => n.id) : v })
  }, entries)
}

export async function solve(page: Page, id: string) {
  const e = ex(id)
  await page.goto(`/latihan/${e.track}/${id}`)
  await page.waitForSelector('.cm-content')
  await typeCode(page, e.solutions[0])
  await page.click('button:has-text("Tebas! Jalankan tes")')
  await expect(page.locator('.win h2')).toBeVisible({ timeout: 120_000 })
}
