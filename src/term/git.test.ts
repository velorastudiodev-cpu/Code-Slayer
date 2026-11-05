// Test diferensial Git: skrip yang sama dijalankan dengan git asli dan simulator; state akhir (tanpa hash) harus sama.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Shell } from './shell.ts'
import { merge3 } from './git.ts'

// Pemeriksa state yang sama untuk keduanya: branch aktif, isi tiap branch, status.
export const CHECK = `echo "HEAD: $(git branch --show-current)"
for b in $(git branch --format='%(refname:short)'); do echo "$b: $(git log --first-parent --format=%s $b | tr '\\n' '<') $(git rev-list --count $b)"; done
git status --short`

export function realGit(script: string) {
  const dir = mkdtempSync(join(tmpdir(), 'slayer-git-'))
  writeFileSync(join(dir, '.gitconfig'), '[user]\n\tname = Slayer\n\temail = slayer@korps.id\n[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n[pull]\n\trebase = false\n')
  try {
    return execFileSync('bash', ['-c', script], { cwd: dir, env: { PATH: process.env.PATH, HOME: dir, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1' }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).toString()
  } catch (e) { return (e as { stdout: Buffer }).stdout.toString() + '!ERR' }
  finally { rmSync(dir, { recursive: true, force: true }) }
}
export async function simGit(script: string) {
  const r = await new Shell().run(script)
  return r.stdout + (r.code ? '!ERR' : '')
}

const INIT = 'mkdir proyek && cd proyek && git init -q'
const q = (s: string) => `{\n${s}\n} >/dev/null 2>&1`
const SCEN: [string, string][] = [
  ['commit pertama', `${INIT}\necho "Kaa!" > misi.txt\ngit add misi.txt\ngit commit -m "Misi pertama"\necho "Kaa! Kaa!" >> misi.txt\necho baru > lain.txt`],
  ['status lengkap', `${INIT}\necho a > a.txt; echo b > b.txt; mkdir -p dok; echo c > dok/c.txt\ngit add a.txt b.txt\ngit commit -m awal\necho a2 > a.txt; rm b.txt; echo d > d.txt; git add d.txt; echo x > x.txt`],
  ['branch & fast-forward', `${INIT}\necho 1 > f; git add .; git commit -m satu\ngit switch -c fitur\necho 2 >> f; git commit -am dua\necho 3 >> f; git commit -am tiga\ngit switch main\ngit merge fitur`],
  ['merge 3 arah bersih', `${INIT}\nprintf "a\\nb\\nc\\nd\\ne\\n" > f; git add f; git commit -m base\ngit checkout -b fitur\nsed -i "s/b/B/" f; git commit -am "ubah b"\ngit checkout main\nsed -i "s/e/E/" f; echo z > z; git add z; git commit -am "ubah e"\ngit merge fitur -m "gabung fitur"\ncat f`],
  ['merge commit default message', `${INIT}\necho 1 > a; git add a; git commit -m satu\ngit branch fitur\necho 2 > b; git add b; git commit -m dua\ngit switch fitur\necho 3 > c; git add c; git commit -m tiga\ngit switch main\ngit merge fitur --no-edit`],
  ['konflik & selesaikan', `${INIT}\necho "napas: air" > f; git add f; git commit -m awal\ngit switch -c petir\necho "napas: petir" > f; git commit -am petir\ngit switch main\necho "napas: api" > f; git commit -am api\ngit merge petir\ncat f\ngit status --short\necho "napas: air, api, petir" > f\ngit add f\ngit commit -m "selesaikan konflik"\ncat f`],
  ['merge --abort', `${INIT}\necho 1 > f; git add f; git commit -m a\ngit switch -c x; echo 2 > f; git commit -am b\ngit switch main; echo 3 > f; git commit -am c\ngit merge x\ngit merge --abort\ncat f`],
  ['rebase linear', `${INIT}\necho 1 > a; git add a; git commit -m satu\ngit switch -c fitur\necho 2 > b; git add b; git commit -m dua\ngit switch main\necho 3 > c; git add c; git commit -m tiga\ngit switch fitur\ngit rebase main\nls`],
  ['reset soft mixed hard', `${INIT}\nfor i in 1 2 3 4; do echo $i > f$i; git add f$i; git commit -m "c$i"; done\ngit reset --soft HEAD~1\ngit status --short\ngit reset HEAD~1\ngit status --short\ngit reset --hard HEAD~1\nls`],
  ['revert', `${INIT}\necho a > f; git add f; git commit -m satu\necho b > g; git add g; git commit -m dua\ngit revert HEAD --no-edit\nls`],
  ['cherry-pick', `${INIT}\necho a > f; git add f; git commit -m satu\ngit switch -c hotfix\necho fix > fix.txt; git add fix.txt; git commit -m perbaikan\necho z > z; git add z; git commit -m lain\ngit switch main\ngit cherry-pick hotfix~1\nls`],
  ['stash', `${INIT}\necho a > f; git add f; git commit -m satu\necho kotor >> f\ngit stash\ncat f\ngit stash pop\ncat f\ngit stash list`],
  ['tag & checkout detached', `${INIT}\necho 1 > f; git add f; git commit -m v1\ngit tag v1.0\necho 2 > f; git commit -am v2\ngit checkout v1.0\ncat f\ngit switch main`],
  ['gitignore', `${INIT}\nprintf "*.log\\nbuild/\\n!penting.log\\n" > .gitignore\necho x > app.log; echo y > penting.log; mkdir build; echo z > build/out; echo k > kode.py\ngit add .\ngit commit -m awal`],
  ['amend', `${INIT}\necho 1 > f; git add f; git commit -m "slah ketik"\necho 2 > g; git add g; git commit --amend -m "salah ketik diperbaiki"`],
  ['branch -d', `${INIT}\necho 1 > f; git add f; git commit -m a\ngit branch hapus\ngit branch -d hapus\ngit branch tetap`],
  ['remote push clone pull', `git init -q --bare pusat.git\n${INIT}\ngit remote add origin ../pusat.git\necho 1 > f; git add f; git commit -m satu\ngit push -u origin main\ncd ..\ngit clone -q pusat.git salinan\ncd salinan\necho 2 > g; git add g; git commit -m dua\ngit push origin main\ncd ../proyek\ngit pull origin main`],
  ['switch membawa perubahan', `${INIT}\necho 1 > f; git add f; git commit -m a\ngit branch b2\necho kotor >> f\ngit switch b2\ngit status --short`],
  ['restore', `${INIT}\necho asli > f; git add f; git commit -m a\necho rusak > f\ngit restore f\ncat f\necho baru > f; git add f\ngit restore --staged f\ngit status --short`],
]

describe('simulator Git vs git asli', () => {
  for (const [name, script] of SCEN) {
    it(name, async () => {
      const full = `${q(script.split('\n').filter(l => !/^(cat|ls|git status --short|git stash list)/.test(l)).join('\n'))}\n${CHECK}`
      // Bandingkan dua hal: state akhir (output pemeriksa) dan output perintah tampilan (cat/ls/status).
      const shown = script.replace(/^((?!cat|ls|git status --short|git stash list).*)$/gm, l => `{ ${l}\n} >/dev/null 2>&1`)
      expect(await simGit(full), `state\n${script}`).toBe(realGit(full))
      expect((await simGit(shown)).replace(/WIP on main: [0-9a-f]{7}/, 'WIP on main: H'), `tampilan\n${script}`).toBe(realGit(shown).replace(/WIP on main: [0-9a-f]{7}/, 'WIP on main: H'))
    }, 20000)
  }
})

describe('merge3 per baris', () => {
  it('perubahan di baris berbeda tergabung otomatis', () => {
    expect(merge3('a\nb\nc\n', 'A\nb\nc\n', 'a\nb\nC\n', 'HEAD', 'x')).toEqual({ text: 'A\nb\nC\n', conflict: false })
  })
  it('perubahan di baris yang sama → penanda konflik', () => {
    expect(merge3('a\n', 'b\n', 'c\n', 'HEAD', 'fitur')).toEqual({ text: '<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> fitur\n', conflict: true })
  })
})
