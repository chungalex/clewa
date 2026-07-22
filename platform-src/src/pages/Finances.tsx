import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order, STAGE_LABELS } from '../supabase'

export default function Finances() {
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) || []))
  }, [])

  if (orders === null) return null

  const priced = orders.filter(o => o.quantity && o.unit_price)
  const unpriced = orders.filter(o => !(o.quantity && o.unit_price) && !['delivered', 'closed'].includes(o.stage))

  const byCurrency = new Map<string, number>()
  for (const o of priced) {
    byCurrency.set(o.currency, (byCurrency.get(o.currency) || 0) + o.quantity! * Number(o.unit_price))
  }
  const dueSoon = priced.filter(o =>
    o.ship_by && !['delivered', 'closed'].includes(o.stage) &&
    (new Date(o.ship_by).getTime() - Date.now()) / 86400000 <= 30,
  )

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Finances</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            What you've committed to factories, straight from the record. Clewa never holds or moves your money.
          </div>
        </div>
      </div>

      <div className="kpi-row">
        {[...byCurrency.entries()].map(([cur, sum]) => (
          <div className="kpi" key={cur}>
            <strong>{cur} {sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            <span>Committed · {cur}</span>
          </div>
        ))}
        <div className="kpi">
          <strong>{dueSoon.length}</strong>
          <span>Order{dueSoon.length === 1 ? '' : 's'} shipping within 30 days</span>
        </div>
        {byCurrency.size === 0 && (
          <div className="kpi">
            <strong>—</strong>
            <span>No priced orders yet</span>
          </div>
        )}
      </div>

      <div className="section-label">Committed by order</div>
      <div className="card" style={{ padding: 0 }}>
        {priced.length === 0 && (
          <p className="quiet" style={{ padding: 18 }}>
            When an order has a quantity and an agreed unit price, its committed value appears here automatically.
          </p>
        )}
        {priced.map(o => (
          <div className="fin-row" key={o.id}>
            <div>
              <Link to={`/orders/${o.id}`}><strong>{o.name}</strong></Link>
              <span className="fin-meta">
                {o.quantity!.toLocaleString()} × {o.currency} {Number(o.unit_price).toFixed(2)}
                {o.factory_name ? ` · ${o.factory_name}` : ''} · {STAGE_LABELS[o.stage]}
              </span>
            </div>
            <strong className="fin-amount">
              {o.currency} {(o.quantity! * Number(o.unit_price)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </strong>
          </div>
        ))}
      </div>

      {unpriced.length > 0 && (
        <>
          <div className="section-label">Not priced yet</div>
          <div className="card">
            {unpriced.map(o => (
              <div className="q-item" key={o.id}>
                <Link to={`/orders/${o.id}`}><strong>{o.name}</strong></Link>
                <span>Agree a unit price on the record and it lands here.</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="quiet" style={{ marginTop: 16, fontSize: 12.5 }}>
        Deposits, payment milestones and safe-to-pay checks are coming — they'll build on these committed amounts.
      </p>
    </>
  )
}
