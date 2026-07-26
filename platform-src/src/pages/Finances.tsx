import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Order, STAGE_LABELS } from '../supabase'
import { downloadCsv } from '../csv'
import '../parity/finances.css'

type FxNow = Record<string, number>
type FxOrder = Order & { fx_rate?: number; fx_captured_at?: string }

const ExportIcon = () => (
  <span className="xb-ic">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM10 4v16M4 10h16" /></svg>
  </span>
)

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)

export default function Finances() {
  const nav = useNavigate()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [fxNow, setFxNow] = useState<FxNow>({})

  useEffect(() => {
    supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const list = (data as Order[]) || []
        setOrders(list)
        const bases = [...new Set(list.filter(o => o.currency !== 'USD').map(o => o.currency))]
        for (const b of bases) {
          try {
            const r = await fetch(`https://api.frankfurter.app/latest?from=${b}&to=USD`)
            const d = await r.json()
            if (d?.rates?.USD) setFxNow(prev => ({ ...prev, [b]: d.rates.USD }))
          } catch { /* fine */ }
        }
      })
  }, [])

  if (orders === null) return <Loading />

  const priced = orders.filter(o => o.quantity && o.unit_price)
  const unpriced = orders.filter(o => !(o.quantity && o.unit_price) && !['delivered', 'closed'].includes(o.stage))
  const committed = (o: Order) => o.quantity! * Number(o.unit_price)

  const byCurrency = new Map<string, { sum: number; n: number }>()
  for (const o of priced) {
    const e = byCurrency.get(o.currency) || { sum: 0, n: 0 }
    e.sum += committed(o); e.n++
    byCurrency.set(o.currency, e)
  }
  const dueSoon = priced.filter(o =>
    o.ship_by && !['delivered', 'closed'].includes(o.stage) &&
    (new Date(o.ship_by).getTime() - Date.now()) / 86400000 <= 30,
  )

  // The biggest FX mover among locked orders — powers the demo's "your cost didn't" note.
  let biggestDrift: { o: FxOrder; drift: number } | null = null
  for (const o of priced as FxOrder[]) {
    if (!o.fx_rate || o.currency === 'USD') continue
    const now = fxNow[o.currency]
    if (!now) continue
    const drift = ((now - Number(o.fx_rate)) / Number(o.fx_rate)) * 100
    if (Math.abs(drift) >= 0.05 && (!biggestDrift || Math.abs(drift) > Math.abs(biggestDrift.drift))) {
      biggestDrift = { o, drift }
    }
  }

  const openOrder = (id: string) => nav(`/orders/${id}`)
  const rowKey = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrder(id) }
  }
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

  return (
    <section className="page on" data-page="finances">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Finances</h2>
            <div className="pg-sub">What you've committed to factories, straight from the record — Clewa never holds your money</div>
          </div>
          {priced.length > 0 && (
            <button className="x-btn" type="button" onClick={() => downloadCsv('clewa-finances',
              ['order', 'factory', 'stage', 'quantity', 'unit_price', 'currency', 'committed', 'ship_by'],
              priced.map(o => [o.name, o.factory_name || '', o.stage, o.quantity, Number(o.unit_price), o.currency,
                committed(o).toFixed(2), o.ship_by || '']))}><ExportIcon />Export CSV</button>
          )}
        </div>

        <div className="fin-kpis">
          {[...byCurrency.entries()].map(([cur, e]) => (
            <div className="fin-kpi" key={cur}>
              <div className="fk-num">{cur} {fmt(e.sum)}</div>
              <div className="fk-label">Committed · {cur}</div>
              <div className="fk-sub">across {e.n} order{e.n === 1 ? '' : 's'}</div>
            </div>
          ))}
          <div className="fin-kpi">
            <div className="fk-num">{dueSoon.length}</div>
            <div className="fk-label">Shipping within 30 days</div>
            {dueSoon.length > 0
              ? <div className="fk-sub warn">balances tend to fall due here</div>
              : <div className="fk-sub up">nothing imminent</div>}
          </div>
          {byCurrency.size === 0 && (
            <div className="fin-kpi">
              <div className="fk-num">—</div>
              <div className="fk-label">No priced orders yet</div>
              <div className="fk-sub">agree a unit price on the record</div>
            </div>
          )}
        </div>

        <div className="fin-grid">
          <div className="fin-panel">
            <div className="fin-phead"><h4>Committed by order</h4><span className="fp-tag">from the signed record</span></div>
            <div className="fin-pbody">
              {priced.length === 0 && (
                <p className="fin-note">When an order has a quantity and an agreed unit price, its committed value appears here automatically.</p>
              )}
              {priced.map(o => (
                <div className="pay-row" key={o.id} role="link" tabIndex={0} style={{ cursor: 'pointer' }}
                  onClick={() => openOrder(o.id)} onKeyDown={rowKey(o.id)}>
                  <span className={`py-dot ${['delivered', 'closed'].includes(o.stage) ? 'paid' : 'sched'}`} />
                  <div>
                    <div className="py-main">{o.name}</div>
                    <div className="py-sub">
                      {o.quantity!.toLocaleString()} × {o.currency} {Number(o.unit_price).toFixed(2)}
                      {o.factory_name ? ` · ${o.factory_name}` : ''} · {STAGE_LABELS[o.stage]}
                    </div>
                  </div>
                  <span className="py-amt">{o.currency} {fmt(committed(o))}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="fin-panel">
            <div className="fin-phead"><h4>Shipping · next 30 days</h4></div>
            <div className="fin-pbody">
              {dueSoon.length === 0 && (
                <p className="fin-note">Nothing ships within 30 days. Orders land here as their ship-by dates approach — balances usually fall due around delivery.</p>
              )}
              {dueSoon.map(o => (
                <div className="pay-row" key={o.id} role="link" tabIndex={0} style={{ cursor: 'pointer' }}
                  onClick={() => openOrder(o.id)} onKeyDown={rowKey(o.id)}>
                  <span className="py-dot gated" />
                  <div>
                    <div className="py-main">{o.name}</div>
                    <div className="py-sub">Ships {o.ship_by} · {STAGE_LABELS[o.stage]}</div>
                  </div>
                  <span className="py-amt">{o.currency} {fmt(committed(o))}</span>
                </div>
              ))}
              {unpriced.length > 0 && (
                <>
                  {unpriced.map(o => (
                    <div className="pay-row" key={o.id} role="link" tabIndex={0} style={{ cursor: 'pointer' }}
                      onClick={() => openOrder(o.id)} onKeyDown={rowKey(o.id)}>
                      <span className="py-dot sched" />
                      <div>
                        <div className="py-main">{o.name}</div>
                        <div className="py-sub">Not priced yet — agree a unit price on the record</div>
                      </div>
                      <span className="py-amt">—</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {priced.length > 0 && (
          <div className="fin-panel" style={{ marginTop: 14 }}>
            <div className="fin-phead"><h4>Multi-currency · FX locked at PO</h4><span className="fp-tag">your real cost, in USD</span></div>
            <div className="fx-head"><span>Order · factory currency</span><span className="r">Rate at PO</span><span className="r">Rate today</span><span className="r">Your cost (USD)</span><span>Exposure</span></div>
            {(priced as FxOrder[]).map(o => {
              const amount = committed(o)
              if (o.currency === 'USD') {
                return (
                  <div className="fx-row" key={o.id}>
                    <div className="fx-name">{o.name}<div className="fx-sub">${fmt(amount)} · USD-quoted</div></div>
                    <span className="fx-num">—</span><span className="fx-num">—</span>
                    <span className="fx-num"><b>${fmt(amount)}</b></span>
                    <span className="fx-lock"><LockIcon />No FX risk</span>
                  </div>
                )
              }
              const now = fxNow[o.currency]
              if (o.fx_rate) {
                return (
                  <div className="fx-row" key={o.id}>
                    <div className="fx-name">{o.name}<div className="fx-sub">{o.currency} {fmt(amount)} · {o.currency}</div></div>
                    <span className="fx-num">{Number(o.fx_rate).toFixed(3)}</span>
                    <span className="fx-num">{now ? now.toFixed(3) : '…'}</span>
                    <span className="fx-num"><b>${fmt(amount * Number(o.fx_rate))}</b></span>
                    <span className="fx-lock"><LockIcon />Locked · protected</span>
                  </div>
                )
              }
              return (
                <div className="fx-row" key={o.id}>
                  <div className="fx-name">{o.name}<div className="fx-sub">{o.currency} {fmt(amount)} · {o.currency} · quoting</div></div>
                  <span className="fx-num">unlocked</span>
                  <span className="fx-num">{now ? now.toFixed(3) : 'live'}</span>
                  <span className="fx-num"><b>{now ? `~$${fmt(amount * now)}` : '—'}</b></span>
                  <span className="fx-lock drift">Locks at PO</span>
                </div>
              )
            })}
            {biggestDrift && (
              <p className="fin-note" style={{ padding: '0 20px 16px' }}>
                The {biggestDrift.o.currency}/$ rate moved {Math.abs(biggestDrift.drift).toFixed(1)}% since you
                signed {biggestDrift.o.name} — because Clewa locked the rate at PO, your cost didn't. No surprise on the final invoice.
              </p>
            )}
          </div>
        )}

        <p className="fin-note" style={{ marginTop: 16 }}>
          Deposits, payment milestones and safe-to-pay checks are coming — they'll build on these committed amounts.
          You pay every factory directly; Clewa never holds or moves your money.
        </p>
      </div>
    </section>
  )
}
