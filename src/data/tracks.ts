// Pemetaan Pernapasan → Track (PRD 2.1). server: bahasa compiled, dijalankan di server eksekusi (butuh koneksi).
export const TRACKS: { id: string; breath: string; emoji: string; name: string; mentor: string; color: string; server?: boolean }[] = [
  { id: 'python', breath: 'Water', emoji: '🌊', name: 'Python', mentor: 'Giyu & Tanjiro', color: '#3b8fd1' },
  { id: 'c', breath: 'Flame', emoji: '🔥', name: 'C', mentor: 'Rengoku', color: '#e2452c', server: true },
  { id: 'js', breath: 'Thunder', emoji: '⚡', name: 'JavaScript / TypeScript', mentor: 'Zenitsu', color: '#e8a90f' },
  { id: 'bash', breath: 'Beast', emoji: '🐗', name: 'Bash & Linux', mentor: 'Inosuke', color: '#5b6ea6' },
  { id: 'web', breath: 'Flower', emoji: '🌸', name: 'HTML / CSS', mentor: 'Kanao', color: '#e2799b' },
  { id: 'cpp', breath: 'Mist', emoji: '🌫️', name: 'C++', mentor: 'Muichiro', color: '#7fb5b0', server: true },
  { id: 'mobile', breath: 'Love', emoji: '💗', name: 'Kotlin / Dart', mentor: 'Mitsuri', color: '#e86aa6', server: true },
  { id: 'java', breath: 'Serpent', emoji: '🐍', name: 'Java', mentor: 'Obanai', color: '#8a6fb8', server: true },
  { id: 'go', breath: 'Wind', emoji: '🌪️', name: 'Go', mentor: 'Sanemi', color: '#4caf7a', server: true },
  { id: 'rust', breath: 'Stone', emoji: '🪨', name: 'Rust', mentor: 'Gyomei', color: '#8d7b68', server: true },
  { id: 'csharp', breath: 'Sound', emoji: '🎵', name: 'C# / .NET', mentor: 'Tengen', color: '#c06bd1', server: true },
  { id: 'cyber', breath: 'Insect', emoji: '🦋', name: 'Cyber Security', mentor: 'Shinobu', color: '#9b6fd1' },
  { id: 'dsa', breath: 'Sun', emoji: '☀️', name: 'DSA & Computer Science', mentor: 'Tanjiro (Hinokami)', color: '#f08a24' },
  { id: 'sql', breath: '—', emoji: '🩸', name: 'SQL & Database', mentor: 'Tamayo & Yushiro', color: '#b5446e' },
  { id: 'git', breath: '—', emoji: '🌿', name: 'Git & GitHub', mentor: 'Murata', color: '#e0612f' },
  { id: 'network', breath: '—', emoji: '🐦‍⬛', name: 'Networking', mentor: 'Gagak Kasugai', color: '#4a7fa8' },
]

export const trackById = (id: string) => TRACKS.find(t => t.id === id)!

// Path Builder: urutan track default per tujuan; bahasa minat ditambahkan di belakang.
export const GOALS = [
  { id: 'backend', label: 'Kerja jadi backend dev', path: ['python', 'git', 'sql', 'bash', 'network', 'go', 'dsa'] },
  { id: 'cyber', label: 'Jago CTF & cyber security', path: ['bash', 'python', 'network', 'cyber'] },
  { id: 'kuliah', label: 'Lulus kuliah / masuk CS', path: ['python', 'c', 'dsa', 'sql'] },
  { id: 'game', label: 'Bikin game', path: ['js', 'csharp', 'cpp', 'dsa'] },
  { id: 'web', label: 'Bikin website', path: ['web', 'js', 'sql'] },
  { id: 'mobile', label: 'Bikin aplikasi HP', path: ['js', 'mobile'] },
  { id: 'olim', label: 'Olimpiade informatika', path: ['python', 'cpp', 'dsa'] },
]
export const EXPERIENCE = ['Belum pernah ngoding', 'Pernah coba sedikit', 'Sudah bisa satu bahasa', 'Sudah berpengalaman']
export const MINUTES = [15, 30, 60, 90]

export const recommendPath = (goal: string, interests: string[]) =>
  [...new Set([...(GOALS.find(g => g.id === goal)?.path ?? []), ...interests])]
