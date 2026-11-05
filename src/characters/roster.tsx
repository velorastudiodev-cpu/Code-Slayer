import type { Character } from './rig'

// Rambut & badan = setengah kiri (10 kolom), dicerminkan otomatis. Lihat kunci warna di BASE (rig.tsx).
const tanjiro: Character = {
  id: 'tanjiro', name: 'Tanjiro', breath: 'water', accent: '#2f8f5b',
  pal: { h: '#4a1c1c', H: '#2e1010', t: '#a8322d', e: '#b0413a', B: '#3a1414', x: '#1a1a1a', a: '#2f8f5b', b: '#151515', R: '#d23c2c' },
  hair: [
    '......k...', '..k..khk.k', '..kkkhhkkh', '...khhhhhh', '.kkhhhhhhh', 'kthhhhhhhh', '.khhhhhhhh',
    'kthhhhHhhh', '.khhhhhhhh', '..khhhhhhh', '..kh..t..t', '..kh......', '..kt......',
  ],
  haori: (x, y) => ((x >> 1) + (y >> 1)) & 1 ? 'a' : 'b',
  extra: [[8, 13, ['k', 'w', 'R', 'w']], [23, 13, ['k', 'w', 'R', 'w']]],
}

const zenitsu: Character = {
  id: 'zenitsu', name: 'Zenitsu', breath: 'thunder', accent: '#e8a90f',
  pal: { h: '#f7d23b', H: '#d9a91c', t: '#f08a24', e: '#c98a1a', B: '#c98a1a', x: '#f5c518', a: '#f5a623', b: '#fff6dc' },
  hair: [
    '..........', '....k..k..', '...khkkhk.', '..kkhhhhhk', '.kthhhhhhh', 'kthhhhhhhh', '.kthhhhhhh',
    'kthhhHhhhh', '.khhhhhhhh', '..khhhhhhh', '..kh.th.t.', '..kt......',
  ],
  haori: (x, y) => { const tx = x % 4, ty = y % 4; return (ty === 1 && tx === 1) || (ty === 2 && tx < 3) ? 'b' : 'a' },
}

const inosuke: Character = {
  id: 'inosuke', name: 'Inosuke', breath: 'beast', accent: '#5b6ea6',
  pal: { h: '#1c2333', H: '#11151f', t: '#3d4f7a', e: '#3fa58a', B: '#1c2333', x: '#4b5b8c', g: '#8c93a3', G: '#6b7180', n: '#c9b2aa', N: '#4a3a3a', i: '#2b2f3a', l: '#8a6a4b', L: '#5e4630' },
  hair: [
    '..kk......', '..kgk.....', '..kggkkkkk', '...kgggggg', '..kggggGgg', '.kgggggggg', '.kggGggggg',
    '.kggiwgggg', '.kgggggkkn', '..kggwknNn', '.khh......', '.khh......', '.khh......', '.kth......', '..kt......',
  ],
  body: [
    '.......kss', '....kkssss', '..kkksssss', '.ksksssSss', '.kskssssss', '.ksksssssS', '.ksksssSsS',
    '.kskllllll', '..klllLlll', '..kllllllL', '..klLlllll', '..kllllllk', '..kllllllk', '..kkkkkkkk',
  ],
}

const shinobu: Character = {
  id: 'shinobu', name: 'Shinobu', breath: 'insect', accent: '#9b6fd1',
  pal: { h: '#2a2033', H: '#17111f', t: '#7a4bb0', e: '#9b6fd1', B: '#241a2e', x: '#8fd6c0', a: '#f6e8f8', b: '#d7b4ec', c: '#3fb59c', C: '#1d6e62' },
  hair: [
    '..........', '..........', '.....kkkkk', '...kkhhhhh', '..khhhhhhh', '.khhhhhhhh', '.khhhhhhhh',
    'khhhhhhhhh', 'khhhhhhhhh', 'khhhHhhhhh', 'khhhh.h...', 'khh.......', 'khh.......', 'khh.......',
    'kth.......', 'ktt.......', '.kk.......',
  ],
  haori: (x, y) => (y > 23 && (x + y) % 7 === 0 ? 'k' : y < 22 ? 'a' : y < 25 ? 'b' : y < 28 ? 'c' : 'C'),
  extra: [[19, 2, ['PP.PP', 'QPkPQ', '.P.P.']]],
}

const rengoku: Character = {
  id: 'rengoku', name: 'Rengoku', breath: 'flame', accent: '#e2452c',
  pal: { h: '#f7c832', H: '#e0a420', t: '#d6361f', e: '#f0a500', B: '#c0391b', x: '#e2452c', a: '#faf6ee' },
  hair: [
    '..k...k..k', '.kt..kt.kt', '.kht.khtkh', 'kthhkhhhhh', 'kthhhhhhhh', 'kthhhhhhhh', 'ktthhhhhhh',
    'kthhhHhhhh', '.kthhhhhhh', '..khhhhhhh', '..kt.ht..t', '..kt......', '...t......',
  ],
  haori: (x, y) => { const h = [2, 4, 3, 5, 2, 4, 6, 3][x % 8]; return y >= 32 - h ? (y >= 34 - h ? 'F' : 'f') : 'a' },
}


// ---- M7: 18 karakter tambahan. Semua digambar sendiri di grid 32×32 (tanpa art resmi/fan-art).
const UNIFORM = [
  '.......kss', '....kkuuww', '...kuuuuwu', '..kuuuuuuu', '..kuUuuuuu', '.kuuUuuuuu', '.kuuUuuuuu',
  '.kuuUuwwww', 'kuuuUuuuuu', 'kuuuUuuuuy', 'kuuuUuuuuu', 'kssuUuuuuy', 'kssuUuuuuu', 'kkkkkkkkkk',
]
const OPEN = [
  '.......kss', '....kkooss', '...koooous', '..kooooous', '..koooooou', '.koooooouu', '.koooooouu',
  '.kooooooww', 'kooooooouu', 'kooooooouu', 'kooooooouu', 'kooooooouk', 'kooooooouk', 'kkkkkkkkkk',
]
const KIMONO = [
  '.......kss', '....kkooww', '...koooowo', '..koooooow', '..kooooooo', '.koooooooo', '.koooooooo',
  '.kooooooww', 'koooooooww', 'kooooooooo', 'kooooooooo', 'kooooooook', 'kooooooook', 'kkkkkkkkkk',
]
const LONG_HAIR = [
  '..........', '..........', '....kkkkkk', '...khhhhhh', '..khhhhhhh', '.khhhhhhhh', '.khhhhhhhh',
  'khhhhhhhhh', 'khhhhHhhhh', 'khhhhhhhhh', 'khh.hh.hhh', 'khh.......', 'khh.......', 'khh.......', 'khh.......', 'kth.......', '.kt.......',
]
// Motif kulit kura-kura (heksagon) tiga warna.
const hex = (x: number, y: number) => { const ty = Math.floor(y / 3), tx = Math.floor((x + (ty % 2) * 2) / 4); return ['b', 'c', 'C'][(tx + ty) % 3] }

const giyu: Character = {
  id: 'giyu', name: 'Giyu', breath: 'water', accent: '#3b6fd1',
  pal: { h: '#1e2233', H: '#11131d', t: '#2d3550', e: '#3b6fd1', B: '#151824', x: '#3b8fd1', a: '#7a2230', b: '#e0b33a', c: '#4f8a4a', C: '#d06a2c' },
  hair: [
    '..........', '.....k....', '...k.khk..', '..khkhhhkk', '.khhhhhhhh', 'khhhhhhhhh', '.khhhhhhhh',
    'kthhhHhhhh', '.khhhhhhhh', '..khhhhhhh', '..khh.hh.h', '.khhh.....', '.khh......', '..kh......', '..k.......',
  ],
  haori: (x, y) => (x < 16 ? 'a' : hex(x, y)),
}

const kanao: Character = {
  id: 'kanao', name: 'Kanao', breath: 'flower', accent: '#d9609e',
  pal: { h: '#2b2230', H: '#1a141f', t: '#4a3a5a', e: '#d98bc7', B: '#2b2230', x: '#e87fb2', a: '#f7f4f0', b: '#e3dbd0' },
  hair: LONG_HAIR.slice(0, 15),
  haori: (_, y) => (y > 29 ? 'b' : 'a'),
  extra: [[2, 6, ['.kk.', 'khhk', 'khhk', 'khhk', '.khk', '.khk', '..kk']], [2, 3, ['PP.PP', 'QPkPQ', '.P.P.']]],
}

const muichiro: Character = {
  id: 'muichiro', name: 'Muichiro', breath: 'mist', accent: '#4fb8a4',
  pal: { h: '#1d2129', H: '#121418', t: '#7fd8c4', e: '#6fd6c0', B: '#1d2129', x: '#cfd6dd' },
  hair: [
    '..........', '....k..k..', '...khkkhk.', '..khhhhhhh', '.khhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khh.hhh.hh', 'khh.......', 'khh.......', 'khh.......',
    'ktt.......', 'ktt.......', 'ktt.......', '.tt.......', '.kk.......',
  ],
  body: UNIFORM,
}

const mitsuri: Character = {
  id: 'mitsuri', name: 'Mitsuri', breath: 'love', accent: '#e0609a',
  pal: { h: '#f59ac0', H: '#e07aa6', t: '#7bc47f', e: '#5fb36a', B: '#e07aa6', x: '#f28cb8', a: '#f7f2ec' },
  hair: [
    '..........', '...k..k...', '..khkkhkk.', '.khhhhhhhh', '.khhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khh.h.hh.h', 'kkhk......', 'khhk......', 'kkhk......',
    'khhk......', 'kkhk......', 'kttk......', '.kk.......',
  ],
  body: OPEN,
  haori: () => 'a',
}

const obanai: Character = {
  id: 'obanai', name: 'Obanai', breath: 'serpent', accent: '#7a4bb0',
  pal: { h: '#1c1a22', H: '#0f0e13', t: '#2e2b38', e: '#e8c33a', E: '#3fb5a8', B: '#1c1a22', x: '#7a4bb0', a: '#f2f2f2', b: '#2b2b33' },
  hair: [
    '..........', '..........', '....kkkkk.', '..kkhhhhhk', '.khhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', '.khhhhhhhh', '.khhhhhhhh', '.kh.hh.h.h', '.kh.......', '..h.......',
  ],
  haori: (x, y) => (((x + y) >> 1) % 2 ? 'a' : 'b'),
  extra: [[10, 14, ['kwwwwwwwwwwk', 'kwwzwwwwzwwk', '.kwwwwwwwwk.']], [21, 15, ['.000.', '00r0.', '.0..0', '....0']]],
}

const sanemi: Character = {
  id: 'sanemi', name: 'Sanemi', breath: 'wind', accent: '#3fa86a',
  pal: { h: '#eef0f2', H: '#c9ced6', t: '#ffffff', e: '#8a5ac9', B: '#a9afb8', x: '#4fbf7a', a: '#f4f4f4', Z: '#b5525a' },
  hair: [
    '.k...k..k.', '.hk.kh.kh.', '.hhkhhkhhk', 'khhhhhhhhh', '.khhhhhhhh', 'khhhhhhhhh', '.khhhhhhhh',
    'khhhHhhhhh', '.khhhhhhhh', '..khhhhhhh', '..khh.h..h', '..kh......', '..k.......',
  ],
  body: OPEN,
  haori: () => 'a',
  extra: [[10, 11, ['Z..', '.Z.', '..Z']], [20, 13, ['Z', 'Z', 'Z']], [14, 20, ['Z...', '.ZZ.', '...Z']]],
}

const gyomei: Character = {
  id: 'gyomei', name: 'Gyomei', breath: 'stone', accent: '#8a6a3e',
  pal: { h: '#2a2420', H: '#1a1613', e: '#eef0f4', B: '#2a2420', x: '#8a90a0', a: '#6b5a45', b: '#4a3d30', Z: '#a0524d' },
  hair: ['..........', '..........', '..........', '..........', '....kkkkkk', '...khhhhhh', '..khhhhhhh', '..khhhHhhh', '..khhhhhhh'],
  haori: (x, y) => ((x % 5 === 0 && y > 19) ? 'b' : 'a'),
  extra: [[13, 8, ['ZZZZZZ']], [10, 19, ['qq..........', '..qq........', '....qq......', '......qq....', '........qq..', '..........qq']]],
}

const tengen: Character = {
  id: 'tengen', name: 'Tengen', breath: 'sound', accent: '#e98b2a',
  pal: { h: '#f2f2f0', H: '#cfcfc8', t: '#ffffff', e: '#c94a6a', B: '#cfcfc8', x: '#e98b2a', R: '#d6304a', g: '#3fb56a' },
  hair: [
    '..........', '..........', '....kkkkkk', '...khhhhhh', '..khhhhhhh', '.khhhhhhhh', '.khhhhhhhh',
    'khhhhhhhhh', 'khhhhHhhhh', 'khhhhhhhhh', 'khh.......', 'khh.......', 'khh.......', '.kh.......',
  ],
  body: [
    '.......kss', '....kksuuu', '...ksssuuu', '..kssssuuu', '..kyyyyuuu', '.kssssuuuu', '.kssssuuuu',
    '.kssssuwww', 'ksssssuuuu', 'kssssuuuuu', 'kssssuuuuu', 'kkssuuuuuk', '.kuuuuuuuk', '.kkkkkkkkk',
  ],
  extra: [[9, 7, ['kkkkkkkkkkkkkk', 'y9yRyyggyyRy9y', 'kkkkkkkkkkkkkk']], [10, 11, ['.RRR', 'R...', 'R...', '.R..']]],
}

const genya: Character = {
  id: 'genya', name: 'Genya', breath: 'wind', accent: '#6a6f8a',
  pal: { h: '#1a1a1f', H: '#0d0d10', e: '#8b5fbf', B: '#2a2a30', x: '#5a6b5a', Z: '#a0524d' },
  hair: [
    '.......kkk', '......khhh', '......khhh', '.....khhhh', '.....khhhh', '....kkhhhh', '....kShhhh',
    '...kSShhhh', '...kSShhhh',
  ],
  body: UNIFORM,
  extra: [[12, 13, ['Z.......', '.ZZZZZZZ']]],
}

const nezuko: Character = {
  id: 'nezuko', name: 'Nezuko', breath: 'blood', accent: '#e86a9a', noBlade: true,
  pal: { h: '#1d1418', H: '#0f0a0c', t: '#e0762c', e: '#e86a9a', B: '#1d1418', R: '#f08ab0', g: '#7aa65a', G: '#4a6a3a', a: '#f2a6c0', b: '#d97a9a', c: '#8a5a3a', C: '#6a4228' },
  hair: [...LONG_HAIR.slice(0, 15), 'ktt.......', 'ktt.......', '.tt.......', '.kk.......'],
  body: KIMONO,
  haori: (x, y) => (x < 11 || x > 20 ? (y % 3 === 0 && x % 3 === 0 ? 'C' : 'c') : (x + y) % 4 === 0 || (x - y) % 4 === 0 ? 'b' : 'a'),
  extra: [[5, 2, ['.RR.RR', 'RRRkRR', '.RR.RR']], [10, 14, ['kkkkkkkkkkkk', 'gggGgggGgggG', 'kkkkkkkkkkkk']]],
}

const MASK = (brows: string, eyes: string) => [
  '.MMMMMMMMMMMM.', brows, eyes, '.MMMMMNNMMMMM.', '.MMMMMNNMMMMM.', '.MMMMNNNNMMMM.', '..MMMNNNNMMM..',
]
const urokodaki: Character = {
  id: 'urokodaki', name: 'Urokodaki', breath: 'water', accent: '#5f8fd0',
  pal: { h: '#e6e6ea', H: '#bfc2ca', t: '#ffffff', x: '#5f8fd0', a: '#5f8fd0', b: '#eef3fb', M: '#c8323a', N: '#8e1f26' },
  hair: [
    '..........', '...k.k.k..', '..khkhkhk.', '.khhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khh.......', 'khh.......', 'khh.......', '.kh.......',
  ],
  faces: {
    idle: MASK('.MwwwMMMMwwwM.', '.MMkkMMMMkkMM.'),
    happy: MASK('.MwwwMMMMwwwM.', '.MkMMkMMkMMkM.'),
    focus: MASK('.MMwwwMMwwwMM.', '.MMkkMMMMkkMM.'),
    encourage: MASK('.wwwMMMMMMwww.', '.MMkkMMMMkkMd.'),
    victory: MASK('.wwwwMMMMwwww.', '.MMkkMMMMkkMM.'),
  },
  haori: (x, y) => ((y % 5 === 1 && x % 6 < 4) || (y % 5 === 2 && x % 6 > 0 && x % 6 < 5) ? 'b' : 'a'),
}

const sabito: Character = {
  id: 'sabito', name: 'Sabito', breath: 'water', accent: '#d27a5e',
  pal: { h: '#e89a7e', H: '#c4765e', t: '#f2b8a0', e: '#a98bd0', B: '#c4765e', x: '#3b8fd1', b: '#e0b33a', c: '#4f8a4a', C: '#d06a2c', Z: '#b5525a', R: '#d0303a' },
  hair: [
    '..........', '...k..k...', '..khkkhk.k', '.khhhhhhhh', 'khhhhhhhhh', '.khhhhhhhh', 'khhhHhhhhh',
    '.khhhhhhhh', 'khhhhhhhhh', '.khhhhhhhh', '..kh.hh..h', '..kh......', '..k.......',
  ],
  haori: hex,
  extra: [[19, 13, ['Z.', '.Z', 'Z.']], [21, 0, ['.0..0', '00000', '0R0R0', '00000', '.0R0.']]],
}

const makomo: Character = {
  id: 'makomo', name: 'Makomo', breath: 'water', accent: '#e58aa6',
  pal: { h: '#2a1f22', H: '#170f11', t: '#3a2a2e', e: '#7aa6d9', B: '#2a1f22', x: '#6fb0e0', a: '#f0b8c8', b: '#fbeef2', R: '#d0303a' },
  hair: LONG_HAIR,
  haori: (x, y) => ((x % 5 === 2 && y % 4 === 1) || (x % 5 !== 2 && x % 5 !== 0 && y % 4 === 2) ? 'b' : 'a'),
  extra: [[6, 0, ['0..0.', '00000', '0R0R0', '00000', '.0R0.']]],
}

const murata: Character = {
  id: 'murata', name: 'Murata', breath: 'water', accent: '#4a6fa8',
  pal: { h: '#1e1e26', H: '#101015', t: '#2e2e3a', e: '#4a4a5a', B: '#1e1e26', x: '#3b8fd1' },
  hair: [
    '..........', '..........', '....kkkkk.', '..kkhhhhhk', '.khhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', '.khhhhhhhh', '.kh.h.hh.h', '..h.......',
  ],
  body: UNIFORM,
}

const aoi: Character = {
  id: 'aoi', name: 'Aoi', breath: 'insect', accent: '#4f7fd0', noBlade: true,
  pal: { h: '#2a2f4a', H: '#1b1f33', t: '#3a4266', e: '#4f7fd0', B: '#2a2f4a' },
  hair: [
    '..........', '..........', '....kkkkkk', '...khhhhhh', '..khhhhhhh', '.khhhhhhhh', '.khhhhhhhh',
    '.khhhHhhhh', '.khhhhhhhh', '.khhhhhhhh', '.kh.hh.hhh', '.kh.......', '..k.......',
  ],
  body: [
    '.......kss', '....kkuuww', '...kuuuuwu', '..kuuuuuuu', '..kuuuu000', '.kuuuu0000', '.kuuuu0000',
    '.kuuuu0000', 'kuuuuu0000', 'kuuuuu0000', 'kuuuuu0000', 'kuuuuu000k', 'kuuuuu000k', 'kkkkkkkkkk',
  ],
  extra: [[3, 8, ['.kk', 'khk', 'khk', 'khk', '.kk']], [26, 8, ['kk.', 'khk', 'khk', 'khk', 'kk.']], [3, 5, ['P.P', '.k.']], [26, 5, ['P.P', '.k.']]],
}

const kanae: Character = {
  id: 'kanae', name: 'Kanae', breath: 'flower', accent: '#d27aa8',
  pal: { h: '#1f1a24', H: '#110e14', t: '#2e2836', e: '#c9a0dc', B: '#1f1a24', x: '#f28cb8', P: '#f2a6c8', Q: '#d27aa8', a: '#fbeff4', b: '#f6c6d8', c: '#e48ab0', C: '#b85a86' },
  hair: LONG_HAIR,
  haori: (x, y) => (y > 23 && (x + y) % 7 === 0 ? 'k' : y < 22 ? 'a' : y < 25 ? 'b' : y < 28 ? 'c' : 'C'),
  extra: [[4, 3, ['PP.PP', 'QPkPQ', '.P.P.']], [23, 3, ['PP.PP', 'QPkPQ', '.P.P.']]],
}

const tamayo: Character = {
  id: 'tamayo', name: 'Tamayo', breath: 'flower', accent: '#9a5fb8', noBlade: true,
  pal: { h: '#2a1d1d', H: '#170f0f', t: '#3d2a2a', e: '#a26ad6', B: '#2a1d1d', a: '#5b2f5f', b: '#c17ac9' },
  hair: [
    '......kkkk', '.....khhhh', '....kkhhhh', '...khhhhhh', '..khhhhhhh', '.khhhhhhhh', '.khhhhhhhh',
    'khhhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khhhh.....', 'khh.......', 'khh.......', '.kh.......',
  ],
  body: KIMONO,
  haori: (x, y) => ((x % 4 === 1 && y % 4 === 1) || (x % 4 !== 1 && x % 2 === 0 && y % 4 === 2 && x % 4 !== 3) ? 'b' : 'a'),
  extra: [[20, 1, ['.P.', 'PQP', '.P.']]],
}

const yushiro: Character = {
  id: 'yushiro', name: 'Yushiro', breath: 'mist', accent: '#5a8a6a', noBlade: true,
  pal: { h: '#1f2a24', H: '#121a16', t: '#33463c', e: '#d9b44a', B: '#1f2a24', a: '#3a3450', b: '#5a5070', R: '#d0303a' },
  hair: [
    '..........', '..........', '...kkkkkkk', '..khhhhhhh', '.khhhhhhhh', 'khhhhhhhhh', 'khhhhhhhhh',
    'khhhHhhhhh', 'khhhhhhhhh', 'khhhhhhhhh', 'khthhth.th', '.kt.......',
  ],
  body: KIMONO,
  haori: (x, y) => ((x + y) % 5 === 0 ? 'b' : 'a'),
  extra: [[12, 4, ['kkkkkkkk', 'k00kk00k', 'k0kRRk0k', 'k00kk00k', 'kkkkkkkk']]],
}

export const CHARACTERS = [
  tanjiro, zenitsu, inosuke, shinobu, rengoku, giyu, kanao, muichiro, mitsuri, obanai, sanemi, gyomei,
  tengen, genya, nezuko, urokodaki, sabito, makomo, murata, aoi, kanae, tamayo, yushiro,
]
export const STARTERS = ['tanjiro', 'zenitsu', 'inosuke', 'shinobu', 'rengoku']
export const charById = (id: string) => CHARACTERS.find(c => c.id === id) ?? tanjiro
