import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'

type Invite = { id: string; order_id: string; accepted_at: string | null }
type Overnight = { at: string; text: string; to: string }

export default function Home() {
  const nav = useNavigate()
  const [brandName, setBrandName] = useState('')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [lines, setLines] = useState<RecordLine[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [overnight, setOvernight] = useState<Overnight[]>([])
  const [showTour, setShowTour] = useState(() => {
    try { return !localStorage.getItem('clewa-tour-done') } catch { return false }
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('brand_name').eq('id', data.user.id).single()
        .then(({ data: p }) => setBrandName(p?.brand_name || ''))
    })
    Promise.all([
      supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('record_lines').select('*'),
      supabase.from('order_invites').select('id, order_id, accepted_at').is('revoked_at', null),
    ]).then(async ([o, l, i]) => {
      const ords = (o.data as Order[]) || []
      setOrders(ords)
      setLines((l.data as RecordLine[]) || [])
      setInvites((i.data as Invite[]) || [])
      // While you slept: factory-side activity in the last 48 hours.
      const since = new Date(Date.now() - 48 * 3600000).toISOString()
      const nameOf = (id: string) => ords.find(x => x.id === id)?.name || 'an order'
      const [fm, fr, fq, fl] = await Promise.all([
        supabase.from('order_messages').select('order_id, sender_name, created_at').eq('sender', 'factory').gte('created_at', since),
        supabase.from('production_reports').select('order_id, units, reported_by, created_at').eq('source', 'factory').gte('created_at', since),
        supabase.from('quotes').select('order_id, unit_price, currency, created_at').eq('source', 'factory').gte('created_at', since),
        supabase.from('record_lines').select('order_id, factory_signed_at').gte('factory_signed_at', since),
      ])
      const ov: Overnight[] = []
      for (const m of fm.data || []) ov.push({ at: m.created_at, text: `${m.sender_name || 'Factory'} messaged you on ${nameOf(m.order_id)}`, to: `/orders/${m.order_id}` })
      for (const r of fr.data || []) ov.push({ at: r.created_at, text: `${r.reported_by || 'Factory'} reported ${r.units.toLocaleString()} units on ${nameOf(r.order_id)}`, to: `/orders/${r.order_id}` })
      for (const q of fq.data || []) ov.push({ at: q.created_at, text: `New quote on ${nameOf(q.order_id)}: ${q.currency} ${Number(q.unit_price).toFixed(2)}/unit`, to: `/orders/${q.order_id}` })
      const signsByOrder = new Map<string, number>()
      for (const ln of fl.data || []) signsByOrder.set(ln.order_id, (signsByOrder.get(ln.order_id) || 0) + 1)
      for (const [oid, n] of signsByOrder) ov.push({ at: since, text: `${n} record line${n === 1 ? '' : 's'} countersigned on ${nameOf(oid)}`, to: `/orders/${oid}` })
      ov.sort((a, b) => (a.at < b.at ? 1 : -1))
      setOvernight(ov.slice(0, 6))
    })
  }, [])

  if (orders === null) return null

  const active = orders.filter(o => !['delivered', 'closed'].includes(o.stage))
  // Never sum across currencies — headline the largest, note the rest.
  const byCurrency = new Map<string, number>()
  for (const o of orders) {
    if (o.quantity && o.unit_price) {
      byCurrency.set(o.currency, (byCurrency.get(o.currency) || 0) + o.quantity * Number(o.unit_price))
    }
  }
  const currencies = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])
  const [commCurrency, committed] = currencies[0] || ['USD', 0]
  const otherCommitted = currencies.slice(1)
    .map(([c, v]) => `${c} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
    .join(' · ')
  const unitsInProduction = active.filter(o => ['production', 'qc', 'ship'].includes(o.stage))
    .reduce((s, o) => s + (o.quantity || 0), 0)
  const nextShip = active.filter(o => o.ship_by).sort((a, b) => (a.ship_by! < b.ship_by! ? -1 : 1))[0]
  const daysToShip = nextShip?.ship_by
    ? Math.ceil((new Date(nextShip.ship_by).getTime() - Date.now()) / 86400000)
    : null

  // The "needs you / waiting on them" queue, from real state.
  type QItem = { who: 'you' | 'them'; text: string; sub: string; to: string }
  const queue: QItem[] = []
  for (const o of active) {
    const oLines = lines.filter(l => l.order_id === o.id)
    const inv = invites.find(i => i.order_id === o.id)
    if (oLines.length === 0) {
      queue.push({ who: 'you', text: `Put the ${o.name} agreement on the record`, sub: 'Nothing is signed yet — specs, price, terms', to: `/orders/${o.id}` })
    } else if (!inv) {
      queue.push({ who: 'you', text: `Invite your factory to ${o.name}`, sub: `${oLines.length} line${oLines.length === 1 ? '' : 's'} waiting for their confirmation`, to: `/orders/${o.id}` })
    } else {
      const pending = oLines.filter(l => !l.factory_signed_at)
      if (pending.length > 0) {
        queue.push({
          who: inv.accepted_at ? 'them' : 'you',
          text: inv.accepted_at
            ? `${o.factory_name || 'Factory'} has ${pending.length} line${pending.length === 1 ? '' : 's'} to confirm on ${o.name}`
            : `Send the ${o.name} invite link to ${o.factory_name || 'your factory'}`,
          sub: inv.accepted_at ? 'They opened the order — waiting on their signature' : "Created but not opened yet — send it by email or WhatsApp",
          to: `/orders/${o.id}`,
        })
      }
    }
  }
  const needsYou = queue.filter(q => q.who === 'you')
  const waiting = queue.filter(q => q.who === 'them')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const focus = needsYou[0] || null
  const restNeedsYou = focus ? needsYou.slice(1) : needsYou

  return (
    <>
      <div className="main-head">
        <div>
          <h1>{greeting}{brandName ? `, ${brandName}` : ''}.</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {needsYou.length > 0 && <> · <strong style={{ color: 'var(--thread)' }}>{needsYou.length} thing{needsYou.length === 1 ? '' : 's'} need{needsYou.length === 1 ? 's' : ''} you</strong></>}
          </div>
        </div>
        <Link to="/orders/new" className="btn primary">+ New order</Link>
      </div>

      {showTour && orders.length === 0 && (
        <div className="card steps-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div className="eyebrow">Welcome — the three moves that matter</div>
            <a href="#" style={{ fontSize: 12 }} onClick={e => {
              e.preventDefault()
              try { localStorage.setItem('clewa-tour-done', '1') } catch { /* private mode */ }
              setShowTour(false)
            }}>Got it, hide this</a>
          </div>
          {[
            { t: 'Start in Styles if you have an idea', d: 'The guided builder turns a description into a factory-ready brief and tells you exactly what a factory still needs.', to: '/styles/new', cta: 'Describe your product →' },
            { t: 'Start in Orders if production is already moving', d: 'Put your specs, price and terms on the Record — dated and signed. Everything else hangs off this.', to: '/orders/new', cta: 'Create an order →' },
            { t: 'Then invite your factory with one link', d: "No account on their side. They confirm your terms line by line from a phone — and from then on, both of you see the same truth.", to: '', cta: '' },
          ].map((x, i) => (
            <div className="step" key={i}>
              <span className="step-dot">{i + 1}</span>
              <div>
                <strong>{x.t}</strong>
                <span>{x.d}{x.to && <> <Link to={x.to}>{x.cta}</Link></>}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {focus && (
        <div className="focus-band">
          <div className="fb-main">
            <div className="eyebrow">Today's focus</div>
            <h2>{focus.text}<em>.</em></h2>
            <p>{focus.sub}.</p>
          </div>
          <Link to={focus.to} className="btn gold">Take care of it →</Link>
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi">
          <strong>{committed > 0 ? `${commCurrency} ${committed.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</strong>
          <span>Committed{otherCommitted ? ` · plus ${otherCommitted}` : ''}</span>
        </div>
        <div className="kpi">
          <strong>{active.length}</strong>
          <span>Active order{active.length === 1 ? '' : 's'}</span>
        </div>
        <div className="kpi">
          <strong>{unitsInProduction > 0 ? unitsInProduction.toLocaleString() : '—'}</strong>
          <span>Units in production</span>
        </div>
        <div className="kpi">
          <strong>{daysToShip !== null ? `${daysToShip}d` : '—'}</strong>
          <span>{nextShip ? `To next ship · ${nextShip.name}` : 'No ship dates set'}</span>
        </div>
      </div>

      {(restNeedsYou.length > 0 || waiting.length > 0) && (
        <>
          <div className="section-label">Whose move is it?</div>
          <div className="move-grid">
            <div className="card">
              <div className="eyebrow">Waiting on you</div>
              {restNeedsYou.length === 0 && <p className="quiet">Nothing else — the focus above is the whole list.</p>}
              {restNeedsYou.map((q, i) => (
                <div className={`q-item ${i === 0 ? 'hot' : ''}`} key={i} onClick={() => nav(q.to)}>
                  <strong>{q.text}</strong>
                  <span>{q.sub}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="eyebrow">Waiting on them</div>
              {waiting.length === 0 && <p className="quiet">Nothing outstanding from factories.</p>}
              {waiting.map((q, i) => (
                <div className="q-item" key={i} onClick={() => nav(q.to)}>
                  <strong>{q.text}</strong>
                  <span>{q.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {overnight.length > 0 && (
        <>
          <div className="section-label">While you were away</div>
          <div className="card">
            {overnight.map((o, i) => (
              <div className="q-item" key={i} onClick={() => nav(o.to)}>
                <strong>{o.text}</strong>
                <span>{new Date(o.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Active orders</div>
      {active.length === 0 ? (
        <div className="card empty">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>The thread starts here</div>
          <h2>No active orders.</h2>
          <p>Create your first production order — name it, and Clewa keeps every spec, price and term on the record from day one.</p>
          <Link to="/orders/new" className="btn gold">Start your first order →</Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {active.map(o => {
            const stageIdx = STAGES.indexOf(o.stage)
            return (
              <div className="order-row" key={o.id} onClick={() => nav(`/orders/${o.id}`)}>
                <div>
                  <div className="name">{o.name}</div>
                  <div className="meta">
                    {o.quantity ? `${o.quantity.toLocaleString()} units` : 'Quantity TBD'}
                    {o.factory_name ? ` · ${o.factory_name}` : ''}
                    {o.ship_by ? ` · ship by ${o.ship_by}` : ''}
                  </div>
                  <div className="thread-track">
                    {STAGES.slice(0, 8).map((s, i) => <span key={s} className={i <= stageIdx ? 'done' : ''} />)}
                  </div>
                </div>
                <span className={`stage-pill ${o.stage}`}>{STAGE_LABELS[o.stage]}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
