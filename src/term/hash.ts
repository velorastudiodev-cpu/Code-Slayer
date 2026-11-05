// SHA-256 & MD5 sinkron (dipakai sha256sum/md5sum di terminal & validasi flag). Input: string latin1/UTF-8.
export const utf8 = (s: string) => new TextEncoder().encode(s)
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('')
// String dari terminal bisa berisi byte 0–255 ("biner" latin1); teks biasa dikodekan UTF-8.
export const bytes = (s: string) => (/[^\x00-\xff]/.test(s) ? utf8(s) : Uint8Array.from(s, c => c.charCodeAt(0) & 255))

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256(input: string | Uint8Array): string {
  const m = typeof input === 'string' ? bytes(input) : input
  const l = m.length
  const buf = new Uint8Array(((l + 9 + 63) >> 6) << 6)
  buf.set(m)
  buf[l] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(buf.length - 4, l * 8)
  dv.setUint32(buf.length - 8, Math.floor((l * 8) / 2 ** 32))
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let o = 0; o < buf.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  h.forEach((x, i) => odv.setUint32(i * 4, x))
  return hex(out)
}

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
const T = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

export function md5(input: string | Uint8Array): string {
  const m = typeof input === 'string' ? bytes(input) : input
  const l = m.length
  const buf = new Uint8Array(((l + 9 + 63) >> 6) << 6)
  buf.set(m)
  buf[l] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(buf.length - 8, (l * 8) >>> 0, true)
  dv.setUint32(buf.length - 4, Math.floor((l * 8) / 2 ** 32), true)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let o = 0; o < buf.length; o += 64) {
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * i) % 16 }
      const t = d
      d = c
      c = b
      const x = (a + f + T[i] + dv.getUint32(o + g * 4, true)) | 0
      b = (b + ((x << S[i]) | (x >>> (32 - S[i])))) | 0
      a = t
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0
  }
  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  ;[a0, b0, c0, d0].forEach((x, i) => odv.setUint32(i * 4, x, true))
  return hex(out)
}

// Base64 atas string latin1/UTF-8 (output terminal = latin1 per byte).
export function b64encode(s: string) { let bin = ''; for (const b of bytes(s)) bin += String.fromCharCode(b); return btoa(bin) }
export function b64decode(s: string) { return atob(s.replace(/\s+/g, '')) }
// Teks UTF-8 dari byte latin1 (untuk menampilkan hasil decode).
export const fromLatin1 = (s: string) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, c => c.charCodeAt(0))) } catch { return s } }
