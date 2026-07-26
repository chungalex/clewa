import Loading from '../Loading'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order } from '../supabase'
import { toast } from '../toast'
import { downloadCsv } from '../csv'
import '../parity/contacts.css'

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
type Invite = { order_id: string; accepted_at: string | null; accepted_by_name: string | null }

/** The rolodex — profiles you write, performance you earn from real orders. */
export default function Contacts() {
  const [owner, setOwner] = useState('')
  const [factories, setFactories] = useState<Factory[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [form, setForm] = useState({ name: '', country: '', specialty: '', moq: '', key_person: '', languages: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Factory>>({})
  const [closure, setClosure] = useState({ label: '', from: '', to: '' })
  const addRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    setOwner(userData.user.id)
    const [f, o, inv] = await Promise.all([
      supabase.from('factories').select('*').order('name'),
      supabase.from('orders').select('*').is('archived_at', null),
      supabase.from('order_invites').select('order_id, accepted_at, accepted_by_name').is('revoked_at', null),
    ])
    setFactories((f.data as Factory[]) || [])
    setOrders((o.data as Order[]) || [])
    setInvites((inv.data as Invite[]) || [])
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

  if (factories === null) return <Loading variant="detail" />

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

  // Factory guests — live invite links on your orders (real access, not decoration).
  const guests = invites
    .map(i => ({ ...i, order: orders.find(o => o.id === i.order_id) }))
    .filter((g): g is Invite & { order: Order } => !!g.order)

  return (
    <section className="page on" data-page="contacts">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Contacts &amp; factories</h2>
            <div className="pg-sub">Your network — the profile you write, the track record you earn from real orders</div>
          </div>
          <div className="dv-tools">
            {factories.length > 0 && (
              <button className="x-btn" type="button" onClick={() => downloadCsv('clewa-factories',
                ['name', 'country', 'specialty', 'moq', 'key_person', 'languages', 'orders', 'units'],
                factories.map(f => {
                  const st = statsFor(f.name)
                  return [f.name, f.country || '', f.specialty || '', f.moq || '', f.key_person || '', f.languages || '', st.total, st.units]
                }))}>
                <span className="xb-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM10 4v16M4 10h16" /></svg></span>
                Export
              </button>
            )}
            <button className="btn ghost small" type="button" onClick={() => {
              addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              nameRef.current?.focus()
            }}>+ Add factory</button>
          </div>
        </div>

        {unrostered.length > 0 && (
          <div className="ibx-card">
            <div className="ibx-head slim"><div>
              <div className="ibx-kick">Seen on your orders</div>
              <div className="ibx-sub">Names on your orders that aren't in the rolodex yet — add them with one click.</div>
            </div></div>
            {unrostered.map(n => (
              <div className="team-row" key={n}>
                <span className="team-av">{n.slice(0, 1).toUpperCase()}</span>
                <div><div className="team-name">{n}</div><div className="team-email">Seen on your orders</div></div>
                <span className="team-sees" />
                <button className="x-btn" type="button" onClick={async () => {
                  await supabase.from('factories').insert({ owner, name: n })
                  load()
                }}>Add to rolodex</button>
              </div>
            ))}
          </div>
        )}

        {factories.length === 0 && unrostered.length === 0 && (
          <div className="ibx-card">
            <div className="empty">
              <h2>No factories yet.</h2>
              <p>Add the factories you work with — or create an order and they'll appear here automatically. Don't have one? <a href="../sourcing-apply.html">Clewa Sourcing finds and verifies one for you →</a></p>
            </div>
          </div>
        )}

        <div className="rolo-grid">
          {factories.map(f => {
            const st = statsFor(f.name)
            const tags = [
              f.specialty,
              f.moq && `MOQ ${f.moq}`,
              f.certifications,
            ].filter((t): t is string => !!t)
            return (
              <div className="rolo-card" key={f.id}>
                <div className="rolo-top">
                  <div className="rolo-logo">{f.name.slice(0, 1).toUpperCase()}</div>
                  <div className="rolo-id">
                    <div className="rolo-name">{f.name}</div>
                    <div className="rolo-loc">{[f.country, f.specialty].filter(Boolean).join(' · ') || 'No profile details yet'}</div>
                  </div>
                </div>
                {tags.length > 0 && (
                  <div className="rolo-tags">{tags.map(t => <span className="rolo-tag" key={t}>{t}</span>)}</div>
                )}
                {(f.closures || []).length > 0 && (
                  <div className="rolo-loc" style={{ marginTop: 10 }}>
                    Closed: {(f.closures || []).map(c => `${c.label || 'closure'} ${c.from} → ${c.to}`).join(' · ')}
                  </div>
                )}
                <div className="rolo-stats">
                  <div className="rolo-stat"><div className={`rst-num${st.total ? ' good' : ''}`}>{st.total}</div><div className="rst-lab">Orders</div></div>
                  <div className="rolo-stat"><div className={`rst-num${st.active ? ' good' : ''}`}>{st.active}</div><div className="rst-lab">Active</div></div>
                  <div className="rolo-stat"><div className="rst-num">{st.units ? st.units.toLocaleString() : '—'}</div><div className="rst-lab">Units</div></div>
                </div>
                {st.total === 0 && (
                  <p className="rolo-loc" style={{ marginTop: 8 }}>
                    Performance history builds automatically as orders run through Clewa.
                  </p>
                )}
                <div className="rolo-foot">
                  <div className="rolo-person">
                    <span className="rp-av">{(f.key_person || f.name).slice(0, 1).toUpperCase()}</span>
                    <div>
                      <div className="rp-name">{f.key_person || 'No key person yet'}</div>
                      <div className="rp-role">{f.languages || (f.key_person ? 'Contact' : 'Add one in edit')}</div>
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                    <a href="#" className="rolo-loc" onClick={e => {
                      e.preventDefault()
                      setEditId(editId === f.id ? null : f.id)
                      setEditForm({ country: f.country || '', specialty: f.specialty || '', moq: f.moq || '', key_person: f.key_person || '', languages: f.languages || '' })
                    }}>edit</a>
                    <a href="#" className="rolo-loc" onClick={async e => {
                      e.preventDefault()
                      if (!window.confirm(`Remove ${f.name} from your rolodex? Orders with them are untouched.`)) return
                      await supabase.from('factories').delete().eq('id', f.id)
                      toast('Removed from rolodex')
                      load()
                    }}>remove</a>
                    <Link to="/messages" className="rolo-msg">Message →</Link>
                  </span>
                </div>
                {editId === f.id && (
                  <form style={{ display: 'grid', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hair-soft)' }} onSubmit={async e => {
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
                      <div className="rolo-loc" style={{ marginBottom: 6 }}>
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

        {guests.length > 0 && (
          <div className="ibx-card" style={{ marginTop: 16 }}>
            <div className="ibx-head slim"><div>
              <div className="ibx-kick">Factory access · guests</div>
              <div className="ibx-sub">Invited per order. A factory sees its own orders, messages and QC — never your costs, margins or other factories.</div>
            </div></div>
            {guests.map(g => (
              <div className="team-row" key={g.order_id}>
                <span className="team-av f">{(g.accepted_by_name || g.order.factory_name || '?').slice(0, 1).toUpperCase()}</span>
                <div>
                  <div className="team-name">{g.accepted_by_name ? `${g.accepted_by_name}${g.order.factory_name ? ` · ${g.order.factory_name}` : ''}` : (g.order.factory_name || 'Invite link created')}</div>
                  <div className="team-email">{g.order.name} only{g.accepted_at ? '' : ' · link not opened yet'}</div>
                </div>
                <span className="team-sees">Their order, the shared record, messages, QC checklist</span>
                <span className="role-pill guest">Factory guest</span>
              </div>
            ))}
            <div className="ibx-alert">
              <span className="iv-ic">!</span>
              <span className="iv-txt"><b>Factories never see your margins, costs, or each other.</b> The shared record shows only what's agreed on their order.</span>
            </div>
          </div>
        )}

        <div className="ibx-card" style={{ marginTop: 16 }} ref={addRef}>
          <div className="ibx-head slim"><div>
            <div className="ibx-kick">Add a factory</div>
            <div className="ibx-sub">Only the name is required — everything else can come later.</div>
          </div></div>
          <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: 20 }}>
            <input ref={nameRef} placeholder="Factory name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={ci()} />
            <input placeholder="Country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} style={ci()} />
            <input placeholder="Specialty (e.g. knits, outerwear)" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} style={ci()} />
            <input placeholder="MOQ" value={form.moq} onChange={e => setForm({ ...form, moq: e.target.value })} style={ci()} />
            <input placeholder="Key person" value={form.key_person} onChange={e => setForm({ ...form, key_person: e.target.value })} style={ci()} />
            <input placeholder="Languages" value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} style={ci()} />
            <button className="btn primary small" type="submit" style={{ justifyContent: 'center' }}>Add factory</button>
          </form>
        </div>
      </div>
    </section>
  )
}

function ci(): React.CSSProperties {
  return { padding: '9px 11px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13, background: 'var(--paper)' }
}
