import { describe, expect, it } from 'vitest'
import { BASE_PAL, EXPRESSIONS, chibiRows } from './rig'
import { CHARACTERS, STARTERS } from './roster'
import { DEMONS } from './demons'

const ALL = [...CHARACTERS, ...DEMONS]

describe('karakter & iblis (pixel art orisinal)', () => {
  it('minimal 20 Slayer + 10 iblis, id unik', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(20)
    expect(DEMONS).toHaveLength(10)
    expect(new Set(ALL.map(c => c.id)).size).toBe(ALL.length)
    expect(STARTERS.every(id => CHARACTERS.some(c => c.id === id))).toBe(true)
  })
  it('setiap ekspresi 32×32 dan setiap piksel punya warna di palet', () => {
    for (const c of ALL) for (const e of EXPRESSIONS) {
      const rows = chibiRows(c, e)
      expect(rows).toHaveLength(32)
      const pal = { ...BASE_PAL, ...c.pal }
      for (const r of rows) {
        expect(r).toHaveLength(32)
        for (const k of r) if (k !== '.') expect(pal[k], `${c.id}/${e} warna '${k}'`).toBeDefined()
      }
    }
  })
  it('lima ekspresi berbeda dan tiap karakter punya sprite sendiri', () => {
    for (const c of ALL) expect(new Set(EXPRESSIONS.map(e => chibiRows(c, e).join())).size, c.id).toBe(5)
    const idle = ALL.map(c => chibiRows(c, 'idle').join() + JSON.stringify(c.pal))
    expect(new Set(idle).size).toBe(ALL.length)
  })
  it('lembar sprite tidak memuat bagian rig yang salah ukuran', () => {
    for (const c of ALL) {
      expect(c.hair.every(r => r.length === 10), `${c.id} rambut`).toBe(true)
      if (c.body) expect(c.body.length === 14 && c.body.every(r => r.length === 10), `${c.id} badan`).toBe(true)
      for (const f of Object.values(c.faces ?? {})) expect(f!.every(r => r.length === 14), `${c.id} wajah`).toBe(true)
    }
  })
})
