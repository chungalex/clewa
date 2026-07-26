import Loading from '../Loading'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order, STAGES } from '../supabase'
import '../parity/calendar.css'

// Backward plan from the ship date. Industry-typical offsets; guidance, not gospel.
const MILESTONES = [
  { key: 'po', label: 'PO issued', daysBefore: 90, reachedAt: 'po', evClass: 'pay' },
  { key: 'sampling', label: 'Sample approved', daysBefore: 70, reachedAt: 'sampling', evClass: 'sample' },
  { key: 'production', label: 'Production starts', daysBefore: 50, reachedAt: 'production', evClass: 'prod' },
  { key: 'qc', label: 'Final QC', daysBefore: 14, reachedAt: 'qc', evClass: 'qc' },
  { key: 'ship', label: 'Ship', daysBefore: 0, reachedAt: 'ship', evClass: 'drop' },
] as const

// The demo's backward-planner chain: weeks before launch for each step.
const BP_NODES = [
  { wk: 13, label: 'Tech pack locked' },
  { wk: 11, label: 'Quotes in & chosen' },
  { wk: 10, label: 'Place order · deposit', keyNode: true },
  { wk: 9, label: 'Sampling & fit' },
  { wk: 6, label: 'Production' },
  { wk: 2, label: 'QC & inspection' },
  { wk: 1, label: 'Ship & transit' },
  { wk: 0, label: 'Launch / drop', drop: true },
] as const

type Closure = { label: string; from: string; to: string }
type FactoryRow = { name: string; closures: Closure[] }

const DAY = 86400000
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export default function Calendar() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [factories, setFactories] = useState<FactoryRow[]>([])
  const [view, setView] = useState<'timeline' | 'month'>('timeline')
  const [launch, setLaunch] = useState<string | null>(null)
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  useEffect(() => {
    supabase.from('orders').select('*').is('archived_at', null).order('ship_by', { ascending: true })
      .then(({ data }) => setOrders((data as Order[]) || []))
    supabase.from('factories').select('name, closures')
      .then(({ data }) => setFactories((data as FactoryRow[]) || []))
  }, [])

  function closuresFor(factoryName: string | null): Closure[] {
    if (!factoryName) return []
    const f = factories.find(x => x.name.toLowerCase() === factoryName.toLowerCase())
    return f?.closures || []
  }

  if (orders === null) return <Loading variant="detail" />
  const today = new Date(new Date().toDateString())
  const planned = orders.filter(o => o.ship_by && !['delivered', 'closed'].includes(o.stage))
  const unplanned = orders.filter(o => !o.ship_by && !['delivered', 'closed'].includes(o.stage))

  // ---- Backward planner: launch date (defaults to the next real ship date) ----
  const defaultLaunch = planned.find(o => new Date(o.ship_by! + 'T00:00:00') >= today)?.ship_by
    || planned[0]?.ship_by
    || isoDate(new Date(today.getTime() + 112 * DAY))
  const launchStr = launch || defaultLaunch
  const launchDate = new Date(launchStr + 'T00:00:00')
  const orderBy = new Date(launchDate.getTime() - 70 * DAY) // wk 10 node
  const presets = planned.slice(0, 2)

  // Closures that fall inside the critical path window get called out.
  const windowClosure = (() => {
    for (const f of factories) {
      for (const c of f.closures || []) {
        const from = new Date(c.from + 'T00:00:00'); const to = new Date(c.to + 'T00:00:00')
        if (to >= orderBy && from <= launchDate) return { f, c }
      }
    }
    return null
  })()

  // ---- Existing ICS export, unchanged logic ----
  function exportIcs() {
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clewa//Production//EN']
    for (const o of planned) {
      const ship = new Date(o.ship_by + 'T00:00:00')
      for (const m of MILESTONES) {
        const due = new Date(ship.getTime() - m.daysBefore * DAY)
        lines.push('BEGIN:VEVENT',
          `UID:${o.id}-${m.key}@clewa.io`,
          `DTSTART;VALUE=DATE:${fmt(due)}`,
          `SUMMARY:${o.name}: ${m.label}`,
          `DESCRIPTION:Clewa backward plan for ${o.name}${o.factory_name ? ` (${o.factory_name})` : ''}`,
          'END:VEVENT')
      }
    }
    for (const f of factories) {
      for (const c of f.closures || []) {
        const to = new Date(new Date(c.to + 'T00:00:00').getTime() + DAY)
        lines.push('BEGIN:VEVENT',
          `UID:closure-${f.name.replace(/\W/g, '')}-${c.from}@clewa.io`,
          `DTSTART;VALUE=DATE:${c.from.replace(/-/g, '')}`,
          `DTEND;VALUE=DATE:${fmt(to)}`,
          `SUMMARY:${f.name} closed${c.label ? ` — ${c.label}` : ''}`,
          'END:VEVENT')
      }
    }
    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'clewa-production.ics'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---- Timeline window: everything from the earliest milestone to past the last ship ----
  const winStart = (() => {
    let min = today.getTime() - 7 * DAY
    for (const o of planned) {
      const po = new Date(o.ship_by + 'T00:00:00').getTime() - 104 * DAY
      if (po < min) min = po
    }
    return min
  })()
  const winEnd = (() => {
    let max = today.getTime() + 60 * DAY
    for (const o of planned) {
      const s = new Date(o.ship_by + 'T00:00:00').getTime() + 14 * DAY
      if (s > max) max = s
    }
    return max
  })()
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - winStart) / (winEnd - winStart)) * 100))
  const headCells = Array.from({ length: 8 }, (_, i) => shortDate(new Date(winStart + ((winEnd - winStart) / 8) * i)))

  // ---- Collision / pace warnings (existing logic, one alert shown) ----
  const alert = (() => {
    for (const o of planned) {
      const ship = new Date(o.ship_by! + 'T00:00:00')
      const stageIdx = STAGES.indexOf(o.stage)
      for (const m of MILESTONES) {
        const due = new Date(ship.getTime() - m.daysBefore * DAY)
        if (stageIdx >= STAGES.indexOf(m.reachedAt as Order['stage'])) continue
        for (const c of closuresFor(o.factory_name)) {
          if (due >= new Date(c.from + 'T00:00:00') && due <= new Date(c.to + 'T00:00:00')) {
            return (
              <span className="ca-txt">
                <b>{o.factory_name} closes {shortDate(new Date(c.from + 'T00:00:00'))}–{shortDate(new Date(c.to + 'T00:00:00'))}</b>
                {c.label ? ` (${c.label})` : ''}, across your {o.name}'s "{m.label}" — <span className="ca-strong">the {o.ship_by} ship date slips</span> unless it moves earlier.
              </span>
            )
          }
        }
      }
    }
    for (const o of planned) {
      const ship = new Date(o.ship_by! + 'T00:00:00')
      const stageIdx = STAGES.indexOf(o.stage)
      const prodDue = new Date(ship.getTime() - 50 * DAY)
      if (stageIdx < STAGES.indexOf('production') && prodDue < today) {
        return (
          <span className="ca-txt">
            At this pace you'll <span className="ca-strong">miss the {o.ship_by} ship date</span> on <b>{o.name}</b> — production hasn't started and its window has passed. Talk to {o.factory_name || 'your factory'} today about a revised date, or adjust the ship-by.
          </span>
        )
      }
    }
    return null
  })()

  // ---- Month grid data (existing logic, demo markup) ----
  const events = new Map<string, { label: string; evClass: string; to: string }[]>()
  const closedDays = new Map<string, string[]>()
  const closureStarts = new Map<string, string>()
  for (const f of factories) {
    for (const c of f.closures || []) {
      const from = new Date(c.from + 'T00:00:00'); const to = new Date(c.to + 'T00:00:00')
      closureStarts.set(isoDate(from), `${f.name} closed`)
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const k = isoDate(d)
        if (!closedDays.has(k)) closedDays.set(k, [])
        closedDays.get(k)!.push(`${f.name} closed${c.label ? ` (${c.label})` : ''}`)
      }
    }
  }
  for (const o of planned) {
    const ship = new Date(o.ship_by + 'T00:00:00')
    for (const m of MILESTONES) {
      const due = new Date(ship.getTime() - m.daysBefore * DAY)
      const key = isoDate(due)
      if (!events.has(key)) events.set(key, [])
      events.get(key)!.push({ label: `${o.name} · ${m.label}`, evClass: m.evClass, to: `/orders/${o.id}` })
    }
  }
  const first = new Date(monthStart)
  const firstWeekday = (first.getDay() + 6) % 7 // Monday-start
  const gridStart = new Date(first.getTime() - firstWeekday * DAY)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const monthCells = Array.from({ length: totalCells }, (_, i) => new Date(gridStart.getTime() + i * DAY))
  const monthName = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const todayKey = isoDate(new Date())

  return (
    <div className="page-w">
      <div className="pg-bar">
        <div>
          <h2 className="pg-h">Calendar</h2>
          <div className="pg-sub">Plan backward from your launch — Clewa lays out every milestone in reverse and flags the date you must place by</div>
        </div>
      </div>

      {/* BACKWARD PLANNER */}
      <div className="bplan">
        <div className="bplan-h">
          <div><div className="bp-kick">Backward planner</div><div className="bp-title">Work back from your launch date</div></div>
          <div className="bp-launch">
            <span className="bpl-lab">Launch</span>
            {presets.length > 0 && (
              <div className="bp-presets">
                {presets.map(o => (
                  <button
                    className={`bp-preset${launchStr === o.ship_by ? ' on' : ''}`}
                    type="button"
                    key={o.id}
                    onClick={() => setLaunch(o.ship_by!)}
                  >
                    {o.name} · {shortDate(new Date(o.ship_by! + 'T00:00:00'))}
                  </button>
                ))}
              </div>
            )}
            <input className="bp-date" type="date" value={launchStr} onChange={e => { if (e.target.value) setLaunch(e.target.value) }} />
          </div>
        </div>
        <div className="bp-chain">
          <div className="bp-track">
            {BP_NODES.map((n, i) => {
              const when = new Date(launchDate.getTime() - n.wk * 7 * DAY)
              const done = when < today
              const cls = ['bp-node', done && 'done', !done && 'keyNode' in n && n.keyNode && 'key', 'drop' in n && n.drop && 'drop'].filter(Boolean).join(' ')
              return (
                <div className={cls} key={n.wk}>
                  <div className="bp-dot">
                    {'drop' in n && n.drop
                      ? <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                      : i + 1}
                  </div>
                  <div className="bp-when">{shortDate(when)}</div>
                  <div className="bp-what">{n.label}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="bp-foot">
          <span className="bpf-ic">C</span>
          <span className="bpf-tx">
            To hit this launch, <b>place the order by <span className="bpf-strong">{shortDate(orderBy)}</span></b> — that's the drop minus a 10-week critical path.
            {windowClosure && <> Note: {windowClosure.f.name} is closed {shortDate(new Date(windowClosure.c.from + 'T00:00:00'))}–{shortDate(new Date(windowClosure.c.to + 'T00:00:00'))}{windowClosure.c.label ? ` (${windowClosure.c.label})` : ''} inside that window — build in the slack.</>}
            {' '}Move the launch and every date re-flows.
          </span>
        </div>
      </div>

      <div className="cal-wrap">
        <div className="dv-toolbar">
          <h3>Operations calendar</h3>
          <div className="dv-tools">
            <div className="seg-mini">
              <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>
              <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button>
            </div>
            {planned.length > 0 && (
              <button className="x-btn" title="Import into Google Calendar, Apple Calendar or Outlook" onClick={exportIcs}>
                <span className="xb-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM10 4v16M4 10h16" /></svg></span>
                Export (.ics)
              </button>
            )}
          </div>
        </div>

        {/* TIMELINE VIEW */}
        <div className={`calview-panel${view === 'timeline' ? ' active' : ''}`}>
          {planned.length === 0 ? (
            <div className="card empty">
              <h2>No ship dates yet.</h2>
              <p>Set a ship-by date on an order and Clewa plans backward from it — PO, sampling, production, QC — so you can see what has to happen when.</p>
              <Link to="/" className="btn gold">Back to orders →</Link>
            </div>
          ) : (
            <div className="cal-grid">
              <div className="cal-months">
                <div className="cm-cell">Order</div>
                {headCells.map((c, i) => <div className="cm-cell" key={i}>{c}</div>)}
              </div>
              {planned.map((o, rowIdx) => {
                const ship = new Date(o.ship_by! + 'T00:00:00').getTime()
                const stageIdx = STAGES.indexOf(o.stage)
                const prePo = stageIdx < STAGES.indexOf('po')
                const seg = (from: number, to: number) => ({ left: `${pct(from)}%`, width: `${Math.max(0, pct(to) - pct(from))}%` })
                return (
                  <div className="cal-row" key={o.id}>
                    <div className="cr-label">
                      <Link to={`/orders/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        <div className="cr-name">{o.name}</div>
                        <div className="cr-fac">{o.factory_name || 'No factory yet'}{o.quantity ? ` · ${o.quantity.toLocaleString()}u` : ''}</div>
                      </Link>
                    </div>
                    <div className="cal-track">
                      {closuresFor(o.factory_name).map((c, i) => {
                        const from = new Date(c.from + 'T00:00:00').getTime()
                        const to = new Date(c.to + 'T00:00:00').getTime() + DAY
                        if (to < winStart || from > winEnd) return null
                        return (
                          <div className="cal-closure" style={seg(from, to)} key={i}>
                            <span className="clo-lab">Closed{c.label ? ` · ${c.label}` : ''}</span>
                          </div>
                        )
                      })}
                      <div className={`cal-today${rowIdx === 0 ? ' head' : ''}`} style={{ left: `${pct(today.getTime())}%` }}></div>
                      {prePo && <div className="cal-bar b-quote" style={seg(ship - 104 * DAY, ship - 90 * DAY)}>Quoting</div>}
                      <div className="cal-bar b-sample" style={seg(ship - 90 * DAY, ship - 50 * DAY)}>Sampling</div>
                      <div className="cal-bar b-prod" style={seg(ship - 50 * DAY, ship - 14 * DAY)}>Production</div>
                      <div className="cal-bar b-ship" style={seg(ship - 14 * DAY, ship)}>Ship</div>
                      <div className="cal-mile drop" style={{ left: `${pct(ship)}%` }} title={`Ships ${o.ship_by}`}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {alert && (
            <div className="cal-alert"><span className="ca-ic2">!</span>{alert}</div>
          )}
          {unplanned.length > 0 && (
            <div className="pg-sub" style={{ marginTop: 14 }}>
              No ship date set: {unplanned.map((o, i) => (
                <React.Fragment key={o.id}>{i > 0 && ', '}<Link to={`/orders/${o.id}`}>{o.name}</Link></React.Fragment>
              ))} — add a ship-by date to place {unplanned.length === 1 ? 'it' : 'them'} on the calendar.
            </div>
          )}
        </div>

        {/* MONTH VIEW */}
        <div className={`calview-panel${view === 'month' ? ' active' : ''}`}>
          <div className="dv-toolbar">
            <button className="x-btn ghost" onClick={() => setMonthStart(new Date(first.getFullYear(), first.getMonth() - 1, 1))}>
              ← {new Date(first.getFullYear(), first.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short' })}
            </button>
            <h3>{monthName}</h3>
            <button className="x-btn ghost" onClick={() => setMonthStart(new Date(first.getFullYear(), first.getMonth() + 1, 1))}>
              {new Date(first.getFullYear(), first.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'short' })} →
            </button>
          </div>
          <div className="cmg-wrap">
            <div className="cmg-head"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>
            <div className="cmg-grid">
              {monthCells.map((d, i) => {
                const key = isoDate(d)
                const inMonth = d.getMonth() === first.getMonth()
                const evs = events.get(key) || []
                const closed = closedDays.get(key) || []
                const closedStart = closureStarts.get(key)
                const cls = ['cmg-cell', !inMonth && 'dim', key === todayKey && 'today', closed.length > 0 && 'closed'].filter(Boolean).join(' ')
                return (
                  <div className={cls} key={i} title={closed.join(' · ') || undefined}>
                    <span className="cmg-date">{d.getDate()}</span>
                    {closedStart && <span className="cmg-ev closed-lab">{closedStart}</span>}
                    {evs.map((e, j) => (
                      <Link to={e.to} className={`cmg-ev ${e.evClass}`} key={j} title={e.label}>{e.label}</Link>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
