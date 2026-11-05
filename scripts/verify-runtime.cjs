// Jalankan semua solusi referensi di runtime browser asli (Pyodide/worker). Butuh: npm run dev + Playwright.
// Pemakaian: node scripts/verify-runtime.cjs [url] [track,track,...]  (C/C++/Java butuh npm run server)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto((process.argv[2] ?? 'http://localhost:5173') + '/mulai');
  const res = await p.evaluate(async TRACKS => {
    const { grade, runMany } = await import('/src/run/index.ts');
    const { assemble } = await import('/src/data/exercise-types.ts');
    const out = { total: 0, fail: [], slow: [] };
    for (const track of TRACKS) {
      const data = (await import(`/src/generated/${track}.json`)).default;
      for (const ch of Object.values(data.chapters)) for (const ex of ch.exercises) {
        const t = performance.now();
        out.total++;
        // Read the Error: kodenya harus error juga di runtime browser.
        if (ex.type === 'readerror') {
          const [r] = await runMany(ex.lang, ex.code, [(ex.setup ?? '') + (ex.tests[0]?.input ?? '')]);
          if (r.ok) out.fail.push(`${ex.id}: tidak error di browser`);
          continue;
        }
        if (!ex.tests.length) { out.total--; continue; } // trace/complexity/typing/review: dinilai di UI
        const code = ex.type === 'predict' ? ex.code : ex.solutions[0];
        const r = await grade(ex.lang, assemble(ex, code), ex.tests, ex.setup ?? '');
        const ms = performance.now() - t;
        if (!r.every(x => x.pass)) out.fail.push(`${ex.id}: ${r.map(x => x.pass ? '✓' : '✗ ' + (x.run.stderr || x.run.stdout).slice(0, 120)).join(' | ')}`);
        if (ms > 1500) out.slow.push(`${ex.id} ${Math.round(ms)}ms`);
      }
    }
    return out;
  }, process.argv[3] ? process.argv[3].split(',') : ['python', 'js', 'sql', 'dsa', 'c', 'cpp', 'java']);
  console.log('dijalankan:', res.total, '| gagal:', res.fail.length);
  res.fail.forEach(f => console.log('  FAIL', f));
  console.log('lambat (>1.5s, termasuk muat runtime):', res.slow.join(', ') || '-');
  await b.close();
  process.exitCode = res.fail.length ? 1 : 0;
})();
