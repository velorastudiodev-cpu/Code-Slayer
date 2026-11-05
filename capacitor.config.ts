import type { CapacitorConfig } from '@capacitor/cli'

// APK Android: aset web dari `dist` dibundel ke dalam APK (offline-first).
// Bahasa compiled butuh server eksekusi: build dengan VITE_API_URL=https://server-kamu/api sebelum `npx cap sync`.
const config: CapacitorConfig = {
  appId: 'id.codeslayer.app',
  appName: 'Code Slayer',
  webDir: 'dist',
  android: { backgroundColor: '#f4eee2' },
}

export default config
