import { sfx } from '../sfx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { saveSettings, useSettings, type Settings } from '../db'
import { Chibi } from '../characters/rig'
import { charById } from '../characters/roster'
import { Pixels, Icon } from '../pixel'
import { EDITOR_THEMES } from '../editor-themes'
import {
  DUP_REFUND, ITEMS, PITY_LEGEND, PITY_RARE, RATES, cryptoRandom, itemById, owned, pity, pullPrice, rollMany, type Item, type ItemKind,
} from '../data/economy'
import { NotEnoughKoban, buy, dress, useCompanion, useEconomy } from '../wallet'

const BLADE = ['.........k', '........kx', '.......kx.', '......kx..', '.....kx...', '..k.kx....', '...kx.....', '..kqk.....', '.kq..k....', 'kq........']
const STARS = (r: number) => '★'.repeat(r)

// Pratinjau item: karakter, warna bilah, skin pada companion, contoh tema editor, efek pernapasan.
export function ItemPreview({ item, size = 64 }: { item: Item; size?: number }) {
  const c = useCompanion()
  const base = charById(useSettings().companion)
  if (item.kind === 'char') return <Chibi c={charById(item.id.slice(5))} expr="idle" size={size} />
  if (item.kind === 'nichirin') return <Pixels rows={BLADE} pal={{ k: '#1a1218', x: item.color!, q: '#6b4a2a' }} size={size * 0.8} label={item.name} />
  if (item.kind === 'skin') return <Chibi c={dress(base, { skin: item.id })} expr="idle" size={size} />
  if (item.kind === 'fx') return <Chibi c={{ ...c, breath: item.fx! }} expr="victory" size={size} />
  const k = EDITOR_THEMES[item.id]
  return (
    <pre className="theme-preview" style={{ background: k.bg, color: k.fg, width: size * 1.4 }} aria-label={item.name}>
      <span style={{ color: k.keyword }}>def</span> <span style={{ color: k.fn }}>tebas</span>():{'\n'}  <span style={{ color: k.string }}>"iblis"</span> <span style={{ color: k.comment }}># 1</span>
    </pre>
  )
}

const KIND: Record<ItemKind, { title: string; setting?: keyof Settings }> = {
  char: { title: 'Karakter' },
  nichirin: { title: 'Warna Nichirin', setting: 'nichirin' },
  skin: { title: 'Skin Haori', setting: 'skin' },
  theme: { title: 'Tema Editor', setting: 'editorTheme' },
  fx: { title: 'Efek Pernapasan', setting: 'effect' },
}

type Result = { item: Item; rarity: number; dup: boolean; refund: number }

export default function Gacha() {
  const { koban, spends } = useEconomy()
  const s = useSettings()
  const [results, setResults] = useState<Result[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const p = pity(spends)
  const have = owned(spends)
  const one = pullPrice(s.companion), ten = pullPrice(s.companion, true)

  async function pull(n: 1 | 10) {
    setErr('')
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const rows = await buy((_, sp) => rollMany(n, cryptoRandom, sp, n === 10 ? ten : one)
        .map(r => ({ date: now, kind: 'pull' as const, cost: r.cost, refund: r.refund, item: r.item.id, rarity: r.rarity })))
      setResults(rows.map(r => ({ item: itemById(r.item!)!, rarity: r.rarity!, dup: !!r.refund, refund: r.refund ?? 0 })))
      sfx(rows.some(r => (r.rarity ?? 0) >= 5) ? 'fanfare' : 'coin')
    } catch (e) {
      setErr(e instanceof NotEnoughKoban ? 'Koban belum cukup. Tebas lebih banyak latihan dulu!' : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="page">
      <h1>Gacha Kosmetik</h1>
      <section className="card gacha">
        <p className="balance"><Icon name="coin" size={28} /> <b>{koban}</b> Koban</p>
        <div className="row-actions">
          <button className="btn-primary" disabled={busy || koban < one} onClick={() => pull(1)}>Tarik 1× ({one})</button>
          <button className="btn-primary" disabled={busy || koban < ten} onClick={() => pull(10)}>Tarik 10× ({ten})</button>
        </div>
        {err && <p className="feedback wrong">{err}</p>}
        <p className="muted small">
          ★★ dijamin dalam <b>{PITY_RARE - p.rare}</b> tarikan, ★★★ dalam <b>{PITY_LEGEND - p.legend}</b> tarikan.
          Peluang: ★★★ {RATES[3] * 100}%, ★★ {RATES[2] * 100}%, ★ {(1 - RATES[3] - RATES[2]) * 100}%. Item yang belum dimiliki 3× lebih mungkin keluar; duplikat dikembalikan {DUP_REFUND * 100}% Koban (karakter duplikat juga +10 Bond).
          Hanya kosmetik, tanpa uang asli.
        </p>
      </section>

      {results && (
        <section className="pulls" aria-live="polite">
          {results.map((r, i) => (
            <div key={i} className={`card pull r${r.rarity}`} style={{ animationDelay: `${i * 80}ms` }}>
              <ItemPreview item={r.item} size={56} />
              <b>{r.item.name}</b>
              <small>{STARS(r.rarity)} · {r.dup ? `duplikat +${r.refund}` : 'BARU!'}</small>
            </div>
          ))}
        </section>
      )}

      <h2>Lemari ({[...have].filter(id => itemById(id)).length}/{ITEMS.length})</h2>
      {(Object.keys(KIND) as ItemKind[]).map(kind => {
        const list = ITEMS.filter(i => i.kind === kind)
        const setting = KIND[kind].setting
        return (
          <section key={kind} className="card closet">
            <h3>{KIND[kind].title} <span className="muted small">{list.filter(i => have.has(i.id)).length}/{list.length}</span></h3>
            <div className="items">
              {setting && (
                <button className="item" aria-pressed={!s[setting]} onClick={() => saveSettings({ [setting]: undefined })}>
                  <span className="none">—</span><small>Bawaan</small>
                </button>
              )}
              {list.map(i => {
                const mine = have.has(i.id)
                const body = <><ItemPreview item={i} size={44} /><small>{i.name}</small><small className="muted">{STARS(i.rarity)}</small></>
                if (!mine) return <div key={i.id} className="item locked" aria-label={`${i.name} (belum dimiliki)`}>{body}</div>
                if (!setting) return <Link key={i.id} className="item" to={`/karakter/${i.id.slice(5)}`}>{body}</Link>
                return <button key={i.id} className="item" aria-pressed={s[setting] === i.id} onClick={() => saveSettings({ [setting]: i.id })}>{body}</button>
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
