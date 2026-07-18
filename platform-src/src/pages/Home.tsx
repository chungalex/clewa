import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'

type Invite = { id: string; order_id: string; accepted_at: string | null }

export default function Home() {
  const nav = useNavigate()
  const [brandName, setBrandName] = useState('')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [lines, setLines] = useState<RecordLine[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('brand_name').eq('id', data.user.id).single()
        .then(({ data: p }) => setBrandName(p?.brand_name || ''))
    })
    Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('record_lines').select('*'),
      supabase.from('order_invites').select('id, order_id, accepted_at'),
    ]).then(([o, l, i]) => {
      setOrders((o.data as Order[]) || [])
      setLines((l.data as RecordLine[]) || [])
      setInvites((i.data as Invite[]) || [])
    })
  }, [])

  if (orders === null) return null

  const active = orders.filter(o => !['delivered', 'closed'].includes(o.stage))
  const committed = orders.reduce((s, o) => s + (o.quantity && o.unit_price ? o.quantity * Number(o.unit_price) : 0), 0)
  const commCurrency = orders.find(o => o.quantity && o.unit_price)?.currency || 'USD'
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

      <div className="kpi-row">
        <div className="kpi">
          <strong>{committed > 0 ? `${commCurrency} ${committed.toLocaleString()}` : '—'}</strong>
          <span>Committed</span>
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

      {(needsYou.length > 0 || waiting.length > 0) && (
        <>
          <div className="section-label">Whose move is it?</div>
          <div className="move-grid">
            <div className="card">
              <div className="eyebrow">Waiting on you</div>
              {needsYou.length === 0 && <p className="quiet">Nothing — you're clear.</p>}
              {needsYou.map((q, i) => (
                <div className="q-item" key={i} onClick={() => nav(q.to)}>
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
