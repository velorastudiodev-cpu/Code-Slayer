// Kerangka kurikulum (PRD bagian 5). Tiap level ditutup Upper Moon; tiap bab punya Lower Moon exam.
export const LEVELS = ['Fondasi', 'Menengah', 'Lanjut', 'Profesional'] as const
export type Level = (typeof LEVELS)[number]
export type Node = { id: string; title: string; level: Level; boss?: boolean }

export const RANKS = ['Mizunoto', 'Mizunoe', 'Kanoto', 'Kanoe', 'Tsuchinoto', 'Tsuchinoe', 'Hinoto', 'Hinoe', 'Kinoto', 'Kinoe']

const LANG = {
  Fondasi: ['Sintaks & Output', 'Variabel & Tipe Data', 'Operator', 'Input', 'Kondisi', 'Loop', 'Fungsi'],
  Menengah: ['Koleksi', 'String', 'Error Handling', 'File I/O', 'Modul & Package', 'OOP'],
  Lanjut: ['Testing', 'Debugging', 'Performa'],
  Profesional: ['Tooling', 'Idiom & Best Practice', 'Design Pattern', 'Project Nyata'],
}

// Fitur khas bahasa, disisipkan di awal level Lanjut.
const SPECIAL: Record<string, string[]> = {
  python: ['Comprehension & Generator', 'Decorator & Context Manager'],
  js: ['Async & Promise', 'TypeScript Dasar'],
  c: ['Pointer', 'Manajemen Memori'],
  cpp: ['Pointer & Referensi', 'STL & Template'],
  java: ['Generics', 'Lambda & Stream'],
  go: ['Goroutine & Channel', 'Interface'],
  rust: ['Ownership & Borrowing', 'Trait & Lifetime'],
  csharp: ['LINQ', 'Async/Await'],
  mobile: ['Coroutine & Future', 'UI Deklaratif'],
}

const CUSTOM: Record<string, Record<Level, string[]>> = {
  bash: {
    Fondasi: ['Navigasi Filesystem', 'File & Direktori', 'Permission', 'Pipe & Redirect', 'Variabel Shell', 'Kondisi & Loop', 'Fungsi Shell'],
    Menengah: ['grep, sed, awk', 'Proses & Job', 'Argumen Script', 'Cron & Otomasi', 'Paket & Service', 'SSH'],
    Lanjut: ['Text Processing Lanjut', 'Debugging Script', 'Hardening Dasar'],
    Profesional: ['Tooling CLI', 'Best Practice Script', 'Project: Backup Tool'],
  },
  web: {
    Fondasi: ['Struktur HTML', 'Teks & Link', 'Gambar & Media', 'Form', 'Selector CSS', 'Box Model', 'Warna & Tipografi'],
    Menengah: ['Flexbox', 'Grid', 'Responsive', 'Transisi & Animasi', 'Aksesibilitas', 'DOM dengan JS'],
    Lanjut: ['Komponen', 'Performa Web', 'SEO Dasar'],
    Profesional: ['Tooling (Vite)', 'Design System', 'Project: Landing Page'],
  },
  sql: {
    Fondasi: ['SELECT', 'WHERE', 'ORDER BY & LIMIT', 'Fungsi Agregat', 'GROUP BY', 'JOIN', 'Subquery'],
    Menengah: ['INSERT, UPDATE, DELETE', 'Desain Tabel', 'Constraint', 'Index', 'View', 'Transaksi'],
    Lanjut: ['Window Function', 'CTE & Rekursif', 'Query Plan'],
    Profesional: ['Normalisasi', 'Migrasi', 'Project: Database Toko'],
  },
  cyber: {
    Fondasi: ['Etika & Hukum', 'CIA Triad & Threat Model', 'Jenis Serangan', 'Linux untuk Security', 'Networking Security', 'Kriptografi Dasar', 'Password & Hashing'],
    Menengah: ['SQL Injection', 'XSS', 'CSRF & IDOR', 'Auth Bypass & SSRF', 'Secure Coding', 'Forensik'],
    Lanjut: ['Reverse Engineering', 'OSINT', 'Analisis Log'],
    Profesional: ['CTF Web', 'CTF Crypto & Forensik', 'CTF Rev & Misc'],
  },
  git: {
    Fondasi: ['Repo & Commit', 'Status & Diff', 'Riwayat (log)', 'Branch', 'Merge', 'Konflik', 'Remote & GitHub'],
    Menengah: ['Rebase', 'Reset & Revert', 'Stash', 'Tag & Rilis', '.gitignore', 'Pull Request'],
    Lanjut: ['Cherry-pick', 'Bisect', 'Reflog'],
    Profesional: ['Alur Kerja Tim', 'Hooks', 'Project: Rilis Pertama'],
  },
  network: {
    Fondasi: ['Model OSI & TCP/IP', 'IP Address', 'Subnetting', 'Port & Protokol', 'TCP vs UDP', 'DNS', 'HTTP'],
    Menengah: ['HTTPS & TLS', 'Routing', 'NAT & Firewall', 'REST & JSON', 'Packet & Wireshark', 'Troubleshooting'],
    Lanjut: ['IPv6', 'Load Balancer & CDN', 'WebSocket'],
    Profesional: ['Desain Jaringan', 'Observability', 'Project: Peta Jaringan Desa'],
  },
  dsa: {
    Fondasi: ['Logika & Pseudocode', 'Big-O', 'Array', 'Rekursi', 'Searching', 'Sorting', 'Two Pointers'],
    Menengah: ['Linked List', 'Stack & Queue', 'Hash Map', 'Sliding Window', 'Tree', 'Heap'],
    Lanjut: ['Graph, BFS & DFS', 'Greedy', 'Dynamic Programming'],
    Profesional: ['Shortest Path', 'DP Lanjut', 'System Design Dasar'],
  },
}

// Id bab: huruf level + nomor (f1, m3, l2, p4); boss: f-boss, m-boss, ...
export function nodesOf(track: string): Node[] {
  const t = CUSTOM[track] ?? { ...LANG, Lanjut: [...(SPECIAL[track] ?? []), ...LANG.Lanjut] }
  return LEVELS.flatMap(level => {
    const p = level[0].toLowerCase()
    return [
      ...t[level].map((title, i) => ({ id: `${p}${i + 1}`, title, level })),
      { id: `${p}-boss`, title: `Upper Moon: ${level}`, level, boss: true },
    ]
  })
}

export const chapterCount = (nodes: Node[]) => nodes.filter(n => !n.boss).length

// Final Selection hanya bisa menempatkan sampai awal level Lanjut; sisanya wajib lewat exam.
export const placeable = (nodes: Node[]) => nodes.filter(n => !n.boss && (n.level === 'Fondasi' || n.level === 'Menengah'))

// Hasil placement `lo` bab → daftar node yang dianggap lulus (termasuk Upper Moon level yang tuntas).
export function passedFromPlacement(nodes: Node[], lo: number): string[] {
  const done = new Set(placeable(nodes).slice(0, lo).map(n => n.id))
  return nodes.filter(n => done.has(n.id) || (n.boss && nodes.filter(c => c.level === n.level && !c.boss).every(c => done.has(c.id)))).map(n => n.id)
}

// Jalur linear: node yang boleh diuji hanya node pertama yang belum lulus.
export const currentIndex = (nodes: Node[], passed: string[]) => nodes.findIndex(n => !passed.includes(n.id))
// Bab terbuka = sudah lulus atau bab berikutnya (latihan & pelajaran boleh dibuka).
export const isOpen = (nodes: Node[], passed: string[], id: string) => passed.includes(id) || canTakeExam(nodes, passed, id)
export const canTakeExam = (nodes: Node[], passed: string[], id: string) => nodes[currentIndex(nodes, passed)]?.id === id

export function rankOf(nodes: Node[], passed: string[]) {
  const total = chapterCount(nodes)
  const done = nodes.filter(n => !n.boss && passed.includes(n.id)).length
  return done === total ? 9 : Math.floor((done * 9) / total)
}
