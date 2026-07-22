import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Order } from '../supabase'

type Msg = {
  order_id: string
  sender: 'brand' | 'factory'
  sender_name: string | null
  body: string
  translated_body: string | null
  translation_status: string
  created_at: string
}

/** Every conversation in one place — newest activity first, factory replies flagged. */
export default function Inbox() {
  const nav = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [msgs, setMsgs] = useState<Msg[] | null>(null)

  async function load() {
    const [o, m] = await Promise.all([
      supabase.from('orders').select('*').is('archived_at', null),
      supabase.from('order_messages')
        .select('order_id, sender, sender_name, body, translated_body, translation_status, created_at')
        .order('created_at', { ascending: false }).limit(300),
    ])
    setOrders((o.data as Order[]) || [])
    setMsgs((m.data as Msg[]) || [])
  }

  useEffect(() => {
    load()
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => clearInterval(tick)
  }, [])

  if (msgs === null) return null

  // One row per order, newest thread first.
  const threads = new Map<string, { latest: Msg; count: number; fromFactory: number }>()
  for (const m of msgs) {
    const t = threads.get(m.order_id)
    if (!t) threads.set(m.order_id, { latest: m, count: 1, fromFactory: m.sender === 'factory' ? 1 : 0 })
    else { t.count++; if (m.sender === 'factory') t.fromFactory++ }
  }
  const rows = [...threads.entries()]
    .map(([orderId, t]) => ({ orderId, order: orders.find(o => o.id === orderId), ...t }))
    .filter(r => r.order)
    .sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1))

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Messages</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            Every conversation, one place — each thread lives on its order, so nothing gets lost.
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty">
          <h2>No conversations yet.</h2>
          <p>Messages start on an order — open one, write to your factory, and the thread appears here.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {rows.map(r => {
            const m = r.latest
            const preview = (m.sender !== 'brand' && m.translation_status === 'done' && m.translated_body) ? m.translated_body : m.body
            return (
              <div className="order-row" key={r.orderId} onClick={() => nav(`/orders/${r.orderId}`)}>
                <div style={{ minWidth: 0 }}>
                  <div className="name">
                    {r.order!.name}
                    <span className="quiet" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                      {r.count} message{r.count === 1 ? '' : 's'}{r.order!.factory_name ? ` · ${r.order!.factory_name}` : ''}
                    </span>
                  </div>
                  <div className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 640 }}>
                    <strong style={{ color: m.sender === 'factory' ? 'var(--thread)' : 'var(--ink-3)', fontWeight: 500 }}>
                      {m.sender === 'brand' ? 'You' : (m.sender_name || 'Factory')}:
                    </strong>{' '}{preview}
                  </div>
                </div>
                <span className="quiet" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {new Date(m.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
