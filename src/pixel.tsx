// Renderer pixel art: grid string (1 huruf = 1 piksel, '.' = transparan) → SVG crisp.
export type Pal = Record<string, string>

export const blank = (w: number, h: number) => Array.from({ length: h }, () => Array<string>(w).fill('.'))

export function paint(g: string[][], rows: string[], x0: number, y0: number) {
  rows.forEach((r, y) => [...r].forEach((k, x) => {
    if (k !== '.' && g[y0 + y]?.[x0 + x] !== undefined) g[y0 + y][x0 + x] = k
  }))
}

// Setengah kiri → sprite simetris.
export const sym = (half: string[]) => half.map(r => r + [...r].reverse().join(''))

export function Pixels({ rows, pal, size, label, className }: {
  rows: string[]; pal: Pal; size: number; label?: string; className?: string
}) {
  const w = rows[0].length, h = rows.length
  const rects: React.ReactNode[] = []
  rows.forEach((r, y) => {
    for (let x = 0; x < w;) {
      let e = x + 1
      while (r[e] === r[x]) e++
      if (r[x] !== '.') rects.push(<rect key={x + ',' + y} x={x} y={y} width={e - x} height="1" style={{ fill: pal[r[x]] ?? '#f0f' }} />)
      x = e
    }
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} shapeRendering="crispEdges" className={className}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g className="sprite">{rects}</g>
    </svg>
  )
}

const ICON_PAL = { k: 'currentColor', a: 'var(--accent)' }
const ICONS = {
  home: ['.....k.....', '....kak....', '...kaaak...', '..kaaaaak..', '.kkkkkkkkk.', '..k.....k..', '..k.kkk.k..', '..k.k.k.k..', '..k.k.k.k..', '..kkkkkkk..'],
  scroll: ['..kkkkkkk..', '.kaaaaaaak.', '..k.....k..', '..k.kkk.k..', '..k.....k..', '..k.kkk.k..', '..k.....k..', '.kaaaaaaak.', '..kkkkkkk..'],
  sword: ['.........kk', '........kak', '.......kak.', '......kak..', '.....kak...', '.k..kak....', '..kkak.....', '..kkk......', '.k..k......', 'k..........'],
  term: ['kkkkkkkkkkk', 'kaaaaaaaaak', 'kkkkkkkkkkk', 'k.........k', 'k.k.......k', 'k..k......k', 'k.k..kkk..k', 'k.........k', 'kkkkkkkkkkk'],
  slayer: ['...kkkkk...', '..k.....k..', '..k.k.k.k..', '..k.....k..', '...kkkkk...', '..kaaaaak..', '.kaakkkaak.', '.kaaaaaaak.', '.kkkkkkkkk.'],
  lock: ['..kkkkk..', '.k.....k.', '.k.....k.', 'kkkkkkkkk', 'kaaaaaaak', 'kaaakaaak', 'kaaakaaak', 'kaaaaaaak', 'kkkkkkkkk'],
  check: ['........k', '.......kk', 'k.....kk.', 'kk...kk..', '.kk.kk...', '..kkk....', '...k.....'],
  moon: ['...kkkk..', '.kkaak...', 'kkaak....', 'kaak.....', 'kaak.....', 'kaak.....', 'kkaak....', '.kkaak...', '...kkkk..'],
  coin: ['..kkkkk..', '.kaaaaak.', 'kaabbbaak', 'kaaaaaaak', 'kaabbbaak', 'kaaaaaaak', 'kaabbbaak', '.kaaaaak.', '..kkkkk..'],
  medal: ['.kk...kk.', '.kck.kck.', '..kckck..', '...kkk...', '..kbbbk..', '.kbbabbk.', '.kbaaabk.', '.kbbabbk.', '..kbbbk..', '...kkk...'],
  mark: ['....k....', '...kak...', '..kaak...', '..kaaak..', '.kaabaak.', '.kabbbak.', '.kabbbak.', '..kaaak..', '...kkk...'],
  freeze: ['....k....', '.k..k..k.', '..k.k.k..', '...kkk...', 'kkkkkkkkk', '...kkk...', '..k.k.k..', '.k..k..k.', '....k....'],
  crow: ['....kkk.....', '...kkwkkb...', '...kkkkbb...', '..kkkkk.....', '.kkkkkkk....', 'kkkkkkkkk...', '..kkkkkk....', '...b..b.....'],
}

const PALS: Partial<Record<keyof typeof ICONS, Record<string, string>>> = {
  crow: { k: '#1a1218', w: '#e8e0cf', b: '#6b6470' },
  coin: { k: '#5a3d0c', a: '#f2c14e', b: '#c9921c' },
  medal: { k: '#3a2a10', a: '#fff1b8', b: '#e0b33a', c: 'var(--accent)' },
  mark: { k: '#4a0f12', a: '#d23c2c', b: '#f6a23a' },
  freeze: { k: '#3b8fd1' },
}

export type IconName = keyof typeof ICONS
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const pal = PALS[name] ?? ICON_PAL
  return <Pixels rows={ICONS[name]} pal={pal} size={size} className="icon" />
}
