import { defineConfig } from '@playwright/test'

// E2E alur utama. Server eksekusi (bahasa compiled) + Vite dev dijalankan otomatis bila belum hidup.
// Browser: Chromium bawaan Playwright (atau PW_CHROMIUM=/path untuk Chromium sistem).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    { command: 'npm run server', url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
})
