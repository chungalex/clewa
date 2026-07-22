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
  const [view, setView] = useState<'plan' | 'month'>('plan')
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  useEffect(() => {
    supabase.from('orders').select('*').is('archived_at', null).order('ship_by', { ascending: true })
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
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn small ${view === 'plan' ? 'primary' : 'ghost'}`} onClick={() => setView('plan')}>Backward plan</button>
          <button className={`btn small ${view === 'month' ? 'primary' : 'ghost'}`} onClick={() => setView('month')}>Month</button>
        </div>
      </div>

      {view === 'month' && (() => {
        // Every milestone of every planned order lands on a day.
        const events = new Map<string, { label: string; late: boolean; to: string }[]>()
        const today = new Date(new Date().toDateString())
        for (const o of planned) {
          const ship = new Date(o.ship_by + 'T00:00:00')
          const stageIdx = STAGES.indexOf(o.stage)
          for (const m of MILESTONES) {
            const due = new Date(ship.getTime() - m.daysBefore * 86400000)
            const key = due.toISOString().slice(0, 10)
            const reached = stageIdx >= STAGES.indexOf(m.reachedAt as Order['stage'])
            const late = !reached && due < today
            if (!events.has(key)) events.set(key, [])
            events.get(key)!.push({ label: `${o.name}: ${m.label}`, late, to: `/orders/${o.id}` })
          }
        }
        const first = new Date(monthStart)
        const firstWeekday = (first.getDay() + 6) % 7 // Monday-start
        const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
        const cells: (Date | null)[] = []
        for (let i = 0; i < firstWeekday; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d))
        const monthName = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        const todayKey = new Date().toISOString().slice(0, 10)
        return (
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button className="btn ghost small" onClick={() => setMonthStart(new Date(first.getFullYear(), first.getMonth() - 1, 1))}>← {new Date(first.getFullYear(), first.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short' })}</button>
              <strong style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 18 }}>{monthName}</strong>
              <button className="btn ghost small" onClick={() => setMonthStart(new Date(first.getFullYear(), first.getMonth() + 1, 1))}>{new Date(first.getFullYear(), first.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'short' })} →</button>
            </div>
            <div className="cal-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div className="cal-dow" key={d}>{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div className="cal-cell empty" key={i} />
                const key = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
                const evs = events.get(key) || []
                return (
                  <div className={`cal-cell ${key === todayKey ? 'today' : ''}`} key={i}>
                    <span className="cal-daynum">{d.getDate()}</span>
                    {evs.map((e, j) => (
                      <Link to={e.to} className={`cal-ev ${e.late ? 'late' : ''}`} key={j} title={e.label}>{e.label}</Link>
                    ))}
                  </div>
                )
              })}
            </div>
            <p className="quiet" style={{ fontSize: 11.5, marginTop: 10 }}>
              Red = overdue for where the order actually is. Factory closure bands (Tet, August breaks) arrive once
              closures are recorded on the factory rolodex.
            </p>
          </div>
        )
      })()}

      {view === 'month' ? null : <>

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
      </>}
    </>
  )
}
