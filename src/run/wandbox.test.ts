import { describe, expect, it } from 'vitest'
import { fromWandbox, javaForWandbox, runWandbox } from './wandbox'

describe('server publik Wandbox (respons tiruan)', () => {
  it('memetakan hasil: sukses, gagal kompilasi, runtime error, timeout', () => {
    expect(fromWandbox({ status: '0', program_output: '7\n' })).toEqual({ stdout: '7\n', stderr: '', ok: true })
    expect(fromWandbox({ status: '1', compiler_error: "prog.c:1: error: expected ';'" })).toMatchObject({ ok: false, stderr: "Gagal kompilasi:\nprog.c:1: error: expected ';'" })
    expect(fromWandbox({ status: '1', program_output: '', program_error: 'panic!' })).toMatchObject({ ok: false, stderr: 'panic!' })
    expect(fromWandbox({ status: '0', signal: 'Killed', program_output: '' })).toMatchObject({ ok: false, timeout: true })
    expect(fromWandbox({ status: '0', compiler_error: 'warning: unused', program_output: 'x\n' })).toMatchObject({ ok: true, stdout: 'x\n' })
  })
  it('Java: Main dibuat non-public + peluncur prog', () => {
    const j = javaForWandbox('public class Main { public static void main(String[] a) { System.out.println(1); } }')
    expect(j).toMatch(/^class Main/)
    expect(j).toContain('class prog { public static void main')
  })
  it('satu request per input, maksimal 2 bersamaan, urutan hasil terjaga; 429 & jaringan putus jadi pesan jelas', async () => {
    let live = 0, peak = 0
    const sent: { compiler: string; stdin: string; code: string }[] = []
    const fake = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string); sent.push(b)
      live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 5)); live--
      return new Response(JSON.stringify({ status: '0', program_output: `out ${b.stdin}` }))
    }) as typeof fetch
    const r = await runWandbox('cpp', 'int main(){}', ['a', 'b', 'c', 'd'], fake)
    expect(r.map(x => x.stdout)).toEqual(['out a', 'out b', 'out c', 'out d'])
    expect(peak).toBeLessThanOrEqual(2)
    expect(sent[0]).toMatchObject({ compiler: 'gcc-13.2.0' })
    const busy = (async () => new Response('slow down', { status: 429 })) as typeof fetch
    expect((await runWandbox('c', 'x', ['1'], busy))[0].stderr).toContain('sibuk')
    const down = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
    expect((await runWandbox('go', 'x', ['1'], down))[0]).toMatchObject({ ok: false, offline: true })
    expect((await runWandbox('kotlin', 'x', ['1'], fake))[0].stderr).toContain('tidak tersedia di server publik')
  })
})
