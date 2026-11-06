// Layar HP: tidak boleh bisa digeser ke samping (terutama setelah input salah), dan Gulungan Pelajaran bisa dimainkan.
import { expect, test } from '@playwright/test'
import { onboard, setProgress, typeCode } from './helpers'

test.use({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true })

const fits = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('input salah dengan output/error panjang tidak membuat layar bisa digeser', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [], c: [] })
  for (const [path, code] of [
    ['/latihan/python/py-f1-dua-baris', 'print("output_panjang_tanpa_spasi_" * 8)'],
    ['/latihan/python/py-halo', 'raise ValueError("error_panjang_tanpa_spasi_" * 6)'],
    ['/latihan/c/c-halo', 'int main() { printf("x") return 0 }'],
  ]) {
    await page.goto(path)
    await typeCode(page, code)
    await page.click('button:has-text("Tebas! Jalankan tes")')
    await expect(page.locator('.results')).toBeVisible({ timeout: 120_000 })
    expect(await fits(page), path).toBe(true)
  }
})

test('Gulungan Pelajaran: mentor bercerita, tebak lalu jalankan, sampai tuntas', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [] })
  await page.goto('/belajar/python/bab/f1')
  await expect(page.locator('.lesson-step .bubble p').first()).toBeVisible()
  for (let i = 0; i < 40 && !(await page.locator('.lesson-done').count()); i++) {
    if (await page.locator('.quick').count()) {
      for (const q of await page.locator('.quick').all()) {
        if (await q.locator('.opt').count()) await q.locator('.opt').first().click()
        else { await q.locator('textarea, input').first().fill('x'); await q.locator('button').first().click() }
      }
      await page.click('button:has-text("Selesaikan gulungan")')
      break
    }
    await page.locator('.lesson-step .row-actions button.btn-primary').last().click()
  }
  await expect(page.locator('.lesson-done')).toContainText('Pelajaran tuntas')
  expect(await fits(page)).toBe(true)
})
