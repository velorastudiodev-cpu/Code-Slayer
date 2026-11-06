import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Editor } from '../Editor'
import { HtmlPreview } from '../components/HtmlPreview'
import { runMany, type Lang, type Run } from '../run'
import { ServerBanner, useServerStatus } from '../run/status'
import { Debugger } from '../Debugger'

const LANGS: [Lang, string][] = [['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['sql', 'SQL'], ['c', 'C (butuh server)'], ['cpp', 'C++ (butuh server)'], ['java', 'Java (butuh server)'], ['go', 'Go (butuh server)'], ['rust', 'Rust (butuh server)'], ['csharp', 'C# (butuh server)'], ['kotlin', 'Kotlin (butuh server)'], ['bash', 'Bash (terminal simulasi)'], ['html', 'HTML / CSS']]
const SAMPLE: Record<Lang, [code: string, stdin: string]> = {
  python: ['nama = input()\nprint(f"Halo, {nama}!")\n', 'Tanjiro'],
  javascript: ['const nama = readline()\nconsole.log(`Halo, ${nama}!`)\n', 'Zenitsu'],
  typescript: ['const nama: string = readline() ?? ""\nconsole.log(`Halo, ${nama}!`)\n', 'Inosuke'],
  c: ['#include <stdio.h>\n\nint main(void) {\n    char nama[64];\n    scanf("%63s", nama);\n    printf("Halo, %s!\\n", nama);\n    return 0;\n}\n', 'Rengoku'],
  cpp: ['#include <iostream>\n#include <string>\n\nint main() {\n    std::string nama;\n    std::cin >> nama;\n    std::cout << "Halo, " << nama << "!\\n";\n}\n', 'Muichiro'],
  html: ['<!doctype html>\n<style>\n  h1 { color: crimson; }\n  .kartu { border: 3px solid #222; padding: 12px; }\n</style>\n<div class="kartu">\n  <h1>Kamado Tanjiro</h1>\n  <p>Pernapasan Air</p>\n</div>\n', ''],
  bash: ['read nama\necho "Halo, $nama!"\nmkdir -p misi && echo "Kaa!" > misi/surat.txt\nls misi && cat misi/surat.txt\n', 'Inosuke'],
  go: ['package main\n\nimport "fmt"\n\nfunc main() {\n    var nama string\n    fmt.Scan(&nama)\n    fmt.Printf("Halo, %s!\\n", nama)\n}\n', 'Sanemi'],
  rust: ['use std::io;\n\nfn main() {\n    let mut nama = String::new();\n    io::stdin().read_line(&mut nama).unwrap();\n    println!("Halo, {}!", nama.trim());\n}\n', 'Gyomei'],
  csharp: ['using System;\n\nclass Program {\n    static void Main() {\n        string nama = Console.ReadLine();\n        Console.WriteLine($"Halo, {nama}!");\n    }\n}\n', 'Tengen'],
  kotlin: ['fun main() {\n    val nama = readLine()!!.trim()\n    println("Halo, $nama!")\n}\n', 'Mitsuri'],
  java: ['import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.println("Halo, " + in.next() + "!");\n    }\n}\n', 'Obanai'],
  sql: [
    'SELECT nama, pernapasan FROM slayer\nWHERE umur < 20\nORDER BY nama;\n',
    "CREATE TABLE slayer (id INTEGER PRIMARY KEY, nama TEXT, pernapasan TEXT, umur INTEGER);\nINSERT INTO slayer (nama, pernapasan, umur) VALUES\n  ('Tanjiro', 'Air', 15), ('Zenitsu', 'Petir', 16), ('Inosuke', 'Binatang', 15),\n  ('Rengoku', 'Api', 20), ('Shinobu', 'Serangga', 18);\n",
  ],
}

// Draf per bahasa disimpan di browser ini saja (kenyamanan, bukan data penting).
const load = (lang: Lang): [string, string] => {
  try { const s = localStorage.getItem(`pg:${lang}`); if (s) return JSON.parse(s) } catch { /* storage tidak tersedia */ }
  return SAMPLE[lang]
}
const save = (lang: Lang, v: [string, string]) => { try { localStorage.setItem(`pg:${lang}`, JSON.stringify(v)) } catch { /* abaikan */ } }

export default function Playground() {
  const [lang, setLang] = useState<Lang>('python')
  const [[code, stdin], setDraft] = useState(() => load('python'))
  const [out, setOut] = useState<Run | null>(null)
  const [status, setStatus] = useState('')
  const update = (v: [string, string]) => { setDraft(v); save(lang, v) }
  const server = useServerStatus(lang)
  const [debug, setDebug] = useState<[string, string] | null>(null)

  async function run() {
    setStatus('Menyiapkan runtime…')
    const [r] = await runMany(lang, code, [stdin], { header: true, onStart: () => setStatus('Menjalankan…') })
    setOut(r)
    setStatus('')
  }

  return (
    <div className="page">
      <div className="row">
        <h1>Playground</h1>
        <select value={lang} aria-label="Bahasa" onChange={e => { const l = e.target.value as Lang; setLang(l); setDraft(load(l)); setOut(null) }}>
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <Link className="card link" to="/terminal">🐗 Terminal Linux interaktif (shell + filesystem virtual) →</Link>
      <Editor key={lang} value={code} lang={lang} onChange={v => update([v, stdin])} label="Editor playground" />
      {lang === 'html' && <HtmlPreview code={code} />}
      {lang !== 'html' && <label className="field">
        <small className="muted">{lang === 'sql' ? 'Setup (CREATE / INSERT)' : 'Input (stdin)'}</small>
        <textarea rows={lang === 'sql' ? 6 : 3} value={stdin} spellCheck={false} onChange={e => update([code, e.target.value])} />
      </label>}
      <ServerBanner status={server} />
      <div className="row-actions">
        {lang === 'python' && <button className="btn-ghost" onClick={() => setDebug([code, stdin])}>🐞 Debug</button>}
        {lang !== 'html' && <button className="btn-primary" disabled={!!status || ['offline', 'checking', 'none'].includes(server)} onClick={run}>{status || 'Jalankan'}</button>}
      </div>
      {debug && lang === 'python' && <Debugger key={debug.join('\u0000')} code={debug[0]} stdin={debug[1]} onClose={() => setDebug(null)} />}
      {out && (
        <section>
          <small className="muted">Output{out.ok ? '' : ' (error)'}</small>
          <pre className="code">{out.stdout || (out.stderr ? '' : '(tidak ada output)')}{out.stderr && <span className="stderr-inline">{out.stderr}</span>}</pre>
        </section>
      )}
    </div>
  )
}
