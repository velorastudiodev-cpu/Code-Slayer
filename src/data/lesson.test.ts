import { describe, expect, it } from 'vitest'
import { highlight, sentences } from './lesson'

describe('Gulungan Pelajaran', () => {
  it('memecah materi menjadi kalimat dialog tanpa memotong singkatan', () => {
    expect(sentences('Shell adalah juru bicara. Kamu selalu berdiri di satu direktori, mis. /home. Path absolut dimulai dari /.'))
      .toEqual(['Shell adalah juru bicara.', 'Kamu selalu berdiri di satu direktori, mis. /home.', 'Path absolut dimulai dari /.'])
    expect(sentences('Ya. Itu benar sekali ya teman.')).toEqual(['Ya. Itu benar sekali ya teman.']) // kalimat sangat pendek digabung
    expect(sentences('Satu kalimat saja')).toEqual(['Satu kalimat saja'])
  })
  it('menyorot istilah kode: yang ada di contoh & pola khas kode', () => {
    const h = highlight('Gunakan print() untuk mencetak, lalu cd ke folder dan baca $HOME.', 'cd /tmp\nprint("x")')
    expect(h.filter(x => x.code).map(x => x.t)).toEqual(['print()', 'cd', '$HOME'])
    expect(h.map(x => x.t).join('')).toBe('Gunakan print() untuk mencetak, lalu cd ke folder dan baca $HOME.')
    expect(highlight('Ini teks biasa dan tidak ada kode.').every(x => !x.code)).toBe(true)
    // kata di komentar & string contoh tidak disorot; opsi seperti --force tetap
    const c = highlight('Baris komentar tidak dijalankan, opsi --force berbahaya.', '# komentar tidak dijalankan\nprint("Halo dijalankan")\nrm --force x')
    expect(c.filter(x => x.code).map(x => x.t)).toEqual(['--force'])
  })
})
