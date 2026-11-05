import { expect, it } from 'vitest'
import { explainError, explainMismatch } from './explain'

it('menjelaskan error umum Python & JS', () => {
  expect(explainError("NameError: name 'nama' is not defined")?.title).toBe('"nama" belum dikenal')
  expect(explainError('TypeError: can only concatenate str (not "int") to str')?.chapter).toBe('f2')
  expect(explainError("ValueError: invalid literal for int() with base 10: '3 4'")?.text).toContain('split')
  expect(explainError('IndentationError: expected an indented block after')?.title).toBe('Indentasi berantakan')
  expect(explainError('TypeError: Cannot read properties of undefined (reading \'x\')')?.title).toBe('Mengakses isi dari undefined')
  expect(explainError('ReferenceError: totl is not defined')?.title).toBe('"totl" belum dikenal')
  // Pesan asli dari gcc/g++/javac/JVM.
  expect(explainError("a.c:1:23: error: expected ',' or ';' before 'return'")?.title).toBe('Lupa titik koma')
  expect(explainError("c.c:2:30: error: expected ';' before '}' token")?.title).toBe('Lupa titik koma')
  expect(explainError("b.c:1:20: error: 'y' undeclared (first use in this function)")?.title).toBe('"y" belum dideklarasikan')
  expect(explainError("d.cpp:2:13: error: 'cout' was not declared in this scope; did you mean 'std::cout'?")?.text).toContain('std::cout')
  expect(explainError('Main.java:1: error: incompatible types: String cannot be converted to int')?.title).toBe('String bukan int')
  expect(explainError('Main.java:1: error: missing return statement')?.title).toBe('Lupa return')
  expect(explainError('Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 5 out of bounds for length 2')?.text).toContain('0 sampai 1')
  expect(explainError('Exception in thread "main" java.lang.NullPointerException: Cannot invoke')?.title).toBe('Mengakses null')
  expect(explainError('Segmentation fault (akses memori tidak valid)')?.title).toBe('Segmentation fault')
  expect(explainError('sesuatu yang aneh')).toBeNull()
})

it('menjelaskan output yang hampir benar', () => {
  expect(explainMismatch('Halo', '')).toContain('tidak mencetak')
  expect(explainMismatch('Halo, Slayer!', 'halo, slayer!')).toContain('huruf besar')
  expect(explainMismatch('7', 'Masukkan angka: 7')).toContain('tambahan sebelum')
  expect(explainMismatch('7', '8')).toBeNull()
})
