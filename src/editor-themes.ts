// Tema editor dari gacha: token warna saja (ringan), dipakai Editor (CodeMirror) dan pratinjau di Gacha.
export type ThemeTokens = { bg: string; fg: string; gutter: string; cursor: string; select: string; keyword: string; string: string; number: string; comment: string; fn: string; dark: boolean }

export const EDITOR_THEMES: Record<string, ThemeTokens> = {
  'theme:washi': { bg: '#f7f1e3', fg: '#2b2420', gutter: '#ece3cf', cursor: '#b3122e', select: '#e8d9b5', keyword: '#b3122e', string: '#2f7a4a', number: '#9a5a00', comment: '#857a6b', fn: '#2a5aa8', dark: false },
  'theme:wisteria': { bg: '#1e1a2b', fg: '#e8e2f4', gutter: '#262036', cursor: '#c9a0ff', select: '#3b2f5a', keyword: '#c9a0ff', string: '#9fe0b0', number: '#ffb87a', comment: '#8d83a5', fn: '#7fc8ff', dark: true },
  'theme:bulan': { bg: '#160d10', fg: '#f0e0e0', gutter: '#1f1216', cursor: '#ff4a5a', select: '#3a1a22', keyword: '#ff6a78', string: '#f2c14e', number: '#ff9a5a', comment: '#8f6f77', fn: '#e88ac4', dark: true },
}
