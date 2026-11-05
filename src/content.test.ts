import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
import { nodesOf, placeable } from './data/curriculum'
import type { Mcq } from './data/content'

for (const track of readdirSync('content').filter(t => existsSync(`content/${t}/placement.yaml`))) {
  it(`bank ${track}: valid, 2+ soal per bab placement`, () => {
    const bank: Mcq[] = parse(readFileSync(`content/${track}/placement.yaml`, 'utf8'))
    const ids = new Set(bank.map(q => q.id))
    expect(ids.size).toBe(bank.length)
    for (const q of bank) {
      expect(q.prompt && q.options.length === 4 && new Set(q.options).size === 4, q.id).toBe(true)
    }
    for (const ch of placeable(nodesOf(track))) expect(bank.filter(q => q.chapter === ch.id).length, ch.id).toBeGreaterThanOrEqual(2)
  })
}
