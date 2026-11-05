import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
import { projectsHash, sourceHash } from '../scripts/build-content'

// Validasi penuh (menjalankan semua solusi) ada di `npm run content`; di sini cukup pastikan hasilnya tidak basi.
for (const track of readdirSync('content').filter(t => t !== 'projects' && t !== 'olymp' && t !== 'ctf' && readdirSync(`content/${t}`).some(f => f !== 'placement.yaml'))) {
  it(`src/generated/${track}.json sesuai sumber (jalankan npm run content kalau gagal)`, () => {
    expect(existsSync(`src/generated/${track}.json`)).toBe(true)
    expect(JSON.parse(readFileSync(`src/generated/${track}.json`, 'utf8')).hash).toBe(sourceHash(track))
  })
}

it('setiap jenis latihan (PRD bagian 6) punya ≥ 10 soal', async () => {
  const { TYPE_LABEL } = await import('./data/exercise-types')
  const count: Record<string, number> = {}
  for (const f of readdirSync('src/generated').filter(f => f.endsWith('.json')))
    for (const ch of Object.values(JSON.parse(readFileSync(`src/generated/${f}`, 'utf8')).chapters) as { exercises: { type: string }[] }[])
      for (const e of ch.exercises) count[e.type] = (count[e.type] ?? 0) + 1
  for (const t of Object.keys(TYPE_LABEL)) expect(count[t] ?? 0, t).toBeGreaterThanOrEqual(10)
})

it('project Swordsmith Village sesuai sumber, ≥ 8 project dengan ≥ 3 tahap ber-test', () => {
  const pj = JSON.parse(readFileSync('src/generated/meta/projects.json', 'utf8'))
  expect(pj.hash).toBe(projectsHash())
  expect(pj.projects.length).toBeGreaterThanOrEqual(8)
  for (const p of pj.projects) {
    expect(p.stages.length, p.id).toBeGreaterThanOrEqual(3)
    for (const st of p.stages) expect(st.tests.length, `${p.id}: ${st.title}`).toBeGreaterThanOrEqual(1)
  }
})
