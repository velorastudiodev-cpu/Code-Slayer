import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { normCss, runChecks, type Check } from './htmlcheck'

const run = (html: string, checks: Check[]) => runChecks(new JSDOM(html).window.document, checks)
const ok = (html: string, checks: Check[]) => expect(run(html, checks)).not.toContain('✗')
const bad = (html: string, checks: Check[]) => expect(run(html, checks)).toContain('✗')

describe('pemeriksa HTML/CSS', () => {
  it('normalisasi warna & nol', () => {
    expect(normCss('RED')).toBe(normCss('#f00'))
    expect(normCss('rgb(255, 0, 0)')).toBe('rgb(255,0,0)')
    expect(normCss('0px')).toBe('0')
    expect(normCss('#ff000080')).toBe('rgba(255,0,0,0.5)')
  })
  it('struktur, teks, atribut', () => {
    const h = '<ul id="regu"><li>Tanjiro</li><li>Zenitsu</li></ul><a href="https://korps.id">Markas</a>'
    ok(h, [{ sel: '#regu > li', count: 2 }, { sel: 'li', text: 'Tanjiro' }, { sel: 'a', attr: 'href', value: 'https://korps.id' }, { sel: 'li', count: '≥1' }])
    bad(h, [{ sel: 'ol', count: 1 }])
  })
  it('cascade: specificity, urutan, !important, inline, pewarisan', () => {
    const h = `<style>
      p { color: blue } .x { color: green } #y { color: orange } p { color: purple }
      .imp { color: red !important } #z { color: black }
      body { font-family: serif; color: gray }
    </style><p class="x" id="y">a</p><p class="x">b</p><p>c</p><p class="imp" id="z" style="color: pink">d</p><span>e</span><p style="color: teal">f</p>`
    ok(h, [
      { sel: '#y', css: 'color', value: 'orange' },
      { sel: 'p.x:not(#y)', css: 'color', value: 'green' },
      { sel: 'p:not(.x):not(.imp):not([style])', css: 'color', value: 'purple' },
      { sel: '.imp', css: 'color', value: 'red' },
      { sel: 'span', css: 'color', value: 'gray' },
      { sel: 'span', css: 'font-family', value: 'serif' },
      { sel: 'p[style="color: teal"]', css: 'color', value: 'teal' },
    ])
  })
  it('shorthand margin/padding/border/flex & default display', () => {
    const h = '<style>.k { margin: 0 auto; padding: 4px 8px; border: 2px solid #333; } .f { display: flex; gap: 10px } .f > * { flex: 1 }</style><div class="k">x</div><div class="f"><span>a</span></div>'
    ok(h, [
      { sel: '.k', css: 'margin-left', value: 'auto' }, { sel: '.k', css: 'margin-top', value: '0' }, { sel: '.k', css: 'padding-right', value: '8px' },
      { sel: '.k', css: 'border-top-style', value: 'solid' }, { sel: '.k', css: 'border-left-color', value: '#333' },
      { sel: '.f', css: 'column-gap', value: '10px' }, { sel: '.f > span', css: 'flex-grow', value: '1' }, { sel: 'span', css: 'display', value: 'inline' },
    ])
  })
  it('@media dievaluasi untuk lebar tertentu', () => {
    const h = '<style>nav { display: flex } @media (max-width: 600px) { nav { flex-direction: column } }</style><nav></nav>'
    ok(h, [{ sel: 'nav', css: 'flex-direction', value: 'column', width: 400 }, { sel: 'nav', css: 'flex-direction', value: 'row', width: 1024 }])
  })
  it('aksesibilitas: label & alt', () => {
    ok('<label for="n">Nama</label><input id="n"><label>Umur <input></label><img src="a.png" alt="Pedang">', [{ sel: 'input', label: true }, { sel: 'img', alt: true }])
    bad('<input id="n"><img src="a.png" alt="">', [{ sel: 'input', label: true }])
    bad('<img src="a.png" alt=" ">', [{ sel: 'img', alt: true }])
  })
})
