import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order, STAGES } from '../supabase'

// Backward plan from the ship date. Industry-typical offsets; guidance, not gospel.
const MILESTONES = [
  { key: 'po', label: 'PO issued', daysBefore: 90, reachedAt: 'po' },
  { key: 'sampling', label: 'Sample approved', daysBefore: 70, reachedAt: 'sampling' },
  { key: 'production', label: 'Production starts', daysBefore: 50, reachedAt: 'production' },
  { key: 'qc', label: 'Final QC', daysBefore: 14, reachedAt: 'qc' },
  { key: 'ship', label: 'Ship', daysBefore: 0, reachedAt: 'ship' },
] as const

export default function Calendar() {
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    supabase.from('orders').select('*').order('ship_by', { ascending: true })
      .then(({ data }) => setOrders((data as Order[]) || []))
  }, [])

  if (orders === null) return null
  const planned = orders.filter(o => o.ship_by && !['delivered', 'closed'].includes(o.stage))
  const unplanned = orders.filter(o => !o.ship_by && !['delivered', 'closed'].includes(o.stage))

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Calendar</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            Worked backward from each ship date — so you know what has to happen when.
          </div>
        </div>
      </div>

      {planned.length === 0 && (
        <div className="card empty">
          <h2>No ship dates yet.</h2>
          <p>Set a ship-by date on an order and Clewa plans backward from it — PO, sampling, production, QC — so you can see what has to happen when.</p>
          <Link to="/" className="btn gold">Back to orders →</Link>
        </div>
      )}

      {planned.map(o => {
        const ship = new Date(o.ship_by! + 'T00:00:00')
        const today = new Date()
        const stageIdx = STAGES.indexOf(o.stage)
        return (
          <div key={o.id} style={{ marginBottom: 18 }}>
            <div className="section-label">
              <Link to={`/orders/${o.id}`} style={{ color: 'inherit' }}>{o.name}</Link>
              {' '}— ships {o.ship_by}
            </div>
            <div className="card">
              {MILESTONES.map(m => {
                const due = new Date(ship.getTime() - m.daysBefore * 86400000)
                const dueStr = due.toISOString().slice(0, 10)
                const reached = stageIdx >= STAGES.indexOf(m.reachedAt as Order['stage'])
                const overdue = !reached && due < today
                const days = Math.ceil((due.getTime() - today.getTime()) / 86400000)
                return (
                  <div className={`cal-row ${reached ? 'done' : overdue ? 'late' : ''}`} key={m.key}>
                    <span className="cal-dot">{reached ? '✓' : overdue ? '!' : ''}</span>
                    <span className="cal-label">{m.label}</span>
                    <span className="cal-date">{dueStr}</span>
                    <span className="cal-status">
                      {reached ? 'done' : overdue ? `${-days}d late — act now` : `in ${days}d`}
                    </span>
                  </div>
                )
              })}
              {(() => {
                const prodDue = new Date(ship.getTime() - 50 * 86400000)
                if (stageIdx < STAGES.indexOf('production') && prodDue < today) {
                  return (
                    <p className="cal-warn">
                      At this pace you'll miss the {o.ship_by} ship date — production hasn't started and its window has passed. Talk to {o.factory_name || 'your factory'} today about a revised date, or adjust the ship-by.
                    </p>
                  )
                }
                return null
              })()}
            </div>
          </div>
        )
      })}

      {unplanned.length > 0 && (
        <>
          <div className="section-label">No ship date set</div>
          <div className="card">
            {unplanned.map(o => (
              <div className="q-item" key={o.id}>
                <Link to={`/orders/${o.id}`}><strong>{o.name}</strong></Link>
                <span>Add a ship-by date to get its backward plan.</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
