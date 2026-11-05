// Alur utama Code Slayer (acceptance M12): belajar → latihan dinilai → game → ekonomi → project → review → olimpiade.
import { expect, test } from '@playwright/test'
import { ex, onboard, setProgress, solve, typeCode } from './helpers'

test.describe.configure({ mode: 'serial' })

test('onboarding → Beranda dengan misi harian & jalur', async ({ page }) => {
  await onboard(page)
  await expect(page.locator('h2:has-text("Misi Harian")')).toBeVisible()
  await page.click('nav >> text=Belajar')
  await expect(page.locator('h1:has-text("Jalurmu")')).toBeVisible()
})

test('Final Selection menentukan bab awal; bab terkunci tidak bisa dilompati', async ({ page }) => {
  await onboard(page)
  await page.goto('/latihan/python/' + ex('py-f7-fpb').id)
  await expect(page.locator('h1:has-text("Terkunci")')).toBeVisible()
})

test('soal kode dinilai test case; salah → penjelasan, benar → XP & Koban', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [] })
  const e = ex('py-f1-dua-baris')
  await page.goto(`/latihan/python/${e.id}`)
  await typeCode(page, 'print("salah")')
  await expect(page.locator('.cm-content')).toContainText('salah')
  await page.click('button:has-text("Tebas! Jalankan tes")')
  await expect(page.locator('.results h2')).toContainText('tes lolos', { timeout: 120_000 })
  await expect(page.locator('.win')).toHaveCount(0)
  await solve(page, e.id)
  await expect(page.locator('.win h2')).toContainText('XP')
})

test('bahasa compiled (C) berjalan di server eksekusi', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { c: [] })
  await solve(page, 'c-halo')
})

test('Playground menjalankan kode bebas', async ({ page }) => {
  await onboard(page)
  await page.click('nav >> text=Playground')
  await typeCode(page, 'print(6 * 7)')
  await page.click('button:has-text("Jalankan")')
  await expect(page.locator('pre:has-text("42")')).toBeVisible({ timeout: 120_000 })
})

test('mode game: Daily Kata & Infinity Castle terbuka', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [] })
  await page.goto('/game/castle')
  await expect(page.locator('main h1')).toBeVisible()
  await page.goto('/game/kata')
  await expect(page.locator('main h1')).toBeVisible()
})

test('ekonomi: Koban dari latihan, pencapaian & gacha', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [] })
  await solve(page, 'py-halo')
  await page.goto('/pencapaian')
  await expect(page.locator('main h1')).toContainText('Pencapaian')
  await page.goto('/gacha')
  await expect(page.locator('main h1')).toBeVisible()
})

test('Swordsmith Village: tahap project dinilai dengan tes', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: 'all' })
  await page.goto('/desa/todo-cli')
  await page.click('button:has-text("Tempa! Jalankan tes")')
  await expect(page.locator('.results')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('.win')).toHaveCount(0)
})

test('Butterfly Mansion: kesalahan masuk Mistake Journal & jadwal review', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [] })
  await page.goto('/latihan/python/py-f1-dua-baris')
  await typeCode(page, 'print(1)')
  await page.click('button:has-text("Tebas! Jalankan tes")')
  await expect(page.locator('.results')).toBeVisible({ timeout: 120_000 })
  await page.goto('/mansion')
  await expect(page.locator('h2:has-text("1 kartu jatuh tempo")')).toBeVisible()
})

test('Hashira Trial: terkunci sebelum Kinoe; kontes ber-timer setelah terbuka', async ({ page }) => {
  await onboard(page)
  await page.goto('/olimpiade')
  await expect(page.locator('.badge:has-text("terkunci")')).toBeVisible()
  await setProgress(page, { python: 'all', dsa: 'all' })
  await page.goto('/olimpiade/kontes')
  await page.locator('section.contest:has-text("Simulasi OSN-P") button:has-text("Mulai simulasi")').click()
  await expect(page.locator('.contest-bar .timer')).toContainText('2:59:')
})

test('Terminal Linux: shell simulasi dengan filesystem virtual', async ({ page }) => {
  await onboard(page)
  await page.goto('/terminal')
  await page.fill('.terminal input', 'ls misi')
  await page.press('.terminal input', 'Enter')
  await expect(page.locator('.terminal [role=log]')).toContainText('laporan.txt')
})

test('CTF Arena: ikrar etika → eksploit lab sandbox → flag tervalidasi', async ({ page }) => {
  await onboard(page)
  await page.goto('/ctf')
  await expect(page.locator('h1:has-text("Ikrar Etika")')).toBeVisible()
  for (const c of await page.locator('input[type=checkbox]').all()) await c.check()
  await page.click('button:has-text("Aku berikrar")')
  await expect(page.locator('h1:has-text("CTF Arena")')).toBeVisible()
  await page.goto('/ctf/web-idor')
  await page.waitForSelector('.lab-web')
  await page.fill('.lab-web input[aria-label=URL]', '/api/surat/1041')
  await page.click('button:has-text("Kirim request")')
  const flag = /SLAYER\{[^}]+\}/.exec(await page.locator('.response pre').innerText())![0]
  await page.fill('input[aria-label=Flag]', 'SLAYER{salah}')
  await page.click('button:has-text("Serahkan flag")')
  await expect(page.locator('.flag-form .feedback.wrong')).toBeVisible()
  await page.fill('input[aria-label=Flag]', flag)
  await page.click('button:has-text("Serahkan flag")')
  await expect(page.locator('h2:has-text("Flag valid")')).toBeVisible()
})
