// Build lab Cyber & CTF Arena: content/ctf/labs.yaml → src/generated/meta/ctf.json
// Setiap lab DIBUKTIKAN bisa diselesaikan: solusinya dijalankan terhadap mesin lab yang sama dengan di browser,
// dan flag yang didapat harus persis sama dengan flag lab. Output hanya menyimpan flag ter-obfuscate + hash SHA-256.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'yaml'
import initSqlJs from 'sql.js'
import { chromium } from '@playwright/test'
import { FLAG_TOKEN, HTML_APPS, WEB_APPS, applyOps, crackmeCheck, encFlag, filterPackets, flagHash, htmlDoc, labShell, webRequest, type Packet } from '../src/labs/engine.ts'
import { md5, sha256 } from '../src/term/hash.ts'

const SRC = 'content/ctf/labs.yaml'
const OUT = 'src/generated/meta/ctf.json'
const CATS = ['web', 'crypto', 'forensics', 'rev', 'misc']
type Lab = { id: string; title: string; cat: string; points: number; kind: string; chapter?: string; story: string; task: string; hints: string[]; config: Record<string, unknown>; flag: string; solution: unknown; writeup: string; fix?: string }

export const ctfHash = () => createHash('sha1').update(readFileSync(SRC)).update(readFileSync('src/labs/engine.ts')).digest('hex').slice(0, 12)

async function prove(l: Lab, SQL: Awaited<ReturnType<typeof initSqlJs>>, html: (doc: string) => Promise<{ type: string; data: unknown }[]>): Promise<string> {
  const c = l.config
  switch (l.kind) {
    case 'web': {
      if (!WEB_APPS[c.app as string]) throw new Error(`app ${c.app} tidak ada`)
      let last = ''
      for (const r of l.solution as Parameters<typeof webRequest>[1][]) last = (await webRequest(c.app as string, r, { flag: l.flag, SQL })).body
      return last
    }
    case 'html': {
      const app = HTML_APPS[c.app as string]
      if (!app) throw new Error(`app html ${c.app} tidak ada`)
      const msgs = await html(htmlDoc(c.app as string, l.solution as string))
      if (!app.check(msgs)) throw new Error(`payload solusi tidak memicu eksploit (pesan: ${JSON.stringify(msgs)})`)
      // Kontrol negatif: input biasa tidak boleh dianggap eksploit.
      if (app.check(await html(htmlDoc(c.app as string, 'Tanjiro')))) throw new Error('input biasa dianggap eksploit')
      return l.flag
    }
    case 'terminal': {
      const sh = labShell(c.files as never, c.procs as never)
      const r = await sh.run(l.solution as string)
      return r.stdout
    }
    case 'crypto': return applyOps(c.cipher as string, l.solution as never)
    case 'hash': {
      const w = String(l.solution), h = c.algo === 'md5' ? md5(w) : sha256(w)
      if (h !== c.hash) throw new Error(`${c.algo}(${w}) ≠ hash lab`)
      if (c.wordlist && !(c.wordlist as string[]).includes(w)) throw new Error('jawaban tidak ada di wordlist')
      if (c.pins && !/^\d{4}$/.test(w)) throw new Error('PIN harus 4 digit')
      return `SLAYER{${w}}`
    }
    case 'crackme': {
      if (!crackmeCheck(c.code as string, String(l.solution))) throw new Error('kunci solusi ditolak periksa()')
      if (crackmeCheck(c.code as string, 'salah')) throw new Error('periksa() menerima kunci sembarang')
      return `SLAYER{${l.solution}}`
    }
    case 'packets': {
      const ps = c.packets as Packet[], s = l.solution as { packet?: number; pick?: string; join?: string; ops: never }
      if (s.packet) { const p = ps.find(x => x.no === s.packet)!; if (!p.data?.includes(s.pick!)) throw new Error('potongan tidak ada di paket'); return applyOps(s.pick!, s.ops) }
      const dns = filterPackets(ps, 'bocor.contoh').map(p => /A ([0-9a-f]+)\.bocor/.exec(p.info)![1]).join('')
      if (dns !== s.join) throw new Error(`gabungan DNS ${dns} ≠ ${s.join}`)
      return applyOps(dns, s.ops)
    }
    case 'osint': return `SLAYER{${l.solution}}`
  }
  throw new Error(`kind ${l.kind} tidak dikenal`)
}

export async function buildCtf() {
  const labs: Lab[] = parse(readFileSync(SRC, 'utf8'))
  const SQL = await initSqlJs()
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const html = async (doc: string) => {
    await page.setContent('<!doctype html><title>x</title>')
    await page.evaluate(() => { (window as never as { __m: unknown[] }).__m = []; addEventListener('message', e => (window as never as { __m: unknown[] }).__m.push(e.data)) })
    await page.evaluate(d => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = d; document.body.append(f) }, doc)
    await page.waitForTimeout(400)
    return page.evaluate(() => (window as never as { __m: { type: string; data: unknown }[] }).__m)
  }
  const ids = new Set<string>(), flags = new Set<string>()
  const out = []
  try {
    for (const l of labs) {
      const fail = (m: string): never => { throw new Error(`${SRC} › ${l.id}: ${m}`) }
      if (ids.has(l.id)) fail('id ganda'); ids.add(l.id)
      if (!/^SLAYER\{[^{}]+\}$/.test(l.flag)) fail('flag harus berformat SLAYER{...}')
      if (flags.has(l.flag)) fail('flag ganda'); flags.add(l.flag)
      if (!CATS.includes(l.cat) || !(l.points > 0) || l.hints?.filter(Boolean).length !== 3 || !l.writeup) fail('cat/points/3 hints/writeup wajib')
      let got = ''
      try { got = await prove(l, SQL, html) } catch (e) { fail(`solusi gagal: ${(e as Error).message}`) }
      if (!got.includes(l.flag)) fail(`solusi tidak menghasilkan flag. Hasil:\n${got.slice(0, 400)}`)
      const { flag, solution: _s, ...rest } = l
      void _s
      const config = JSON.parse(JSON.stringify(rest.config).split(flag).join(FLAG_TOKEN))
      out.push({ ...rest, config, hints: l.hints.filter(Boolean), flag_enc: encFlag(flag), flag_hash: flagHash(flag) })
      console.log(`  ${l.id} ✓`)
    }
  } finally { await browser.close() }
  return { hash: ctfHash(), labs: out }
}

if (process.argv[1]?.endsWith('build-ctf.ts')) {
  if (!process.argv.includes('--force') && existsSync(OUT) && JSON.parse(readFileSync(OUT, 'utf8')).hash === ctfHash()) console.log('ctf: tidak berubah')
  else {
    const data = await buildCtf()
    mkdirSync('src/generated/meta', { recursive: true })
    writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n')
    console.log(`ctf: ${data.labs.length} lab, ${data.labs.reduce((s, l) => s + l.points, 0)} poin`)
  }
}
