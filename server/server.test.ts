import { expect, it } from 'vitest'
import { runCompiled } from './compiled'
import { runPiston } from './piston'
import { build } from './index'

const C_SUM = '#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}'

it('local: C, C++, Java dikompilasi & dijalankan per input', async () => {
  expect((await runCompiled('c', C_SUM, ['3 4', '-1 1'])).map(r => r.stdout)).toEqual(['7\n', '0\n'])
  const cpp = '#include <bits/stdc++.h>\nint main(){std::string s;std::cin>>s;std::reverse(s.begin(),s.end());std::cout<<s<<"\\n";}'
  expect((await runCompiled('cpp', cpp, ['kaa']))[0]).toMatchObject({ stdout: 'aak\n', ok: true })
  const java = 'import java.util.*;\npublic class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()*2);}}'
  expect((await runCompiled('java', java, ['21']))[0]).toMatchObject({ stdout: '42\n', stderr: '', ok: true })
}, 60_000)

it('local: error kompilasi, timeout, segfault, batas memori', async () => {
  const [ce] = await runCompiled('c', 'int main(){ return 0 }', [''])
  expect(ce.ok).toBe(false)
  expect(ce.stderr).toMatch(/^Gagal kompilasi:\n[\s\S]*main\.c:1:\d+: error: expected ';'/)
  const [loop] = await runCompiled('c', 'int main(){ while(1); }', [''], { timeoutMs: 500 })
  expect(loop).toMatchObject({ ok: false, timeout: true })
  const [seg] = await runCompiled('c', 'int main(){ int *p = 0; *p = 1; }', [''])
  expect(seg.stderr).toContain('Segmentation fault')
  const [mem] = await runCompiled('cpp', '#include <vector>\nint main(){ std::vector<char> v(1L<<30, 1); return v[5]; }', [''])
  expect(mem.ok).toBe(false)
}, 60_000)

it('piston: request & respons dipetakan dengan benar', async () => {
  const sent: unknown[] = []
  const fake = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    sent.push(body)
    const run = body.stdin === 'loop' ? { stdout: '', stderr: '', code: null, signal: 'SIGKILL' } : { stdout: `echo ${body.stdin}\n`, stderr: '', code: 0, signal: null }
    return new Response(JSON.stringify(body.files[0].content.includes('ERR') ? { compile: { stdout: '', stderr: 'main.cpp:1: error', code: 1, signal: null }, run } : { run }))
  }) as typeof fetch
  const r = await runPiston('http://p', 'cpp', 'ok', ['a', 'loop'], fake)
  expect(r).toEqual([{ stdout: 'echo a\n', stderr: '', ok: true }, { stdout: '', stderr: 'Waktu habis\n', ok: false, timeout: true }])
  expect(sent[0]).toMatchObject({ language: 'c++', files: [{ name: 'main.cpp' }], stdin: 'a', run_timeout: 2000 })
  expect((await runPiston('http://p', 'cpp', 'ERR', ['x'], fake))[0].stderr).toContain('Gagal kompilasi')
})

it('API: validasi input & health', async () => {
  const app = build()
  expect((await app.inject({ url: '/api/health' })).json()).toMatchObject({ ok: true, langs: ['c', 'cpp', 'java', 'go', 'rust', 'csharp', 'kotlin'] })
  expect((await app.inject({ method: 'POST', url: '/api/run', payload: { lang: 'ruby', code: '', inputs: [] } })).statusCode).toBe(400)
  const ok = await app.inject({ method: 'POST', url: '/api/run', payload: { lang: 'c', code: C_SUM, inputs: ['1 2'] } })
  expect(ok.json().results[0].stdout).toBe('3\n')
}, 30_000)

it('compiler baru: Go, Rust, C#, Kotlin membaca stdin & melapor gagal kompilasi', async () => {
  const progs: Record<string, [string, string]> = {
    go: ['package main\nimport "fmt"\nfunc main() { var a, b int; fmt.Scan(&a, &b); fmt.Println(a + b) }\n', 'package main\nfunc main() { x := 1 }\n'],
    rust: ['use std::io::Read;\nfn main() { let mut s = String::new(); std::io::stdin().read_to_string(&mut s).unwrap(); let v: Vec<i64> = s.split_whitespace().map(|x| x.parse().unwrap()).collect(); println!("{}", v[0] + v[1]); }\n', 'fn main() { let x = 1; x = 2; }\n'],
    csharp: ['using System;\nclass P { static void Main() { var t = Console.ReadLine().Split(\' \'); Console.WriteLine(int.Parse(t[0]) + int.Parse(t[1])); } }\n', 'class P { static void Main() { int x = "a"; } }\n'],
    kotlin: ['fun main() { val (a, b) = readLine()!!.split(" ").map { it.toInt() }; println(a + b) }\n', 'fun main() { val x = 1; x = 2 }\n'],
  }
  for (const [lang, [good, bad]] of Object.entries(progs)) {
    const [r] = await runCompiled(lang as never, good, ['20 22'], { timeoutMs: 8000, compileMs: 120000 })
    expect(r.stdout, lang).toBe('42\n')
    const [e] = await runCompiled(lang as never, bad, [''], { timeoutMs: 8000, compileMs: 120000 })
    expect(e.ok, lang).toBe(false)
    expect(e.stderr, lang).toMatch(/Gagal kompilasi/)
  }
}, 240_000)
