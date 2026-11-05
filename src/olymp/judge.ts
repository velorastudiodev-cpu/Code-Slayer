// Juri soal olimpiade: input dibangkitkan di browser (generator deterministik yang sama dengan build), lalu dijalankan
// per subtask (C++ di server eksekusi dengan time limit soal; Python di Pyodide).
import { runMany, type Lang, type Run } from '../run'
import { norm } from '../run/exec'
import { genInput } from './gen'
import { subtaskScore, type Problem } from './logic'

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'
export type TestResult = { verdict: Verdict; run: Run }
export type Judged = { samples: (TestResult & { input: string; expected: string })[]; subtasks: { points: number; earned: number; tests: TestResult[] }[]; score: number; earned: number[] }

const verdictOf = (r: Run, expected: string): Verdict => (r.timeout ? 'TLE' : r.stderr.startsWith('Gagal kompilasi') ? 'CE' : !r.ok ? 'RE' : norm(r.stdout) === norm(expected) ? 'AC' : 'WA')

// Kesalahan kompilasi/offline sudah terlihat di contoh: tidak perlu menjalankan subtask.
export async function judge(p: Problem, lang: Lang, code: string, onProgress?: (msg: string) => void): Promise<Judged> {
  const opts = { timeLimitMs: p.tl }
  onProgress?.('Menjalankan contoh…')
  const sr = await runMany(lang, code, p.samples.map(s => s.input), opts)
  const samples = p.samples.map((s, i) => ({ ...s, run: sr[i], verdict: verdictOf(sr[i], s.expected) }))
  const subtasks: Judged['subtasks'] = []
  if (sr.some(r => r.offline || r.stderr.startsWith('Gagal kompilasi'))) {
    for (const st of p.subtasks) subtasks.push({ points: st.points, earned: 0, tests: st.tests.map(() => ({ verdict: verdictOf(sr[0], ''), run: sr[0] })) })
    return { samples, subtasks, score: 0, earned: subtasks.map(() => 0) }
  }
  for (const [k, st] of p.subtasks.entries()) {
    onProgress?.(`Subtask ${k + 1}/${p.subtasks.length}: membangkitkan & menjalankan ${st.tests.length} tes…`)
    const inputs = st.tests.map(t => genInput(t.gen ? { gen: t.gen, seed: t.seed! } : (t.input ?? '')))
    const runs = await runMany(lang, code, inputs, opts)
    const tests = runs.map((r, i) => ({ run: r, verdict: verdictOf(r, st.tests[i].expected) }))
    subtasks.push({ points: st.points, earned: subtaskScore(st, tests.map(t => t.verdict === 'AC')), tests })
    // Kesalahan kompilasi / server mati: tidak perlu menjalankan subtask berikutnya.
    if (runs.some(r => r.offline || r.stderr.startsWith('Gagal kompilasi'))) {
      for (const rest of p.subtasks.slice(k + 1)) subtasks.push({ points: rest.points, earned: 0, tests: rest.tests.map(() => ({ verdict: verdictOf(runs[0], ''), run: runs[0] })) })
      break
    }
  }
  const earned = subtasks.map(s => s.earned)
  return { samples, subtasks, score: earned.reduce((a, b) => a + b, 0), earned }
}

export const CPP_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;
typedef long long ll;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // tulis solusimu di sini
}
`
export const PY_TEMPLATE = `import sys
data = sys.stdin.read().split()
# tulis solusimu di sini
`
