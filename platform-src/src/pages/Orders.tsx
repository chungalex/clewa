import Loading from '../Loading'
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
  const [archived, setArchived] = useState<Order[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [q, setQ] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) || []))
    supabase.from('orders').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false })
      .then(({ data }) => setArchived((data as Order[]) || []))
  }, [])

  if (orders === null) return <Loading />

  const active = orders.filter(o => !['delivered', 'closed'].includes(o.stage))
  const visible = orders.filter(o => !q.trim() || `${o.name} ${o.factory_name || ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="page-w">
      <div className="pg-bar">
        <div>
          <h2 className="pg-h">Orders</h2>
          <div className="pg-sub">{active.length} active{active.some(o => o.ship_by) ? ' · planned backward from each drop' : ''}</div>
        </div>
        <div className="dv-tools">
          {orders.length > 0 && (
            <button className="x-btn" type="button" onClick={() => exportCsv(orders)}>
              <span className="xb-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM10 4v16M4 10h16" /></svg></span>
              Export CSV
            </button>
          )}
          <Link to="/orders/new" className="hx-newbtn" style={{ textDecoration: 'none' }}>+ New order</Link>
        </div>
      </div>

      {orders.length > 5 && (
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by product or factory…"
          style={{ width: '100%', maxWidth: 340, padding: '9px 13px', border: '1px solid var(--hair)', borderRadius: 999, marginBottom: 14, background: 'var(--paper)' }} />
      )}

      {orders.length === 0 ? (
        <div className="hx-card" style={{ padding: '44px 40px', textAlign: 'center' }}>
          <div className="focus-kick" style={{ color: 'var(--thread)', justifyContent: 'center' }}>The thread starts here</div>
          <div className="cv2-hello" style={{ marginTop: 12 }}>No orders yet.</div>
          <p className="cv2-sub" style={{ maxWidth: '52ch', margin: '10px auto 20px' }}>
            Create your first production order — name it, add your factory, and Clewa keeps every spec, price and term on the record from day one.
          </p>
          <button className="hx-newbtn" type="button" onClick={() => nav('/orders/new')}>Start your first order</button>
          <p className="pg-sub" style={{ marginTop: 16 }}>
            Don't have a factory yet? <a href="../sourcing-apply.html">Clewa Sourcing finds and verifies one for you →</a>
          </p>
        </div>
      ) : (
        <div className="otab">
          <div className="otab-head"><span>Order</span><span>Factory</span><span>Stage</span><span>Value</span><span>Drop</span></div>
          {visible.map(o => {
            const idx = STAGES.indexOf(o.stage)
            const k = Math.round((idx / 7) * 4)
            const val = o.quantity && o.unit_price ? `${o.currency} ${(o.quantity * Number(o.unit_price)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
            const days = o.ship_by ? Math.ceil((new Date(o.ship_by).getTime() - Date.now()) / 86400000) : null
            const pill = ['production', 'qc', 'ship'].includes(o.stage) ? 'live'
              : days !== null && days < 50 && ['techpack', 'quote', 'po', 'sampling'].includes(o.stage) ? 'risk' : 'idle'
            const drop = o.ship_by
              ? new Date(o.ship_by).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : STAGE_LABELS[o.stage]
            return (
              <div className="otab-row" role="link" tabIndex={0} key={o.id}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click() }}
                onClick={() => nav(`/orders/${o.id}`)}>
                <div>
                  <div className="ot-name">{o.name}</div>
                  <div className="ot-sub">{o.quantity ? `${o.quantity.toLocaleString()} units` : 'Quantity TBD'}</div>
                </div>
                <div className="ot-fac">{o.factory_name || '—'}</div>
                <div className="o-track">
                  {[0, 1, 2, 3, 4].flatMap(i => [
                    <span key={`k${i}`} className={`ok ${i < k ? 'done' : i === k ? 'now' : ''}`} />,
                    ...(i < 4 ? [<span key={`l${i}`} className={`ot ${i < k ? 'done' : ''}`} />] : []),
                  ])}
                </div>
                <div className="ot-val">{val}</div>
                <div><span className={`ot-stage ${pill}`}>{drop}</span></div>
              </div>
            )
          })}
        </div>
      )}

      {archived.length > 0 && (
        <p style={{ marginTop: 16 }}>
          <a href="#" style={{ fontSize: 12.5 }} onClick={e => { e.preventDefault(); setShowArchived(!showArchived) }}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </a>
        </p>
      )}
      {showArchived && (
        <div className="otab" style={{ opacity: 0.75, marginTop: 8 }}>
          {archived.map(o => (
            <div className="otab-row" key={o.id} style={{ cursor: 'default', gridTemplateColumns: '1fr auto' }}>
              <div>
                <div className="ot-name">{o.name}</div>
                <div className="ot-sub">archived {(o as Order & { archived_at?: string }).archived_at?.slice(0, 10)}</div>
              </div>
              <button className="x-btn" type="button" onClick={async () => {
                await supabase.from('orders').update({ archived_at: null }).eq('id', o.id)
                setArchived(archived.filter(x => x.id !== o.id))
                supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false })
                  .then(({ data }) => setOrders((data as Order[]) || []))
              }}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
