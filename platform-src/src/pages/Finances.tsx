import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order, STAGE_LABELS } from '../supabase'
import { downloadCsv } from '../csv'

type FxNow = Record<string, number>

export default function Finances() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [fxNow, setFxNow] = useState<FxNow>({})

  useEffect(() => {
    supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const list = (data as Order[]) || []
        setOrders(list)
        const bases = [...new Set(list.filter(o => (o as Order & { fx_rate?: number }).fx_rate && o.currency !== 'USD').map(o => o.currency))]
        for (const b of bases) {
          try {
            const r = await fetch(`https://api.frankfurter.app/latest?from=${b}&to=USD`)
            const d = await r.json()
            if (d?.rates?.USD) setFxNow(prev => ({ ...prev, [b]: d.rates.USD }))
          } catch { /* fine */ }
        }
      })
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
        {priced.length > 0 && (
          <button className="btn ghost" onClick={() => downloadCsv('clewa-finances',
            ['order', 'factory', 'stage', 'quantity', 'unit_price', 'currency', 'committed', 'ship_by'],
            priced.map(o => [o.name, o.factory_name || '', o.stage, o.quantity, Number(o.unit_price), o.currency,
              (o.quantity! * Number(o.unit_price)).toFixed(2), o.ship_by || '']))}>Export CSV</button>
        )}
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
            <span style={{ textAlign: 'right' }}>
              <strong className="fin-amount">
                {o.currency} {(o.quantity! * Number(o.unit_price)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </strong>
              {(() => {
                const fo = o as Order & { fx_rate?: number; fx_captured_at?: string }
                if (!fo.fx_rate) return null
                const now = fxNow[o.currency]
                const drift = now ? ((now - Number(fo.fx_rate)) / Number(fo.fx_rate)) * 100 : null
                return (
                  <span className="quiet" style={{ display: 'block', fontSize: 11.5 }}>
                    FX locked {Number(fo.fx_rate).toFixed(4)} USD
                    {drift !== null && Math.abs(drift) >= 0.05
                      ? ` · moved ${drift > 0 ? '+' : ''}${drift.toFixed(1)}% since — your cost didn't`
                      : ''}
                  </span>
                )
              })()}
            </span>
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
