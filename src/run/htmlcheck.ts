// Pemeriksa soal HTML/CSS: struktur, teks, atribut, CSS hasil cascade, aksesibilitas.
// Berjalan identik di browser (DOMParser) dan build (jsdom): CSS dihitung sendiri dari <style> + inline
// (specificity, !important, urutan, pewarisan, shorthand, @media untuk lebar tertentu) tanpa layout.
export type Check =
  | { sel: string; count: number | string; desc?: string } // "≥1" boleh
  | { sel: string; text: string; contains?: boolean; desc?: string }
  | { sel: string; attr: string; value?: string; desc?: string }
  | { sel: string; css: string; value: string; width?: number; desc?: string }
  | { sel: string; label: true; desc?: string } // input punya label
  | { sel: string; alt: true; desc?: string } // img punya alt tidak kosong

type Rule = { sels: string[]; decls: { prop: string; value: string; important: boolean }[]; order: number; media?: { min?: number; max?: number } }

const INHERIT = new Set(['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'visibility', 'letter-spacing', 'list-style-type', 'cursor', 'white-space', 'text-transform'])
const BLOCK = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'form', 'figure', 'blockquote', 'table', 'body', 'html', 'fieldset', 'hr', 'pre', 'address', 'figcaption', 'dl', 'dd', 'dt', 'details', 'summary'])
const NAMED: Record<string, string> = {
  black: '0,0,0', white: '255,255,255', red: '255,0,0', green: '0,128,0', blue: '0,0,255', yellow: '255,255,0', orange: '255,165,0', purple: '128,0,128',
  gray: '128,128,128', grey: '128,128,128', pink: '255,192,203', brown: '165,42,42', navy: '0,0,128', teal: '0,128,128', crimson: '220,20,60', gold: '255,215,0',
  silver: '192,192,192', maroon: '128,0,0', olive: '128,128,0', lime: '0,255,0', aqua: '0,255,255', cyan: '0,255,255', magenta: '255,0,255', fuchsia: '255,0,255',
  darkgreen: '0,100,0', darkred: '139,0,0', darkblue: '0,0,139', skyblue: '135,206,235', tomato: '255,99,71', indigo: '75,0,130', violet: '238,130,238', salmon: '250,128,114',
  transparent: '0,0,0,0',
}

// Nilai CSS dinormalkan supaya "red", "#f00", dan "rgb(255, 0, 0)" dianggap sama.
export function normCss(v: string): string {
  let s = v.trim().toLowerCase().replace(/\s*!important$/, '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/["']/g, '')
  s = s.replace(/#([0-9a-f]{3,8})\b/g, (_, h: string) => {
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
    const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
    return h.length === 8 ? `rgba(${n.join(',')},${+(parseInt(h.slice(6, 8), 16) / 255).toFixed(2)})` : `rgb(${n.join(',')})`
  })
  s = s.replace(/\b([a-z]+)\b/g, w => (NAMED[w] ? (NAMED[w].split(',').length === 4 ? `rgba(${NAMED[w]})` : `rgb(${NAMED[w]})`) : w))
  s = s.replace(/rgba\((\d+),(\d+),(\d+),1\)/g, 'rgb($1,$2,$3)')
  s = s.replace(/(^|[\s(,])0(px|em|rem|%)(?=$|[\s),])/g, '$10').replace(/(^|[\s(,])0?\.(\d)/g, '$10.$2')
  return s
}

function parseCss(css: string, base = 0): Rule[] {
  const out: Rule[] = []
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let i = 0, order = base
  const block = (media?: Rule['media']) => {
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i)
      if (close >= 0 && (open < 0 || close < open)) { i = close + 1; return }
      if (open < 0) { i = css.length; return }
      const head = css.slice(i, open).trim()
      i = open + 1
      if (head.startsWith('@media')) {
        const mx = /max-width\s*:\s*(\d+)px/.exec(head), mn = /min-width\s*:\s*(\d+)px/.exec(head)
        block({ max: mx ? +mx[1] : undefined, min: mn ? +mn[1] : undefined })
        continue
      }
      const end = css.indexOf('}', i)
      const body = css.slice(i, end < 0 ? css.length : end)
      i = end < 0 ? css.length : end + 1
      if (head.startsWith('@')) continue
      const decls = body.split(';').map(d => d.trim()).filter(Boolean).flatMap(d => {
        const k = d.indexOf(':')
        if (k < 0) return []
        const prop = d.slice(0, k).trim().toLowerCase(), raw = d.slice(k + 1).trim()
        const important = /!important$/i.test(raw)
        return expand(prop, raw.replace(/\s*!important$/i, '')).map(([p, v]) => ({ prop: p, value: v, important }))
      })
      out.push({ sels: head.split(',').map(x => x.trim()).filter(Boolean), decls, order: order++, media })
    }
  }
  block()
  return out
}

// Shorthand yang sering dipakai pemula.
function expand(prop: string, v: string): [string, string][] {
  const parts = v.split(/\s+(?![^(]*\))/)
  const box = (name: string) => {
    const [t, r = t, b = t, l = r] = parts
    return [[`${name}-top`, t], [`${name}-right`, r], [`${name}-bottom`, b], [`${name}-left`, l], [name, v]] as [string, string][]
  }
  if (prop === 'margin' || prop === 'padding') return box(prop)
  if (prop === 'border' || /^border-(top|right|bottom|left)$/.test(prop)) {
    const width = parts.find(p => /^\d|thin|medium|thick/.test(p)), style = parts.find(p => /^(none|solid|dashed|dotted|double|groove|ridge|inset|outset|hidden)$/.test(p)), color = parts.find(p => p !== width && p !== style)
    const sides = prop === 'border' ? ['top', 'right', 'bottom', 'left'] : [prop.slice(7)]
    return [[prop, v], ...sides.flatMap(sd => [[`border-${sd}-width`, width ?? 'medium'], [`border-${sd}-style`, style ?? 'none'], [`border-${sd}-color`, color ?? 'currentcolor']] as [string, string][]),
      ...(prop === 'border' ? [['border-width', width ?? 'medium'], ['border-style', style ?? 'none'], ['border-color', color ?? 'currentcolor']] as [string, string][] : [])]
  }
  if (prop === 'background') { const color = parts.find(p => /^(#|rgb|hsl|[a-z]+$)/.test(p) && !/^(none|no-repeat|repeat|center|cover|contain|url)/.test(p)); return [[prop, v], ...(color ? [['background-color', color]] as [string, string][] : [])] }
  if (prop === 'flex') { const [g, s2 = '1', b = '0%'] = parts; return /^\d/.test(g) ? [[prop, v], ['flex-grow', g], ['flex-shrink', s2], ['flex-basis', b]] : [[prop, v]] }
  if (prop === 'gap') { const [r, c2 = r] = parts; return [[prop, v], ['row-gap', r], ['column-gap', c2]] }
  if (prop === 'font') return [[prop, v]]
  return [[prop, v]]
}

function specificity(sel: string): number {
  const s = sel.replace(/::?[a-z-]+\([^)]*\)/g, m => (m.startsWith('::') ? ' ' : m.startsWith(':not(') || m.startsWith(':is(') ? m.slice(m.indexOf('(') + 1, -1) : ' :p'))
  const ids = (s.match(/#[\w-]+/g) ?? []).length
  const cls = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
  const el = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return ids * 10000 + cls * 100 + el
}

function computed(el: Element, prop: string, rules: Rule[], width: number): string {
  const inline = (el.getAttribute('style') ?? '').split(';').flatMap(d => { const k = d.indexOf(':'); return k < 0 ? [] : expand(d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim().replace(/\s*!important$/i, '')) }).filter(([p]) => p === prop)
  let best: { v: string; imp: boolean; spec: number; order: number } | null = null
  for (const r of rules) {
    if (r.media && ((r.media.max !== undefined && width > r.media.max) || (r.media.min !== undefined && width < r.media.min))) continue
    for (const d of r.decls) {
      if (d.prop !== prop) continue
      for (const sel of r.sels) {
        if (/::/.test(sel) || /:(hover|focus|active|visited|focus-visible|focus-within)\b/.test(sel)) continue
        let hit = false
        try { hit = el.matches(sel) } catch { /* selector tidak valid */ }
        if (!hit) continue
        const cand = { v: d.value, imp: d.important, spec: specificity(sel), order: r.order }
        // Pemenang cascade: !important, lalu specificity, lalu yang ditulis belakangan.
        const better = !best || (cand.imp !== best.imp ? cand.imp : cand.spec !== best.spec ? cand.spec > best.spec : cand.order >= best.order)
        if (better) best = cand
      }
    }
  }
  if (inline.length && !(best?.imp)) return inline[inline.length - 1][1]
  if (best && best.v !== 'inherit') return best.v
  if ((INHERIT.has(prop) || best?.v === 'inherit') && el.parentElement) return computed(el.parentElement, prop, rules, width)
  if (prop === 'display') return BLOCK.has(el.tagName.toLowerCase()) ? 'block' : el.tagName.toLowerCase() === 'li' ? 'list-item' : 'inline'
  if (prop === 'color') return 'rgb(0,0,0)'
  if (prop === 'font-weight') return /^h[1-6]$|^(b|strong|th)$/.test(el.tagName.toLowerCase()) ? 'bold' : 'normal'
  if (prop === 'font-style') return /^(em|i)$/.test(el.tagName.toLowerCase()) ? 'italic' : 'normal'
  if (prop === 'text-align') return 'start'
  return ({ 'flex-direction': 'row', 'justify-content': 'normal', 'align-items': 'normal', position: 'static', 'background-color': 'rgba(0,0,0,0)', 'flex-wrap': 'nowrap', 'flex-grow': '0', 'text-decoration': 'none' } as Record<string, string>)[prop] ?? ''
}

const sameWeight = (a: string, b: string) => (a === b || (a === 'bold' && b === '700') || (a === '700' && b === 'bold') || (a === 'normal' && b === '400') || (a === '400' && b === 'normal'))

export function describe(c: Check): string {
  if (c.desc) return c.desc
  if ('count' in c) return `${c.sel}: ${c.count === 0 ? 'tidak ada' : `ada ${c.count}`}`
  if ('text' in c) return `${c.sel} berisi teks "${c.text}"`
  if ('attr' in c) return c.value !== undefined ? `${c.sel} punya ${c.attr}="${c.value}"` : `${c.sel} punya atribut ${c.attr}`
  if ('css' in c) return `${c.sel} { ${c.css}: ${c.value} }${c.width ? ` saat lebar ${c.width}px` : ''}`
  if ('label' in c) return `${c.sel} punya label`
  return `${c.sel} punya alt`
}

// Output satu baris per syarat; build menyimpan versi "semua ok" sebagai expected.
export function runChecks(doc: Document, checks: Check[]): string {
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent ?? '').join('\n')
  const rules = parseCss(css)
  const q = (sel: string) => { try { return [...doc.querySelectorAll(sel)] } catch { return [] } }
  return checks.map(c => {
    const els = q(c.sel)
    let ok = false, got = ''
    if ('count' in c) {
      const want = String(c.count)
      ok = want.startsWith('≥') ? els.length >= +want.slice(1) : els.length === +want
      got = `${els.length}`
    } else if (!els.length) { got = 'elemen tidak ditemukan' }
    else if ('text' in c) {
      const t = (els[0].textContent ?? '').replace(/\s+/g, ' ').trim()
      ok = c.contains ? t.toLowerCase().includes(c.text.toLowerCase()) : t === c.text
      got = `"${t.slice(0, 60)}"`
    } else if ('attr' in c) {
      const v = els[0].getAttribute(c.attr)
      ok = v !== null && (c.value === undefined || v.trim() === c.value)
      got = v === null ? 'tidak ada' : `"${v}"`
    } else if ('css' in c) {
      const vals = els.map(e => normCss(computed(e, c.css, rules, c.width ?? 1024)))
      const want = normCss(c.value)
      ok = vals.every(v => v === want || (c.css === 'font-weight' && sameWeight(v, want)))
      got = vals.find(v => v !== want) ?? vals[0]
    } else if ('label' in c) {
      ok = els.every(e => { const id = e.getAttribute('id'); return (!!id && !!doc.querySelector(`label[for="${id}"]`)) || !!e.closest('label') || !!e.getAttribute('aria-label') })
      got = 'tanpa label'
    } else if ('alt' in c) {
      ok = els.every(e => (e.getAttribute('alt') ?? '').trim() !== '')
      got = 'alt kosong/tidak ada'
    }
    return ok ? `✓ ${describe(c)}` : `✗ ${describe(c)} (dapat: ${got || 'kosong'})`
  }).join('\n') + '\n'
}
