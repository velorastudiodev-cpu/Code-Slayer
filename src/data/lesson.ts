// Logika murni Gulungan Pelajaran: pecah materi jadi kalimat (dialog mentor) & sorot istilah kode di teks.
import { CHARACTERS } from '../characters/roster'
import type { Character } from '../characters/rig'

// Pecah paragraf menjadi kalimat; singkatan umum & angka desimal tidak memotong kalimat.
export function sentences(text: string): string[] {
  const out: string[] = []
  let cur = ''
  const parts = text.trim().split(/(?<=[.!?:])\s+(?=[A-Z0-9"'(“`$~/<-])/)
  for (const p of parts) {
    cur = cur ? `${cur} ${p}` : p
    if (/\b(mis|dll|dsb|dst|cth|no|vs|e\.g|i\.e)\.$/i.test(cur) || cur.length < 25) continue
    out.push(cur); cur = ''
  }
  if (cur && out.length) out[out.length - 1] += ` ${cur}`
  else if (cur) out.push(cur)
  return out
}

const STOP = new Set(['dan', 'di', 'ke', 'yang', 'ini', 'itu', 'untuk', 'dengan', 'atau', 'dari', 'adalah', 'juga', 'tidak', 'bisa', 'satu', 'dua', 'tiga', 'pada', 'saat', 'kalau', 'jika', 'akan', 'sudah', 'the', 'a', 'an', 'to', 'of', 'is', 'in', 'kamu', 'kita', 'baris', 'nilai', 'data', 'file', 'teks'])

// Token teks yang juga muncul di contoh kode → ditampilkan sebagai <code>. Selain itu, pola khas kode
// (fungsi(), $VAR, --opsi, a.b, nama_dengan_garis) selalu disorot.
export function highlight(text: string, code?: string): { t: string; code: boolean }[] {
  // Abaikan komentar & isi string: kata biasa di sana bukan istilah kode.
  const bare = (code ?? '').replace(/(^|\s)(#|\/\/|--)(?!\w*=).*$/gm, '$1').replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, '""')
  const inCode = new Set(bare.match(/[A-Za-z_$][\w$.-]*/g)?.filter(w => w.length >= 2 && !STOP.has(w.toLowerCase())) ?? [])
  const codeLike = /^(?:[A-Za-z_]\w*\(\)|\$[\w({][\w)}]*|--?[a-z][\w-]*|[a-z_]\w*\.[a-z_]\w*\(?\)?|[a-z]+_[a-z_]+|<\/?[a-z]+>|[<>|&]{1,2}|\.\.?\/?|~\/?)$/
  const out: { t: string; code: boolean }[] = []
  for (const tok of text.split(/(\s+)/)) {
    const m = /^([("“]*)(.*?)([.,;:!?)"”]*)$/.exec(tok)!
    const pre = m[1]
    let core = m[2], post = m[3]
    if (core.includes('(') && post.startsWith(')')) { core += ')'; post = post.slice(1) } // print() bukan tanda baca
    const isCode = !!core && (inCode.has(core) || codeLike.test(core))
    if (!isCode) { push(tok, false); continue }
    if (pre) push(pre, false)
    push(core, true)
    if (post) push(post, false)
  }
  function push(t: string, c: boolean) { const last = out[out.length - 1]; if (last && last.code === c && !c) last.t += t; else out.push({ t, code: c }) }
  return out
}

// Mentor bab: karakter yang namanya disebut di mentor track (mis. "Giyu & Tanjiro" → Giyu); selain itu companion user.
export function mentorFor(mentor: string, companion: Character): Character {
  const m = mentor.toLowerCase()
  return (CHARACTERS as Character[]).find(c => m.includes(c.name.toLowerCase())) ?? companion
}
