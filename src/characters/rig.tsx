import { useReducer } from 'react'
import { Pixels, blank, paint, sym, type Pal } from '../pixel'

// Satu rig chibi piksel 32×32: kepala & wajah dipakai bersama, tiap karakter menyumbang rambut, badan, aksesori.
export type Expr = 'idle' | 'happy' | 'focus' | 'encourage' | 'victory'
export type Breath =
  | 'water' | 'flame' | 'thunder' | 'beast' | 'insect' | 'mist' | 'love' | 'serpent' | 'wind' | 'stone' | 'sound' | 'flower' | 'sun' | 'moon'
  | 'blood' | 'ice' | 'web' | 'dream'

export const EXPRESSIONS: Expr[] = ['idle', 'happy', 'focus', 'encourage', 'victory']
export const EXPR_LABEL: Record<Expr, string> = {
  idle: 'Idle', happy: 'Senang', focus: 'Fokus', encourage: 'Semangat', victory: 'Menang',
}

export type Character = {
  id: string
  name: string
  breath: Breath
  accent: string // warna UI saat jadi companion
  pal: Pal // minimal: h H t (rambut), e (mata), B (alis), x (bilah)
  hair: string[] // setengah kiri, 10 kolom, mulai baris 0
  body?: string[] // setengah kiri, 10 kolom, baris 18–31; 'o' = haori
  haori?: (x: number, y: number) => string
  extra?: [x: number, y: number, rows: string[]][]
  faces?: Partial<Record<Expr, string[]>> // ganti wajah (topeng, mata banyak)
  demon?: boolean // wajah iblis: pupil celah, taring; tanpa Nichirin
  noBlade?: boolean
}

export const BASE_PAL: Pal = {
  k: '#1a1218', s: '#fde3cf', S: '#efc3a6', w: '#ffffff', m: '#8a2a35', r: '#f59a9a', u: '#23232e', d: '#7cc4f2',
  q: '#2b2b2b', j: '#4a3a7a', v: '#3b8fd1', V: '#8cc8f0', f: '#f08a24', F: '#d6361f', y: '#f5c518', z: '#8a90a0',
  P: '#b38be6', Q: '#7d4fc0', U: '#3a3d52',
  // Warna efek pernapasan (angka tidak dipakai palet karakter).
  1: '#e3e9f0', 2: '#a9b4c2', 3: '#f28cb8', 4: '#5fc48a', 5: '#8a7a66', 6: '#b3122e', 7: '#bfe8ff', 8: '#7a4bb0', 9: '#f2c14e', 0: '#ffffff',
}

const BODY = [
  '.......kss', '....kkooww', '...koooouw', '..kooooouu', '..kooooouu', '.koooooouu', '.koooooouu',
  '.kooooooww', 'kooooooouu', 'kooooooouu', 'kooooooouu', 'kooooooouk', 'kooooooouk', 'kkkkkkkkkk',
]

const HEAD = [
  '.kkkkkkkkkkkk.', 'kssssssssssssk', 'kssssssssssssk', 'kssssssssssssk', 'kssssssssssssk', 'kssssssssssssk',
  'kssssssssssssk', 'kssssssssssssk', 'kssssssssssssk', 'kssssssssssssk', '.kSssssssssSk.', '..kkkkkkkkkk..',
]

// Wajah: baris 10–16, kolom 9–22.
const FACES: Record<Expr, string[]> = {
  idle: ['..BBB....BBB..', '...kk....kk...', '...we....we...', '...ee....ee...', '.rr........rr.', '......mm......'],
  happy: ['..BBB....BBB..', '..............', '...kk....kk...', '..k..k..k..k..', '.rr........rr.', '.....mmmm.....', '......mm......'],
  focus: ['..B........B..', '...BB....BB...', '...ee....ee...', '...ke....ke...', '..............', '......kk......'],
  encourage: ['....B....B....', '..BB......BB.d', '...we....we.dd', '...ee....ee...', '.rr........rr.', '.....k..k.....', '......kk......'],
  victory: ['..BBB....BBB..', '...kk....kk...', '...we....we...', '...ew....ew...', '.rr........rr.', '.....mwwm.....', '......mm......'],
}

// Iblis: pupil celah & taring.
const DEMON_FACES: Record<Expr, string[]> = {
  idle: ['..BBB....BBB..', '..kkk....kkk..', '..eke....eke..', '..eke....eke..', '..............', '.....mwwm.....'],
  happy: ['.BB........BB.', '..BBB....BBB..', '..eke....eke..', '..eke....eke..', '....mmmmmm....', '....mwmmwm....', '.....mmmm.....'],
  focus: ['..BB......BB..', '...BBB..BBB...', '...ek....ke...', '..............', '.....mmmm.....'],
  encourage: ['....B....B....', '..BB......BB..', '..wwk....kww..', '..www....www..', '..............', '.....kkkk.....', '.....k..k.....'],
  victory: ['.B..........B.', '..BBB....BBB..', '..eke....eke..', '..eke....eke..', '..............', '....mwmmwm....', '.....mmmm.....'],
}

const set = (g: string[][], x: number, y: number, k: string) => { if (g[y]?.[x] !== undefined) g[y][x] = k }

// Efek pernapasan di belakang karakter (ekspresi menang).
const FX: Record<Breath, (g: string[][]) => void> = {
  water: g => { for (let x = 0; x < 32; x++) { const o = Math.round(Math.sin(x / 2)); set(g, x, 28 + o, 'v'); for (let y = 29 + o; y < 32; y++) set(g, x, y, 'V') } },
  flame: g => [0, 1, 2, 3, 4, 5, 26, 27, 28, 29, 30, 31].forEach(x => {
    const h = [5, 9, 6, 11, 7, 4][x % 6]
    for (let y = 32 - h; y < 32; y++) set(g, x, y, y < 34 - h ? 'y' : y < 37 - h ? 'f' : 'F')
  }),
  thunder: g => [[29, 1], [28, 2], [27, 3], [26, 4], [27, 5], [28, 6], [29, 7], [28, 8], [27, 9], [26, 10], [27, 11], [28, 12]]
    .forEach(([x, y]) => { set(g, x, y, 'y'); set(g, 31 - x, y + 6, 'y') }),
  beast: g => { for (let s = 0; s < 3; s++) for (let i = 0; i < 8; i++) set(g, s * 3 + i, 1 + i, 'z') },
  insect: g => [[0, 9], [26, 3], [26, 20]].forEach(([x, y]) => paint(g, ['PP.PP', 'QPkPQ', '.P.P.'], x, y)),
  mist: g => [[0, 4], [25, 1], [0, 20], [26, 16], [1, 12]].forEach(([x, y]) => paint(g, ['.11..', '11111', '.2222'], x, y)),
  love: g => [[1, 3], [27, 6], [0, 16], [27, 20], [3, 26]].forEach(([x, y]) => paint(g, ['3.3', '333', '.3.'], x, y)),
  serpent: g => { for (let x = 0; x < 32; x++) { const y = 27 + Math.round(Math.sin(x / 1.6) * 2); set(g, x, y, '8'); set(g, x, y + 1, 'P') } paint(g, ['88.', '8k8', '.88'], 29, 24) },
  wind: g => [[0, 2], [25, 8], [1, 22]].forEach(([x, y]) => paint(g, ['.444.', '4...4', '4.4.4', '4..4.', '.44..'], x, y)),
  stone: g => { [[0, 27], [4, 29], [26, 28], [29, 26]].forEach(([x, y]) => paint(g, ['.55.', '5555', '5525'], x, y)); for (let x = 2; x < 30; x += 3) set(g, x, 3, 'z') },
  sound: g => [[1, 2], [27, 5], [0, 18], [28, 22]].forEach(([x, y], i) => paint(g, i & 1 ? ['.9.', '999', '.9.'] : ['.99', '.9.', '99.', '99.'], x, y)),
  flower: g => [[1, 2], [28, 4], [0, 14], [27, 12], [2, 24], [28, 25]].forEach(([x, y], i) => paint(g, i & 1 ? ['.3.', '303', '.3.'] : ['3.', '33'], x, y)),
  sun: g => { for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2, x = Math.round(16 + Math.cos(t) * 15), y = Math.round(15 + Math.sin(t) * 15); set(g, x, y, a & 1 ? 'f' : 'y'); set(g, Math.round(16 + Math.cos(t) * 14), Math.round(15 + Math.sin(t) * 14), 'F') } },
  moon: g => { paint(g, ['..999', '.99..', '99...', '99...', '.99..', '..999'], 0, 1); [[27, 4], [29, 12], [1, 20], [28, 22]].forEach(([x, y]) => set(g, x, y, '8')) },
  blood: g => [[1, 0], [4, 0], [27, 0], [30, 0]].forEach(([x], i) => { for (let y = 0; y < 5 + i * 3; y++) set(g, x, y, '6'); set(g, x - 1, 5 + i * 3, '6'); set(g, x + 1, 5 + i * 3, '6') }),
  ice: g => [[0, 25], [27, 24], [2, 4], [27, 3]].forEach(([x, y]) => paint(g, ['..7..', '.777.', '77077', '.777.', '..7..'], x, y)),
  web: g => { for (let i = 0; i < 9; i++) { set(g, i, i, '0'); set(g, 31 - i, i, '0'); set(g, i, 3, '0'); set(g, 31 - i, 3, '0'); set(g, 3, i, '0'); set(g, 28, i, '0') } },
  dream: g => { paint(g, ['888', '..8', '.8.', '888'], 1, 2); paint(g, ['88', '.8', '88'], 27, 6); [[2, 18], [28, 16], [1, 26]].forEach(([x, y]) => paint(g, ['.8.', '8.8', '.8.'], x, y)) },
}

export function chibiRows(c: Character, expr: Expr): string[] {
  const g = blank(32, 32)
  if (expr === 'victory') FX[c.breath](g)
  paint(g, sym(c.body ?? BODY), 6, 18)
  paint(g, HEAD, 9, 6)
  paint(g, sym(c.hair), 6, 0)
  paint(g, c.faces?.[expr] ?? (c.demon ? DEMON_FACES : FACES)[expr], 9, 10)
  // Mata kanan beda warna (heterokromia) kalau palet punya 'E'.
  if (c.pal.E) for (let y = 10; y < 17; y++) for (let x = 16; x < 23; x++) if (g[y][x] === 'e') g[y][x] = 'E'
  c.extra?.forEach(([x, y, rows]) => paint(g, rows, x, y))
  if (expr === 'victory' && !c.noBlade && !c.demon) {
    for (let i = 0; i < 12; i++) set(g, 26 + (i >> 1), 24 - i, 'x')
    paint(g, ['qqq', 'ss.', '.j.', '.j.'], 25, 25)
  }
  return g.map((r, y) => r.map((k, x) => (k === 'o' ? c.haori!(x, y) : k)).join(''))
}

export const Chibi = ({ c, expr, size = 128 }: { c: Character; expr: Expr; size?: number }) => (
  <Pixels rows={chibiRows(c, expr)} pal={{ ...BASE_PAL, ...c.pal }} size={size} label={`${c.name}: ${EXPR_LABEL[expr]}`} className={`chibi chibi-${expr}`} />
)

// Override gambar: public/characters/<id>/<expr>.png. Kalau tidak ada, pakai sprite bawaan.
const missing = new Set<string>()

export function Avatar({ c, expr, size = 128 }: { c: Character; expr: Expr; size?: number }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const src = `${import.meta.env.BASE_URL}characters/${c.id}/${expr}.png`
  if (missing.has(src)) return <Chibi c={c} expr={expr} size={size} />
  return (
    <img src={src} width={size} height={size} alt={`${c.name}: ${EXPR_LABEL[expr]}`} className="pixelated"
      onError={() => { missing.add(src); rerender() }} />
  )
}
