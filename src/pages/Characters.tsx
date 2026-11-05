import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { saveSettings, useSettings } from '../db'
import { CHARACTERS } from '../characters/roster'
import { DEMONS } from '../characters/demons'
import { LORE } from '../characters/lore'
import { Avatar, Chibi, EXPRESSIONS, EXPR_LABEL } from '../characters/rig'
import { BOND_LEVELS, BOND_UNLOCK, bondLevel, bondPoints, buffOf, buffText, itemById, owned } from '../data/economy'
import { dress, useEconomy } from '../wallet'

export default function Characters() {
  const { companion } = useSettings()
  const { attempts, spends } = useEconomy()
  const [tab, setTab] = useState<'slayer' | 'iblis'>('slayer')
  const have = owned(spends)
  return (
    <div className="page">
      <h1>Karakter</h1>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'slayer'} onClick={() => setTab('slayer')}>Pendekar ({CHARACTERS.filter(c => have.has(`char:${c.id}`)).length}/{CHARACTERS.length})</button>
        <button role="tab" aria-selected={tab === 'iblis'} onClick={() => setTab('iblis')}>Bestiari Iblis ({DEMONS.length})</button>
      </div>
      {tab === 'slayer' ? (
        <>
          <p className="muted small">Karakter baru didapat dari <Link to="/gacha">Gacha</Link>. Ganti gambar sendiri: taruh <code>public/characters/&lt;id&gt;/&lt;ekspresi&gt;.png</code>.</p>
          <ul className="roster">
            {CHARACTERS.map(c => {
              const mine = have.has(`char:${c.id}`)
              const lv = bondLevel(bondPoints(c.id, attempts, spends))
              return (
                <li key={c.id}>
                  <Link className={`card char-tile ${mine ? '' : 'locked'}`} to={`/karakter/${c.id}`} style={{ '--c': c.accent } as React.CSSProperties}>
                    <Chibi c={c} expr="idle" size={64} />
                    <b>{c.name}</b>
                    <small>{companion === c.id ? 'Companion' : mine ? `Bond Lv ${lv}` : `Terkunci ${'★'.repeat(itemById(`char:${c.id}`)?.rarity ?? 1)}`}</small>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <ul className="tracks">
          {DEMONS.map(d => (
            <li key={d.id} className="card demon" style={{ '--c': d.accent } as React.CSSProperties}>
              <Chibi c={d} expr="idle" size={72} />
              <div className="grow">
                <b>{d.name}</b> <small className="muted">{d.rank}</small>
                <p className="small"><b>Konsep:</b> {d.concept}</p>
                <p className="muted small">{d.lore}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CharacterDetail() {
  const { id = '' } = useParams()
  const s = useSettings()
  const { attempts, spends } = useEconomy()
  const c = CHARACTERS.find(x => x.id === id)
  if (!c) return <Navigate to="/karakter" replace />
  const mine = owned(spends).has(`char:${c.id}`)
  const pts = bondPoints(c.id, attempts, spends)
  const lv = bondLevel(pts)
  const next = BOND_LEVELS[lv]
  const lore = LORE[c.id]
  const shown = s.companion === c.id ? dress(c, s) : c
  const unlocked: [string, string][] = [['Kutipan', `“${lore.quote}”`], ['Tips dari Hashira #1', lore.tips[0]], ['Cerita pendek', lore.story], ['Tips dari Hashira #2', lore.tips[1]], ['Ikatan penuh', `${c.name} kini memanggilmu rekan seperjuangan.`]]
  return (
    <div className="page">
      <small className="muted"><Link to="/karakter">← Karakter</Link></small>
      <section className="card char" style={{ '--c': c.accent } as React.CSSProperties}>
        <header>
          <div><h1>{c.name}</h1><small className="muted">{lore.title}</small></div>
          {!mine ? <span className="badge">Terkunci</span>
            : s.companion === c.id ? <span className="badge">Companion</span>
              : <button className="btn-ghost" onClick={() => saveSettings({ companion: c.id })}>Jadikan companion</button>}
        </header>
        <div className="exprs">
          {EXPRESSIONS.map(e => (
            <figure key={e} className={mine ? '' : 'locked'}>
              <Avatar c={shown} expr={e} size={80} />
              <figcaption>{EXPR_LABEL[e]}</figcaption>
            </figure>
          ))}
        </div>
        <p><b>Buff pasif:</b> {buffText(buffOf(c.id))}</p>
        {!mine && <p className="muted small">Dapatkan {c.name} dari <Link to="/gacha">Gacha</Link>.</p>}
      </section>
      <section className="card">
        <h2>Bond Lv {lv}</h2>
        <div className="bar" role="progressbar" aria-label="Poin Bond" aria-valuenow={pts} aria-valuemax={next ?? pts}><i style={{ width: `${next ? Math.min(100, (pts / next) * 100) : 100}%` }} /></div>
        <p className="muted small">{next ? `${pts}/${next} poin ke Lv ${lv + 1}. Poin bertambah setiap kali kamu berhasil di latihan, ujian, atau mode game saat ${c.name} menjadi companion.` : 'Bond maksimal!'}</p>
        <ul className="lore">
          {unlocked.map(([label, text], i) => (
            <li key={label} className={i < lv ? '' : 'locked'}>
              <small className="muted">Lv {i + 1} · {BOND_UNLOCK[i]}</small>
              <p>{i < lv ? text : 'Terbuka saat Bond naik.'}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
