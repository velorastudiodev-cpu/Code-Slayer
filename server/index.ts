// Server eksekusi tipis (Fastify): proxy ke Piston (produksi) atau compiler lokal (pengembangan), dengan rate limit.
// Jalankan: npm run server   (EXEC_BACKEND=piston PISTON_URL=http://piston:2000 untuk Docker)
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import cors from '@fastify/cors'
import { COMPILED, runCompiled, type CLang } from './compiled.ts'
import { runPiston } from './piston.ts'

const BACKEND = process.env.EXEC_BACKEND ?? 'local'
const PISTON_URL = process.env.PISTON_URL ?? 'http://127.0.0.1:2000'

// Origin yang boleh memanggil /api dari halaman lain: APK Android (Capacitor) & iOS, plus daftar tambahan dari
// ALLOWED_ORIGINS (dipisah koma), mis. domain web tempat frontend di-hosting terpisah. Same-origin tidak butuh CORS.
export const APP_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost']
export const allowedOrigins = (env = process.env.ALLOWED_ORIGINS) => [...APP_ORIGINS, ...(env ?? '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)]

export function build() {
  // Soal olimpiade bisa mengirim input besar (hingga ~10 MB per tes).
  // TRUST_PROXY=1 bila di belakang reverse proxy (Caddy/Nginx): rate limit memakai IP asli user, bukan IP proxy.
  const app = Fastify({ bodyLimit: 32 * 1024 * 1024, trustProxy: process.env.TRUST_PROXY === '1' })
  app.register(rateLimit, { max: 60, timeWindow: '1 minute' })
  const origins = allowedOrigins()
  app.register(cors, { origin: (o, cb) => cb(null, !o || origins.includes(o)), methods: ['GET', 'POST'], maxAge: 86400 })

  app.get('/api/health', async () => ({ ok: true, backend: BACKEND, langs: COMPILED }))

  app.post<{ Body: { lang: CLang; code: string; inputs: string[]; timeLimitMs?: number } }>('/api/run', {
    schema: {
      body: {
        type: 'object', required: ['lang', 'code', 'inputs'],
        properties: {
          lang: { enum: COMPILED },
          code: { type: 'string', maxLength: 65536 },
          inputs: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 12 * 1048576 } },
          timeLimitMs: { type: 'integer', minimum: 100, maximum: 5000 },
        },
      },
    },
  }, async ({ body: { lang, code, inputs, timeLimitMs } }) => ({
    results: BACKEND === 'piston' ? await runPiston(PISTON_URL, lang, code, inputs, fetch, timeLimitMs) : await runCompiled(lang, code, inputs, timeLimitMs ? { timeoutMs: timeLimitMs } : undefined),
  }))

  // Produksi satu proses: sajikan hasil build frontend juga.
  const dist = resolve(import.meta.dirname, '../dist')
  if (existsSync(dist)) {
    app.register(fastifyStatic, { root: dist })
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html')))
  }
  return app
}

if (process.argv[1]?.endsWith('index.ts')) {
  const port = Number(process.env.PORT ?? 8787)
  await build().listen({ port, host: process.env.HOST ?? '127.0.0.1' })
  console.log(`server eksekusi (${BACKEND}) di http://${process.env.HOST ?? '127.0.0.1'}:${port}`)
}
