import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { ex, onboard, setProgress, typeCode } from './helpers'

type T = { input?: string; expected: string }
const testsOf = (file: string, id: string) => Object.values(JSON.parse(readFileSync(`src/generated/${file}.json`, 'utf8')).chapters as Record<string, { exercises: { id: string; tests: T[] }[] }>)
  .flatMap(c => c.exercises).find(x => x.id === id)!.tests

// APK tanpa server sendiri: bahasa compiled memakai cadangan wandbox.org. Wandbox ditiru (page.route), tidak ada request keluar.
test('APK tanpa server: C++ lewat wandbox.org (tiruan), Kotlin & juri olimpiade tetap butuh server', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { Capacitor: object }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' } })
  const sent: { compiler: string; stdin: string }[] = []
  await page.route('https://wandbox.org/api/**', async route => {
    const body = route.request().postDataJSON() as { compiler: string; code: string; stdin: string }
    sent.push(body)
    // Juri tiruan: jawab dengan output yang diharapkan tes (stdin dicocokkan oleh test di bawah).
    await route.fulfill({ json: { status: '0', program_output: expected.get(body.stdin) ?? '' } })
  })
  const e = ex('cpp-halo')
  const expected = new Map(testsOf('cpp', e.id).map(t => [t.input ?? '', t.expected]))
  await onboard(page)
  await setProgress(page, { cpp: [], mobile: [] })
  await page.goto(`/latihan/${e.track}/${e.id}`)
  await expect(page.getByText('wandbox.org').first()).toBeVisible()
  await typeCode(page, e.solutions[0])
  await page.click('button:has-text("Tebas! Jalankan tes")')
  await expect(page.locator('.results')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.results li.pass').first()).toBeVisible()
  await expect(page.locator('.results li.fail')).toHaveCount(0)
  expect(sent.length).toBeGreaterThan(0)
  expect(sent[0].compiler).toBe('gcc-13.2.0')

  await page.goto('/latihan/mobile/' + 'kt-f1-halo')
  await expect(page.getByText('Belum ada server eksekusi').first()).toBeVisible()
})
