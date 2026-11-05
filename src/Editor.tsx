import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { useSettings } from './db'
import { EDITOR_THEMES, type ThemeTokens } from './editor-themes'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'
import { rust } from '@codemirror/lang-rust'
import { LanguageSupport, StreamLanguage } from '@codemirror/language'
import { csharp, kotlin } from '@codemirror/legacy-modes/mode/clike'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { html } from '@codemirror/lang-html'
import type { Lang } from './run'

const LANGS: Record<Lang, () => ReturnType<typeof python>> = {
  python, javascript, typescript: () => javascript({ typescript: true }), sql, c: cpp, cpp, java, go, rust,
  csharp: () => new LanguageSupport(StreamLanguage.define(csharp)), kotlin: () => new LanguageSupport(StreamLanguage.define(kotlin)),
  bash: () => new LanguageSupport(StreamLanguage.define(shell)),
  html,
}
function cmTheme(k: ThemeTokens) {
  return [
    EditorView.theme({
      '&': { color: k.fg, backgroundColor: k.bg },
      '.cm-content': { caretColor: k.cursor },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: k.cursor },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: k.select },
      '.cm-gutters': { backgroundColor: k.gutter, color: k.comment, border: 'none' },
      '.cm-activeLine': { backgroundColor: k.select + '55' },
      '.cm-activeLineGutter': { backgroundColor: k.select },
    }, { dark: k.dark }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: k.keyword, fontWeight: 'bold' },
      { tag: [t.string, t.special(t.string)], color: k.string },
      { tag: [t.number, t.bool, t.null, t.atom], color: k.number },
      { tag: [t.comment, t.lineComment, t.blockComment], color: k.comment, fontStyle: 'italic' },
      { tag: [t.function(t.variableName), t.function(t.propertyName), t.className, t.typeName], color: k.fn },
    ])),
  ]
}

const SYMBOLS = ['Tab', '(', ')', '{', '}', '[', ']', ':', ';', '=', '<', '>', '"', "'", '+', '-', '*', '/']

// Editor dibuat ulang saat bahasa/kunci berganti; isi awal = value saat itu.
// One Dark bawaan: komentar/nomor baris #7d8799 (3,6:1) dan merah koral #e06c75 (4,1:1). Dinaikkan ke ≥ 4,5:1 (WCAG AA).
const ONE_DARK_A11Y = [
  Prec.highest(syntaxHighlighting(HighlightStyle.define([{ tag: t.comment, color: '#a3adbd', fontStyle: 'italic' }, { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName, t.processingInstruction], color: '#f2939a' }]))),
  Prec.highest(EditorView.theme({ '.cm-gutters, .cm-gutters .cm-gutterElement': { color: '#a3adbd' } }, { dark: true })),
]

export function Editor({ value, lang, onChange, label }: { value: string; lang: Lang; onChange: (v: string) => void; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  const change = useRef(onChange)
  change.current = onChange
  const themeId = useSettings().editorTheme ?? ''

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        basicSetup, keymap.of([indentWithTab]), LANGS[lang](), EDITOR_THEMES[themeId] ? cmTheme(EDITOR_THEMES[themeId]) : [oneDark, ONE_DARK_A11Y],
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of(u => u.docChanged && change.current(u.state.doc.toString())),
      ],
    })
    view.current = v
    return () => v.destroy()
  }, [lang, themeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (s: string) => {
    const v = view.current!
    v.dispatch(v.state.replaceSelection(s === 'Tab' ? '    ' : s))
    v.focus()
  }
  return (
    <div className="editor">
      <div ref={host} />
      <div className="symbols" aria-label="Simbol">
        {SYMBOLS.map(s => <button key={s} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert(s)}>{s}</button>)}
      </div>
    </div>
  )
}
