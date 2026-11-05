// Dipanggil build-content: jalankan JS/TS dengan eksekutor yang sama dengan worker. stdin = JSON { code, input, ts }.
import { readFileSync } from 'node:fs'
import { execJs } from '../src/run/exec.ts'
const { code, input, ts } = JSON.parse(readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify(await execJs(code, input, ts)))
process.exit(0)
