// AI Mentor (opsional, mati secara default): memakai API key Anthropic milik user sendiri, langsung dari browser.
// Key hanya disimpan di IndexedDB perangkat ini. Aplikasi tetap berfungsi penuh tanpa fitur ini.
import type Anthropic from '@anthropic-ai/sdk'
import type { Exercise } from '../data/content'

export type MentorMode = 'explain' | 'review'

const SYSTEM = `Kamu adalah mentor pemrograman di aplikasi belajar "Code Slayer" (bertema Korps Pembasmi Iblis, tapi jawabanmu tetap lugas dan teknis).
Murid sedang mengerjakan latihan dan menunjukkan kodenya. Jawab dalam Bahasa Indonesia yang santai tapi tepat, maksimal sekitar 200 kata, pakai Markdown sederhana (paragraf pendek, daftar, blok kode kecil bila perlu).
Aturan:
- Jangan pernah menuliskan solusi lengkap latihan. Kalau kodenya belum lulus tes, tunjukkan letak masalah dan arah perbaikannya, bukan jawabannya.
- Rujuk nomor baris bila membantu.
- Kalau kodenya sudah benar, katakan dengan jujur, lalu beri satu saran yang paling berharga.`

const TASK: Record<MentorMode, string> = {
  explain: 'Jelaskan apa yang dilakukan kode ini langkah demi langkah, seolah untuk pemula. Kalau ada error atau output yang beda, jelaskan penyebabnya.',
  review: 'Review kode ini seperti code reviewer senior: kebenaran, kasus tepi, keterbacaan, dan efisiensi. Urutkan dari yang paling penting. Maksimal 4 poin.',
}

export class MentorError extends Error {}

function numbered(code: string) {
  return code.split('\n').map((l, i) => `${String(i + 1).padStart(3)} | ${l}`).join('\n')
}

export async function askMentor(
  key: string,
  mode: MentorMode,
  ex: Exercise,
  code: string,
  outcome: string,
  onText: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { default: Client } = await import('@anthropic-ai/sdk')
  // Browser langsung ke API: aman di sini karena key adalah milik user sendiri dan tidak pernah dikirim ke server kami.
  const client = new Client({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 })
  const content = `Latihan: ${ex.title} (${ex.lang})\n\nSoal:\n${ex.prompt}\n\nKode murid:\n\`\`\`${ex.lang}\n${numbered(code)}\n\`\`\`\n\nHasil tes: ${outcome}\n\nTugas: ${TASK[mode]}`
  let text = ''
  try {
    const stream = client.beta.messages.stream(
      {
        model: 'claude-opus-5-5',
        max_tokens: 8000, // jawaban sengaja pendek (≈200 kata); ruang lebih untuk pemikiran adaptif
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      },
      { signal },
    )
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        text += ev.delta.text
        onText(text)
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') throw new MentorError('Mentor menolak menjawab permintaan ini. Coba ubah kodenya atau tanyakan hal lain.')
    return text
  } catch (e) {
    throw explain(e, Client)
  }
}

function explain(e: unknown, C: typeof Anthropic): Error {
  if (e instanceof MentorError) return e
  if (e instanceof C.AuthenticationError) return new MentorError('API key ditolak. Periksa lagi key di Profil → AI Mentor.')
  if (e instanceof C.PermissionDeniedError) return new MentorError('API key ini tidak punya akses ke model yang dipakai mentor.')
  if (e instanceof C.RateLimitError) return new MentorError('Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.')
  if (e instanceof C.APIUserAbortError) return new MentorError('Dibatalkan.')
  if (e instanceof C.APIConnectionError) return new MentorError('Tidak bisa menghubungi API Anthropic. Periksa koneksi internetmu.')
  if (e instanceof C.APIError) return new MentorError(`API error ${e.status ?? ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}
