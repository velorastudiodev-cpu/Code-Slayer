import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import initSqlJs from 'sql.js'
import { HARNESS, applyOps, checkFlag, crackmeCheck, decFlag, encFlag, filterPackets, flagHash, htmlDoc, labShell, webRequest } from './engine'
import { ctfHash } from '../../scripts/build-ctf'

type L = { id: string; kind: string; cat: string; points: number; flag_enc: string; flag_hash: string; config: Record<string, unknown> }
const CTF: { hash: string; labs: L[] } = JSON.parse(readFileSync('src/generated/meta/ctf.json', 'utf8'))

describe('flag', () => {
  it('validasi hash: hanya flag persis yang diterima', () => {
    const h = flagHash('SLAYER{uji_coba}')
    expect(checkFlag('SLAYER{uji_coba}', h)).toBe(true)
    expect(checkFlag('  SLAYER{uji_coba}  ', h)).toBe(true)
    expect(checkFlag('SLAYER{uji_cob}', h)).toBe(false)
    expect(checkFlag('uji_coba', h)).toBe(false)
    expect(decFlag(encFlag('SLAYER{x}'))).toBe('SLAYER{x}')
  })
  it('ctf.json: ≥ 30 flag, tidak ada flag teks biasa, hash cocok dengan flag terobfuscate', () => {
    expect(CTF.hash).toBe(ctfHash())
    expect(CTF.labs.length).toBeGreaterThanOrEqual(30)
    const src = JSON.stringify(CTF)
    for (const f of readFileSync('content/ctf/labs.yaml', 'utf8').match(/^  flag: (.+)$/gm)!.map(x => x.slice(8).trim())) expect(src.includes(f), f).toBe(false)
    for (const l of CTF.labs) expect(checkFlag(decFlag(l.flag_enc), l.flag_hash), l.id).toBe(true)
    expect(new Set(CTF.labs.map(l => l.cat))).toEqual(new Set(['web', 'crypto', 'forensics', 'rev', 'misc']))
  })
})

describe('lab web (server simulasi)', async () => {
  const SQL = await initSqlJs()
  const ctx = { flag: 'SLAYER{t}', SQL }
  it('SQLi login: kredensial biasa tidak membuka arsip, injeksi membuka', async () => {
    expect((await webRequest('sqli-login', { method: 'POST', url: '/login', body: 'user=tanjiro&pass=air123' }, ctx)).body).not.toContain('SLAYER')
    expect((await webRequest('sqli-login', { method: 'POST', url: '/login', body: "user=oyakata'--&pass=x" }, ctx)).body).toContain('SLAYER{t}')
  })
  it('IDOR, path traversal, SSRF, cmd injection: jalur normal aman, eksploit membuka flag', async () => {
    expect((await webRequest('idor-surat', { url: '/api/surat/1043', cookie: 'sesi=tanjiro-7f3a' }, ctx)).body).not.toContain('SLAYER')
    expect((await webRequest('path-unduh', { url: '/unduh?file=laporan.txt' }, ctx)).body).not.toContain('SLAYER')
    expect((await webRequest('ssrf-pratinjau', { url: '/pratinjau?url=http://intranet.kisatsutai/rahasia' }, ctx)).status).toBe(403)
    expect((await webRequest('cmd-ping', { url: '/ping?host=8.8.8.8' }, ctx)).body).not.toContain('SLAYER')
    expect((await webRequest('cmd-ping', { url: '/ping?host=1.1.1.1%3Bcat%20flag.txt' }, ctx)).body).toContain('SLAYER{t}')
  })
  it('JWT: tanda tangan palsu ditolak, alg none (celah yang disengaja) diterima', async () => {
    const b = (s: string) => btoa(s).replace(/=+$/, '')
    expect((await webRequest('jwt-none', { url: '/admin', headers: { Authorization: `Bearer ${b('{"alg":"HS256"}')}.${b('{"admin":true}')}.palsu` } }, ctx)).status).toBe(401)
    expect((await webRequest('jwt-none', { url: '/admin', headers: { Authorization: `Bearer ${b('{"alg":"none"}')}.${b('{"admin":true}')}.` } }, ctx)).body).toContain('SLAYER{t}')
  })
})

describe('lab lain', () => {
  it('harness XSS/CSRF disisipkan & halaman korban memakai input mentah', () => {
    const d = htmlDoc('xss-cari', '<b>x</b>')
    expect(d).toContain(HARNESS)
    expect(d).toContain('<b>x</b>')
  })
  it('terminal lab, crypto, crackme, packet filter', async () => {
    const sh = labShell({ 'a/.r': 'SLAYER{z}\n' })
    expect((await sh.run('cat a/.r')).stdout).toBe('SLAYER{z}\n')
    expect(applyOps('VODBHU{d}', [{ op: 'caesar', p: '3' }])).toBe('SLAYER{a}')
    expect(crackmeCheck('function periksa(k){ return k === "ok" }', 'ok')).toBe(true)
    expect(crackmeCheck('function periksa(k){ return k === "ok" }', 'no')).toBe(false)
    const ps = [{ no: 1, t: '0', src: '1.1.1.1', dst: '2.2.2.2', proto: 'DNS', info: 'q' }, { no: 2, t: '0', src: '2.2.2.2', dst: '1.1.1.1', proto: 'HTTP', info: 'GET /' }]
    expect(filterPackets(ps, 'http').map(p => p.no)).toEqual([2])
    expect(filterPackets(ps, 'ip.src==1.1.1.1').map(p => p.no)).toEqual([1])
  })
})
