// Efek suara chiptune (gelombang kotak 8-bit) disintesis langsung dengan WebAudio: tanpa file audio, kecil, offline.
// Bisa dimatikan di Profil → Efek suara.
import { db } from './db'

type Note = [freq: number, ms: number]
const SOUNDS: Record<string, { wave: OscillatorType; notes: Note[] }> = {
  win: { wave: 'square', notes: [[523, 70], [659, 70], [784, 70], [1047, 160]] },      // C-E-G-C naik: iblis tertebas
  lose: { wave: 'square', notes: [[330, 90], [262, 160]] },                             // turun: belum lolos
  click: { wave: 'square', notes: [[880, 25]] },
  fanfare: { wave: 'square', notes: [[523, 90], [523, 90], [523, 90], [698, 260], [880, 320]] }, // skor 100 / medali / pencapaian
  coin: { wave: 'square', notes: [[988, 60], [1319, 140]] },
}

let ctx: AudioContext | null = null
let enabled = true
if (typeof indexedDB !== 'undefined') db.settings.get('me').then(s => { enabled = s?.sound ?? true }).catch(() => {})
export const setSoundEnabled = (on: boolean) => { enabled = on }

export function sfx(name: keyof typeof SOUNDS) {
  if (!enabled || typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const { wave, notes } = SOUNDS[name]
    let t = ctx.currentTime
    for (const [f, ms] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = wave; o.frequency.value = f
      g.gain.setValueAtTime(0.06, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
      o.connect(g).connect(ctx.destination)
      o.start(t); o.stop(t + ms / 1000 + 0.02)
      t += ms / 1000
    }
  } catch { /* audio tidak tersedia: abaikan */ }
}
