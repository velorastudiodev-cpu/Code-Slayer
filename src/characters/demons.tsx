import type { Character, Expr } from './rig'

// 10 iblis: masing-masing mewakili konsep sulit yang "ditebas" (PRD §2.2). Digambar sendiri di rig piksel yang sama.
export type Demon = Character & { rank: string; concept: string; lore: string }

const SUIT = [
  '.......kss', '....kkuuww', '...kuuuuwR', '..kuuuuuwR', '..kuuuuuwR', '.kuuuuuuwR', '.kuuuuuuwR',
  '.kuuuuuuuR', 'kuuuuuuuuu', 'kuuuuuuuuu', 'kuuuuuuuuu', 'kuuuuuuuuu', 'kuuuuuuuuu', 'kkkkkkkkkk',
]

const muzan: Demon = {
  id: 'muzan', name: 'Muzan Kibutsuji', rank: 'Raja Iblis', breath: 'blood', accent: '#b3122e', demon: true,
  concept: 'Capstone multi-konsep', lore: 'Final boss: soal yang menggabungkan semua yang sudah kamu pelajari.',
  pal: { h: '#1a1418', H: '#0d0a0c', t: '#3a2a32', s: '#f4e9ea', S: '#dcc7ca', e: '#d1202a', B: '#1a1418', R: '#b3122e' },
  hair: [
    '..........', '...kk.kk..', '..khhkhhkk', '.khthhhthh', 'khhhhhhhhh', 'kthhhthhhh', 'khhhhhhhhh',
    'kthhhHhhth', 'khhhhhhhhh', '.khthhhhhh', '.kh.th..h.', '.khh......', '..kt......',
  ],
  body: SUIT,
}

const kokuFace = (brows: string, mouth: string[]) => ['..ek......ke..', brows, '..wek....kew..', '..eee....eee..', '...ek....ke...', ...mouth]
const kokushibo: Demon = {
  id: 'kokushibo', name: 'Kokushibo', rank: 'Upper Moon Satu', breath: 'moon', accent: '#6a3a8a', demon: true,
  concept: 'Algoritma lanjutan & dynamic programming', lore: 'Enam mata melihat semua submasalah sekaligus. Tebas dengan memoisasi.',
  pal: { h: '#1a1420', H: '#0e0a12', e: '#e8b030', B: '#3a1420', F: '#c4202c', a: '#4a2a5a', b: '#2a1a33' },
  hair: [
    '.......kkk', '......khhh', '......khhh', '....kkkkhh', '...khhhhhh', '..khhhhhhh', '.khhhhhhhh',
    '.khhhHhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khh......h', 'khh.......', 'khh.......', 'khh.......', 'khh.......', 'kh........',
  ],
  faces: {
    idle: kokuFace('..BBB....BBB..', ['..............', '......mm......']),
    happy: kokuFace('..BBB....BBB..', ['.....mwwm.....', '......mm......']),
    focus: kokuFace('...BBB..BBB...', ['..............', '.....mmmm.....']),
    encourage: kokuFace('....BB..BB....', ['.....kkkk.....', '.....k..k.....']),
    victory: kokuFace('.BBB......BBB.', ['....mwmmwm....', '.....mmmm.....']),
  } as Record<Expr, string[]>,
  haori: (x, y) => (((x >> 2) + (y >> 2)) & 1 ? 'a' : 'b'),
  extra: [[11, 8, ['F..........F']], [12, 9, ['F........F']]],
}

const doma: Demon = {
  id: 'doma', name: 'Doma', rank: 'Upper Moon Dua', breath: 'ice', accent: '#7bc4e8', demon: true,
  concept: 'Memory leak & manajemen memori', lore: 'Senyumnya ramah, tapi memori yang tidak dibebaskan membeku dan menumpuk.',
  pal: { h: '#efe6d2', H: '#d2c6aa', t: '#c4202c', e: '#7bc4e8', E: '#e88ac4', B: '#c9b98f', a: '#2b2a3a', b: '#e0b33a' },
  hair: [
    '..........', '....k..k..', '...ktkktk.', '..khtttthh', '.khhhtthhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khh.h..h.h', 'khh.......', 'khh.......', '.kh.......',
  ],
  haori: x => (x === 11 || x === 20 ? 'b' : 'a'),
  extra: [[24, 18, ['..999', '.9999', '99999', '.k...', 'k....']]],
}

const akaza: Demon = {
  id: 'akaza', name: 'Akaza', rank: 'Upper Moon Tiga', breath: 'blood', accent: '#e0507a', demon: true,
  concept: 'Loop & infinite loop', lore: 'Bertarung tanpa henti dan tidak pernah tumbang sendiri. Pastikan loop-mu punya kondisi berhenti.',
  pal: { h: '#f07a9e', H: '#c9587c', t: '#ffb0c8', s: '#f1e3e3', S: '#dcc4c4', e: '#f0c040', B: '#c9587c', j: '#2a2f5a' },
  hair: [
    '.k..k..k..', '.hk.hkkhk.', '..hkhhhhhk', '.khhhhhhhh', 'khhhhhhhhh', '.khhhhhhhh', 'khhhHhhhhh',
    '.khhhhhhhh', '..khhhhhhh', '..khhhhhhh', '..kh.hh..h', '..k.......',
  ],
  body: [
    '.......kss', '....kkssss', '..kksvssss', '.ksssvssss', '.ksvvsssvv', '.ksssssvss', '.ksvssssss',
    '.ksssvvvvv', '..kjjjjjjj', '..kjjjjjjj', '..kjjjjjjj', '..kjjjjjjk', '..kjjjjjjk', '..kkkkkkkk',
  ],
  extra: [[9, 14, ['vv..........vv', 'v............v']], [12, 8, ['v.v....v.v']]],
}

const hantengu: Demon = {
  id: 'hantengu', name: 'Hantengu', rank: 'Upper Moon Empat', breath: 'thunder', accent: '#a8a24a', demon: true,
  concept: 'Pointer, referensi & aliasing', lore: 'Dipotong jadi dua, muncul dua. Satu objek, banyak nama: ubah satu, semua ikut berubah.',
  pal: { h: '#e8dcc0', s: '#c8c2a0', S: '#a8a282', e: '#e0c040', B: '#6a6a4a', Z: '#8a8466', a: '#b8a77a', b: '#8a7a55' },
  hair: ['..........', '..........', '...kk.....', '...khk....', '....khk...', '.....kk...'],
  haori: (x, y) => ((x + y) % 4 === 0 ? 'b' : 'a'),
  extra: [[11, 8, ['ZZ.ZZ..ZZ.ZZ']], [13, 9, ['.ZZZZ.']]],
}

const gyokkoFace = (lips: string, eye: string): string[] => ['..............', '..mm......mm..', lips, '..mm......mm..', '..............', eye, '......kk......']
const gyokko: Demon = {
  id: 'gyokko', name: 'Gyokko', rank: 'Upper Moon Lima', breath: 'water', accent: '#2f5fa8', demon: true,
  concept: 'Stack, queue & heap', lore: 'Bersembunyi di dalam vas. Siapa yang masuk terakhir, keluar pertama.',
  pal: { h: '#4fa3a0', H: '#2f6f6c', t: '#8fd6c8', s: '#dfe6ea', S: '#c2ccd2', e: '#e0c040', r: '#d04a6a', a: '#2f5fa8', b: '#e8eef5' },
  hair: [
    '..........', '..k....k..', '.khk..khk.', '.khhkkhhhk', '..khhhhhhh', '...khhhhhh', '...k......',
  ],
  faces: {
    idle: gyokkoFace('.mrrm....mrrm.', '.....kwek.....'),
    happy: gyokkoFace('.mwwm....mwwm.', '.....kwek.....'),
    focus: gyokkoFace('.mmmm....mmmm.', '.....kkek.....'),
    encourage: gyokkoFace('.mkkm....mkkm.', '.....wwew.....'),
    victory: gyokkoFace('.mwwm....mwwm.', '.....keek.....'),
  } as Record<Expr, string[]>,
  body: [
    '.......kss', '......kooo', '.....koooo', '....kooooo', '...koooooo', '..kooooooo', '.koooooooo',
    '.koooooooo', '.koooooooo', '.koooooooo', '..kooooooo', '...koooooo', '....kooooo', '.....kkkkk',
  ],
  haori: (x, y) => (y === 24 || y === 25 || (x * 2 + y) % 6 < 2 ? 'a' : 'b'),
}

const daki: Demon = {
  id: 'daki', name: 'Daki', rank: 'Upper Moon Enam', breath: 'blood', accent: '#d4467a', demon: true,
  concept: 'Concurrency', lore: 'Bekerja berdua dalam satu nyawa. Dua proses berjalan bersamaan dan saling menunggu.',
  pal: { h: '#141014', H: '#0a080a', t: '#2a2028', e: '#9ad04a', B: '#141014', R: '#c4202c', a: '#d4467a', b: '#2a1a22' },
  hair: [
    '....kkkkk.', '...khhhhhk', '...khhhhhh', '....khhhhh', '...kkhhhhh', '..khhhhhhh', '.khhhhhhhh',
    '.khhhHhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khh.h.hh.h', 'khh.......', 'khh.......', 'khh.......', '.kh.......',
  ],
  body: [
    '.......kss', '....kkssss', '...kssssss', '..kooooooo', '..kooooooo', '.ksooooooo', '.ksooooooo',
    '.ksssooooo', 'kssssooooo', 'kooooooooo', 'kooooooooo', 'kooooooook', 'kooooooook', 'kkkkkkkkkk',
  ],
  haori: (_, y) => (y % 3 === 0 ? 'b' : 'a'),
  extra: [[4, 1, ['y....', '.y...', '..yR.']], [23, 1, ['....y', '...y.', '.Ry..']], [11, 14, ['R.........R.']]],
}

const gyutaro: Demon = {
  id: 'gyutaro', name: 'Gyutaro', rank: 'Upper Moon Enam', breath: 'blood', accent: '#5a7a3a', demon: true,
  concept: 'Race condition', lore: 'Kalau dua tubuh tidak ditebas bersamaan, ia bangkit lagi. Seperti dua thread yang menulis data yang sama.',
  pal: { h: '#2a3a2a', H: '#162016', t: '#5a7a3a', s: '#b7b9a8', S: '#8f9282', e: '#e0b030', B: '#2a3a2a', j: '#4a4a3a' },
  hair: [
    '.k...k....', '.hk.kh.k..', '..hkhhkhk.', '.khthhhhhh', 'khhhhhhthh', '.khhhthhhh', 'khhhhhhhhh',
    'kthhhHhhhh', '.khhhhhhhh', 'khhhhhhhhh', 'khh.th..h.', '.kh.......', '.kt.......', '..k.......',
  ],
  body: [
    '.......kss', '....kkssss', '...ksSssss', '..kssskkss', '..ksssssss', '..kssskkss', '..ksSsssss',
    '..kjjjjjjj', '.kjjjjjjjj', '.kjjjjjjjj', 'kjjjjjjjjj', 'kjjjjjjjjk', 'kjjjjjjjjk', 'kkkkkkkkkk',
  ],
  extra: [[1, 18, ['.666', '6...', '6...', '.6..']], [27, 18, ['666.', '...6', '...6', '..6.']], [11, 15, ['S.........S.']]],
}

const rui: Demon = {
  id: 'rui', name: 'Rui', rank: 'Lower Moon Lima', breath: 'web', accent: '#c4202c', demon: true,
  concept: 'Rekursi, graph & linked list', lore: 'Jaringnya saling terhubung tanpa ujung. Tanpa base case, kamu terjerat selamanya.',
  pal: { h: '#ececf0', H: '#c8c8d2', t: '#ffffff', s: '#f5ecec', S: '#e0d2d2', e: '#d02a3a', B: '#c8c8d2', R: '#c4202c', a: '#f2f0f0', b: '#d63a4a' },
  hair: [
    '..........', '..........', '....kkkkkk', '..kkhhhhhh', '.khhhhhhhh', '.khhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khh.......', 'khh.......', '.kh.......',
  ],
  haori: (x, y) => ((x + (y % 4 < 2 ? 0 : 2)) % 4 === 0 && y % 2 === 0 ? 'b' : 'a'),
  extra: [[9, 12, ['R............R', '.R..........R.', '..R...RR...R..']]],
}

const enmu: Demon = {
  id: 'enmu', name: 'Enmu', rank: 'Lower Moon Satu', breath: 'dream', accent: '#5a7a8a', demon: true,
  concept: 'Async, await & deadlock', lore: 'Membuat semua orang tertidur dan menunggu selamanya. Jangan biarkan programmu menunggu sesuatu yang tidak akan datang.',
  pal: { h: '#1f2a33', H: '#121a20', t: '#3a5a6a', s: '#ece6ee', S: '#d6cedb', e: '#b08ad0', B: '#1f2a33', a: '#2a3542', b: '#5a7a8a' },
  hair: [
    '..........', '..........', '...kkkkkkk', '..khhhhhhh', '.khhhhhhhh', '.khhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khhthhthht', '.kt.......',
  ],
  haori: (x, y) => ((x + y) % 4 === 0 && (x - y) % 4 === 0 ? 'b' : 'a'),
}

export const DEMONS: Demon[] = [muzan, kokushibo, doma, akaza, hantengu, gyokko, daki, gyutaro, rui, enmu]
export const demonById = (id: string) => DEMONS.find(d => d.id === id) ?? muzan
