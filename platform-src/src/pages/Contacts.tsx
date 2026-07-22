import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order } from '../supabase'
import { toast } from '../toast'
import { downloadCsv } from '../csv'

type Closure = { label: string; from: string; to: string }
type Factory = {
  id: string
  name: string
  country: string | null
  specialty: string | null
  moq: string | null
  key_person: string | null
  languages: string | null
  certifications: string | null
  notes: string | null
  closures: Closure[]
}

/** The rolodex — profiles you write, performance you earn from real orders. */
export default function Contacts() {
  const [owner, setOwner] = useState('')
  const [factories, setFactories] = useState<Factory[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [form, setForm] = useState({ name: '', country: '', specialty: '', moq: '', key_person: '', languages: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Factory>>({})
  const [closure, setClosure] = useState({ label: '', from: '', to: '' })

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    setOwner(userData.user.id)
    const [f, o] = await Promise.all([
      supabase.from('factories').select('*').order('name'),
      supabase.from('orders').select('*').is('archived_at', null),
    ])
    setFactories((f.data as Factory[]) || [])
    setOrders((o.data as Order[]) || [])
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    await supabase.from('factories').insert({
      owner, name: form.name.trim(), country: form.country.trim() || null,
      specialty: form.specialty.trim() || null, moq: form.moq.trim() || null,
      key_person: form.key_person.trim() || null, languages: form.languages.trim() || null,
    })
    setForm({ name: '', country: '', specialty: '', moq: '', key_person: '', languages: '' })
    load()
  }

  if (factories === null) return null

  // Names seen on orders but not yet in the rolodex — offer one-click add.
  const knownNames = new Set(factories.map(f => f.name.toLowerCase()))
  const unrostered = [...new Set(orders.map(o => o.factory_name).filter((n): n is string => !!n))]
    .filter(n => !knownNames.has(n.toLowerCase()))

  function statsFor(name: string) {
    const theirs = orders.filter(o => (o.factory_name || '').toLowerCase() === name.toLowerCase())
    const done = theirs.filter(o => ['delivered', 'closed'].includes(o.stage))
    const active = theirs.length - done.length
    const units = theirs.reduce((s, o) => s + (o.quantity || 0), 0)
    return { total: theirs.length, done: done.length, active, units }
  }

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Contacts</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            Your factory rolodex — the profile you write, the track record you earn from real orders.
          </div>
        </div>
        {factories.length > 0 && (
          <button className="btn ghost" onClick={() => downloadCsv('clewa-factories',
            ['name', 'country', 'specialty', 'moq', 'key_person', 'languages', 'orders', 'units'],
            factories.map(f => {
              const st = statsFor(f.name)
              return [f.name, f.country || '', f.specialty || '', f.moq || '', f.key_person || '', f.languages || '', st.total, st.units]
            }))}>Export CSV</button>
        )}
      </div>

      {unrostered.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Seen on your orders</div>
          {unrostered.map(n => (
            <div className="q-item" key={n} style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <strong>{n}</strong>
              <button className="btn ghost small" onClick={async () => {
                await supabase.from('factories').insert({ owner, name: n })
                load()
              }}>Add to rolodex</button>
            </div>
          ))}
        </div>
      )}

      {factories.length === 0 && unrostered.length === 0 && (
        <div className="card empty">
          <h2>No factories yet.</h2>
          <p>Add the factories you work with — or create an order and they'll appear here automatically. Don't have one? <a href="../sourcing-apply.html">Clewa Sourcing finds and verifies one for you →</a></p>
        </div>
      )}

      <div className="contact-grid">
        {factories.map(f => {
          const st = statsFor(f.name)
          return (
            <div className="card" key={f.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <strong style={{ fontSize: 15 }}>{f.name}</strong>
                {f.country && <span className="quiet" style={{ fontSize: 12 }}>{f.country}</span>}
              </div>
              <div className="quiet" style={{ fontSize: 12.5, marginTop: 4 }}>
                {[f.specialty, f.moq && `MOQ ${f.moq}`, f.key_person && `Contact: ${f.key_person}`, f.languages]
                  .filter(Boolean).join(' · ') || 'No profile details yet'}
              </div>
              {(f.closures || []).length > 0 && (
                <div className="quiet" style={{ fontSize: 12, marginTop: 8 }}>
                  Closed: {(f.closures || []).map(c => `${c.label || 'closure'} ${c.from} → ${c.to}`).join(' · ')}
                </div>
              )}
              <div className="gate-row" style={{ marginTop: 12 }}>
                <span className="gate ok">{st.total} order{st.total === 1 ? '' : 's'}</span>
                <span className={`gate ${st.active ? 'ok' : ''}`}>{st.active} active</span>
                <span className={`gate ${st.units ? 'ok' : ''}`}>{st.units.toLocaleString()} units</span>
              </div>
              {st.total === 0 && (
                <p className="quiet" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Performance history builds automatically as orders run through Clewa.
                </p>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <a href="#" style={{ fontSize: 12 }} onClick={e => {
                  e.preventDefault()
                  setEditId(f.id)
                  setEditForm({ country: f.country || '', specialty: f.specialty || '', moq: f.moq || '', key_person: f.key_person || '', languages: f.languages || '' })
                }}>edit</a>
                <a href="#" style={{ fontSize: 12, color: 'var(--ink-3)' }} onClick={async e => {
                  e.preventDefault()
                  if (!window.confirm(`Remove ${f.name} from your rolodex? Orders with them are untouched.`)) return
                  await supabase.from('factories').delete().eq('id', f.id)
                  toast('Removed from rolodex')
                  load()
                }}>remove</a>
              </div>
              {editId === f.id && (
                <form style={{ display: 'grid', gap: 8, marginTop: 10 }} onSubmit={async e => {
                  e.preventDefault()
                  await supabase.from('factories').update(editForm).eq('id', f.id)
                  setEditId(null)
                  toast('Factory updated')
                  load()
                }}>
                  {(['country', 'specialty', 'moq', 'key_person', 'languages'] as const).map(k => (
                    <input key={k} placeholder={k.replace('_', ' ')} value={(editForm[k] as string) || ''}
                      onChange={ev => setEditForm({ ...editForm, [k]: ev.target.value })}
                      style={{ padding: '7px 10px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12.5 }} />
                  ))}
                  <div style={{ borderTop: '1px solid var(--hair)', paddingTop: 10 }}>
                    <div className="quiet" style={{ fontSize: 11.5, marginBottom: 6 }}>
                      Closures (Tet, August break…) — these appear on your calendar and trigger collision warnings.
                    </div>
                    {(f.closures || []).map((c, ci) => (
                      <div key={ci} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '3px 0' }}>
                        <span style={{ flex: 1 }}>{c.label || 'closure'} · {c.from} → {c.to}</span>
                        <a href="#" style={{ fontSize: 11.5 }} onClick={async ev => {
                          ev.preventDefault()
                          const next = (f.closures || []).filter((_, i2) => i2 !== ci)
                          await supabase.from('factories').update({ closures: next }).eq('id', f.id)
                          load()
                        }}>remove</a>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <input placeholder="Label (e.g. Tet)" value={closure.label} onChange={ev => setClosure({ ...closure, label: ev.target.value })}
                        style={{ flex: 1, minWidth: 90, padding: '6px 9px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12 }} />
                      <input type="date" value={closure.from} onChange={ev => setClosure({ ...closure, from: ev.target.value })}
                        style={{ padding: '6px 9px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12 }} />
                      <input type="date" value={closure.to} onChange={ev => setClosure({ ...closure, to: ev.target.value })}
                        style={{ padding: '6px 9px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12 }} />
                      <button className="btn ghost small" type="button" onClick={async () => {
                        if (!closure.from || !closure.to) return
                        const next = [...(f.closures || []), closure]
                        await supabase.from('factories').update({ closures: next }).eq('id', f.id)
                        setClosure({ label: '', from: '', to: '' })
                        toast('Closure added — your calendar knows')
                        load()
                      }}>Add closure</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn primary small" type="submit">Save</button>
                    <button className="btn ghost small" type="button" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>

      <div className="section-label">Add a factory</div>
      <div className="card">
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <input placeholder="Factory name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={ci()} />
          <input placeholder="Country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} style={ci()} />
          <input placeholder="Specialty (e.g. knits, outerwear)" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={ci()} />
          <input placeholder="MOQ" value={form.moq} onChange={e => setForm({ ...form, moq: e.target.value })} style={ci()} />
          <input placeholder="Key person" value={form.key_person} onChange={e => setForm({ ...form, key_person: e.target.value })} style={ci()} />
          <input placeholder="Languages" value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} style={ci()} />
          <button className="btn primary small" type="submit" style={{ justifyContent: 'center' }}>Add factory</button>
        </form>
      </div>
    </>
  )
}

function ci(): React.CSSProperties {
  return { padding: '9px 11px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13, background: 'var(--paper)' }
}
