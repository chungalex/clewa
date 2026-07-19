import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'

function csvEscape(v: string | number | null | undefined) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function exportCsv(orders: Order[]) {
  const { data } = await supabase.from('record_lines').select('*')
  const lines = (data as RecordLine[]) || []
  const rows = [
    ['order', 'stage', 'factory', 'country', 'quantity', 'unit_price', 'currency', 'ship_by', 'record_category', 'record_content', 'brand_signed', 'factory_signed', 'superseded'].join(','),
  ]
  for (const o of orders) {
    const oLines = lines.filter(l => l.order_id === o.id)
    if (!oLines.length) {
      rows.push([o.name, o.stage, o.factory_name, o.factory_country, o.quantity, o.unit_price, o.currency, o.ship_by, '', '', '', '', ''].map(csvEscape).join(','))
    }
    for (const l of oLines) {
      rows.push([o.name, o.stage, o.factory_name, o.factory_country, o.quantity, o.unit_price, o.currency, o.ship_by,
        l.category, l.content, l.brand_signed_at || '', l.factory_signed_at || '', l.superseded_by ? 'yes' : ''].map(csvEscape).join(','))
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `clewa-orders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    supabase.from('orders').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) || []))
  }, [])

  if (orders === null) return null

  return (
    <>
      <div className="main-head">
        <h1>Orders</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {orders.length > 0 && (
            <button className="btn ghost" onClick={() => exportCsv(orders)}>Export CSV</button>
          )}
          <Link to="/orders/new" className="btn primary">+ New order</Link>
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="card empty">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>The thread starts here</div>
          <h2>No orders yet.</h2>
          <p>Create your first production order — name it, add your factory, and Clewa keeps every spec, price and term on the record from day one.</p>
          <Link to="/orders/new" className="btn gold">Start your first order →</Link>
          <p className="quiet" style={{ marginTop: 14, fontSize: 13 }}>
            Don't have a factory yet? <a href="../sourcing-apply.html">Clewa Sourcing finds and verifies one for you →</a>
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {orders.map(o => {
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
