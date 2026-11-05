// Uji "maksimal 3 tap": setiap fitur utama harus bisa dicapai paling banyak 3 klik tautan dari Beranda.
// BFS atas tautan internal (a[href]) yang terlihat di setiap halaman; satu klik tautan = satu tap.
import { expect, test } from '@playwright/test'
import { onboard, setProgress } from './helpers'

const FEATURES: [string, RegExp][] = [
  ['Belajar', /^\/belajar$/], ['Skill tree track', /^\/belajar\/[\w-]+$/], ['Pelajaran bab', /^\/belajar\/[\w-]+\/bab\/[\w-]+$/],
  ['Latihan', /^\/latihan$/], ['Soal latihan', /^\/latihan\/[\w-]+\/[\w-]+$/], ['Playground', /^\/playground$/],
  ['Profil', /^\/profil$/], ['Karakter', /^\/karakter$/], ['Gacha', /^\/gacha$/], ['Pencapaian', /^\/pencapaian$/], ['Ubah jalur', /^\/jalur$/],
  ['Daily Kata', /^\/game\/kata$/], ['Infinity Castle', /^\/game\/castle$/], ['Boss Raid', /^\/game\/raid$/], ['Time Attack', /^\/game\/time$/], ['Bug Rush', /^\/game\/rush$/],
  ['Visualizer DSA', /^\/visual$/], ['Swordsmith Village', /^\/desa$/], ['Butterfly Mansion', /^\/mansion$/], ['Hashira Trial', /^\/olimpiade$/],
  ['Terminal Linux', /^\/terminal$/], ['CTF Arena', /^\/ctf$/],
]

test('semua fitur utama ≤ 3 tap dari Beranda', async ({ page }) => {
  await onboard(page)
  await setProgress(page, { python: [] }) // pengguna yang baru mulai satu track
  const depth = new Map<string, number>([['/', 0]])
  let frontier = ['/']
  for (let d = 1; d <= 3; d++) {
    const next: string[] = []
    for (const path of frontier) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const hrefs = await page.$$eval('a[href]', as => as.filter(a => (a as HTMLElement).offsetParent !== null).map(a => a.getAttribute('href')!).filter(h => h.startsWith('/')))
      for (const h of hrefs) {
        const clean = h.split('?')[0].split('#')[0]
        if (!depth.has(clean)) { depth.set(clean, d); next.push(clean) }
      }
    }
    frontier = next
  }
  const report = FEATURES.map(([name, re]) => { const hit = [...depth].filter(([p]) => re.test(p)).sort((a, b) => a[1] - b[1])[0]; return { name, path: hit?.[0], taps: hit?.[1] } })
  console.table(report)
  for (const r of report) expect(r.taps, `${r.name} tidak tercapai ≤ 3 tap`).toBeLessThanOrEqual(3)
})
