import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'
import Loading from '../Loading'

type Invite = { id: string; order_id: string; accepted_at: string | null }
type Overnight = { at: string; who: string; text: string; to: string }
type ProductSignal = { name: string; on_hand: number; weekly_sales: number; safety_stock: number }
type FactoryRow = { name: string; closures: { label: string; from: string; to: string }[] }

// Next move per stage, phrased like the demo: quiet label, bold action.
const STAGE_NEXT: Record<string, [string, string]> = {
  techpack: ['Drafting', 'finish the brief, then quotes'],
  quote: ['Quoting', 'compare quotes'],
  po: ['PO', 'get both signatures on the record'],
  sampling: ['Sampling', 'review the sample'],
  production: ['In production', 'QC comes next'],
  qc: ['QC', 'record the verdict'],
  ship: ['Shipping', 'confirm arrival'],
}

export default function Home() {
  const nav = useNavigate()
  const [brandName, setBrandName] = useState('')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [lines, setLines] = useState<RecordLine[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [overnight, setOvernight] = useState<Overnight[]>([])
  const [products, setProducts] = useState<ProductSignal[]>([])
  const [factories, setFactories] = useState<FactoryRow[]>([])
  const [styleCount, setStyleCount] = useState(0)
  const [sampleApproved, setSampleApproved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('brand_name').eq('id', data.user.id).single()
        .then(({ data: p }) => setBrandName(p?.brand_name || ''))
    })
    Promise.all([
      supabase.from('orders').select('*').is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('record_lines').select('*'),
      supabase.from('order_invites').select('id, order_id, accepted_at').is('revoked_at', null),
      supabase.from('products').select('name, on_hand, weekly_sales, safety_stock'),
      supabase.from('factories').select('name, closures'),
      supabase.from('styles').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('samples').select('status'),
    ]).then(async ([o, l, i, pr, fa, sc, sm]) => {
      const ords = (o.data as Order[]) || []
      setOrders(ords)
      setLines((l.data as RecordLine[]) || [])
      setInvites((i.data as Invite[]) || [])
      setProducts((pr.data as ProductSignal[]) || [])
      setFactories((fa.data as FactoryRow[]) || [])
      setStyleCount(sc.count || 0)
      setSampleApproved(((sm.data as { status: string }[]) || []).some(s => s.status === 'approved'))
      // Factory hours: the other side's activity in the last 48 hours.
      const since = new Date(Date.now() - 48 * 3600000).toISOString()
      const nameOf = (id: string) => ords.find(x => x.id === id)?.name || 'an order'
      const [fm, fr, fq, fl] = await Promise.all([
        supabase.from('order_messages').select('order_id, sender_name, created_at').eq('sender', 'factory').gte('created_at', since),
        supabase.from('production_reports').select('order_id, units, reported_by, created_at').eq('source', 'factory').gte('created_at', since),
        supabase.from('quotes').select('order_id, unit_price, currency, created_at').eq('source', 'factory').gte('created_at', since),
        supabase.from('record_lines').select('order_id, factory_signed_at').gte('factory_signed_at', since),
      ])
      const ov: Overnight[] = []
      for (const m of fm.data || []) ov.push({ at: m.created_at, who: m.sender_name || 'Factory', text: `messaged on ${nameOf(m.order_id)}`, to: `/orders/${m.order_id}` })
      for (const r of fr.data || []) ov.push({ at: r.created_at, who: r.reported_by || 'Factory', text: `reported ${r.units.toLocaleString()} units on ${nameOf(r.order_id)}`, to: `/orders/${r.order_id}` })
      for (const q of fq.data || []) ov.push({ at: q.created_at, who: 'Factory', text: `quoted ${q.currency} ${Number(q.unit_price).toFixed(2)} on ${nameOf(q.order_id)}`, to: `/orders/${q.order_id}` })
      const signsByOrder = new Map<string, { n: number; at: string }>()
      for (const ln of (fl.data || []) as { order_id: string; factory_signed_at: string }[]) {
        const cur = signsByOrder.get(ln.order_id)
        signsByOrder.set(ln.order_id, { n: (cur?.n || 0) + 1, at: ln.factory_signed_at })
      }
      for (const [oid, s] of signsByOrder) ov.push({ at: s.at, who: 'Factory', text: `countersigned ${s.n} line${s.n === 1 ? '' : 's'} on ${nameOf(oid)}`, to: `/orders/${oid}` })
      ov.sort((a, b) => (a.at < b.at ? 1 : -1))
      setOvernight(ov.slice(0, 4))
    })
  }, [])

  if (orders === null) return <Loading />

  const active = orders.filter(o => !['delivered', 'closed'].includes(o.stage))
  // Never sum across currencies — headline the largest, note the rest.
  const byCurrency = new Map<string, number>()
  for (const o of orders) {
    if (o.quantity && o.unit_price) {
      byCurrency.set(o.currency, (byCurrency.get(o.currency) || 0) + o.quantity * Number(o.unit_price))
    }
  }
  const currencies = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])
  const [commCurrency, committed] = currencies[0] || ['USD', 0]
  const otherCommitted = currencies.slice(1)
    .map(([c, v]) => `${c} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
    .join(' · ')
  const fmtMoney = (cur: string, v: number) => `${cur} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  // The demo's compact stat format: $61.4k — one line, always.
  const fmtK = (cur: string, v: number) => v >= 10000 ? `${cur} ${(v / 1000).toFixed(1)}k` : fmtMoney(cur, v)
  const unitsInProduction = active.filter(o => ['production', 'qc', 'ship'].includes(o.stage))
    .reduce((s, o) => s + (o.quantity || 0), 0)
  const nextShip = active.filter(o => o.ship_by).sort((a, b) => (a.ship_by! < b.ship_by! ? -1 : 1))[0]
  const daysToShip = nextShip?.ship_by
    ? Math.ceil((new Date(nextShip.ship_by).getTime() - Date.now()) / 86400000)
    : null

  // Whose move — from real state.
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
            ? `${o.factory_name || 'Factory'} · ${pending.length} line${pending.length === 1 ? '' : 's'} to confirm on ${o.name}`
            : `Send the ${o.name} invite link to ${o.factory_name || 'your factory'}`,
          sub: inv.accepted_at ? 'They opened the order — waiting on their signature' : 'Created but not opened yet — send it by email or WhatsApp',
          to: `/orders/${o.id}`,
        })
      }
    }
  }
  const needsYou = queue.filter(q => q.who === 'you')
  const waiting = queue.filter(q => q.who === 'them')
  const focus = needsYou[0] || null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Guided walkthrough — six real steps, computed from real state.
  const hasCostedOrder = orders.some(o => o.quantity && o.unit_price)
  const hasSigned = lines.some(l => l.factory_signed_at)
  const inProduction = orders.some(o => ['production', 'qc', 'ship', 'delivered'].includes(o.stage))
  const gsteps = [
    { t: 'Define your product', done: styleCount > 0 || orders.length > 0, d: 'A style or an order — the thread starts with what you\'re making.', to: '/styles/new', cta: 'Describe your product' },
    { t: 'Set your quantities and price', done: hasCostedOrder, d: 'Units and unit price on the order — so money is never a surprise.', to: '/orders/new', cta: 'Create the order' },
    { t: 'Choose your factory', done: invites.length > 0, d: 'One invite link — no account needed on their side.', to: '/orders', cta: 'Open your order' },
    { t: 'Agree terms & sign the record', done: hasSigned, d: 'Both sides confirm line by line — dated and signed.', to: '/orders', cta: 'See the record' },
    { t: 'Approve your sample', done: sampleApproved, d: 'Photos in, verdict recorded — this is what protects bulk.', to: '/orders', cta: 'Review samples' },
    { t: 'Production, QC & ship', done: inProduction, d: 'Counts, checks and the handover — all on the same thread.', to: '/orders', cta: 'Track production' },
  ]
  const doneCount = gsteps.filter(s => s.done).length
  const nowIdx = gsteps.findIndex(s => !s.done)

  // Money: how much of the committed value is countersigned.
  const signedValue = active.reduce((s, o) => {
    if (!o.quantity || !o.unit_price || o.currency !== commCurrency) return s
    const oLines = lines.filter(l => l.order_id === o.id && !l.superseded_by)
    return oLines.length > 0 && oLines.every(l => l.factory_signed_at) ? s + o.quantity * Number(o.unit_price) : s
  }, 0)
  const pricedActive = active.filter(o => o.quantity && o.unit_price)
    .sort((a, b) => b.quantity! * Number(b.unit_price) - a.quantity! * Number(a.unit_price)).slice(0, 3)

  // Inventory signals.
  const reorder = products.filter(p => p.weekly_sales > 0 && p.on_hand - p.safety_stock < p.weekly_sales * 6)
  const aging = products.filter(p => p.on_hand > 0 && (p.weekly_sales === 0 || p.on_hand / p.weekly_sales > 26))
  const incoming = active.filter(o => ['production', 'qc', 'ship'].includes(o.stage) && o.quantity)
  const invRows = [
    ...reorder.slice(0, 2).map(p => ({ name: p.name, sub: `${p.on_hand.toLocaleString()} on hand · cover under 6 weeks`, pill: 'Reorder', cls: 'reorder' })),
    ...incoming.slice(0, 1).map(o => ({ name: o.name, sub: `${o.quantity!.toLocaleString()}u incoming${o.ship_by ? ` · lands ${o.ship_by}` : ''}`, pill: 'Incoming', cls: 'incoming' })),
    ...aging.slice(0, 1).map(p => ({ name: p.name, sub: 'Capital sitting still — no sell-through recorded', pill: 'Aging', cls: 'incoming' })),
  ].slice(0, 3)

  // This week — seven days with real closures and ship dates.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i)
    const key = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const closures = factories.flatMap(f => (f.closures || [])
      .filter(c => key >= c.from && key <= c.to).map(() => `${f.name} closes`))
    const ships = active.filter(o => o.ship_by === key).map(o => `${o.name} ships`)
    return { d, today: i === 0, closed: closures.length > 0, events: [...ships.map(t => ({ t, cls: 'hot' })), ...closures.slice(0, 1).map(t => ({ t, cls: 'clo' }))] }
  })

  const knotFor = (o: Order) => Math.round((STAGES.indexOf(o.stage) / 7) * 4)

  return (
    <div className="cv2">
      <div className="cv2-top">
        <div>
          <h2 className="cv2-hello">{greeting}{brandName ? `, ${brandName}` : ''}.</h2>
          <p className="cv2-sub">
            {today}
            {needsYou.length > 0
              ? <> · <b>{needsYou.length} thing{needsYou.length === 1 ? '' : 's'} need{needsYou.length === 1 ? 's' : ''} you</b> before the day gets away.</>
              : <> · nothing is waiting on you.</>}
          </p>
        </div>
        <div className="cv2-actions">
          <button className="x-btn ghost" type="button" onClick={() => nav('/messages')}>Message a factory</button>
          <button className="hx-newbtn" type="button" onClick={() => nav('/orders/new')}>+ New order</button>
        </div>
      </div>

      {/* GUIDED WALKTHROUGH — visible in Guided mode; body.guided hides the pro surfaces below */}
      <div className="guide">
        <div className="guide-top">
          <span className="guide-mk">C</span>
          <div>
            <div className="guide-kick">Guided mode · Clewa walks you through it</div>
            <div className="guide-h">{doneCount >= 6 ? 'Your first order made it all the way through.' : `Let's get your ${orders.length === 0 ? 'first ' : ''}order moving${brandName ? `, ${brandName}` : ''}.`}</div>
            <div className="guide-sub">No jargon — each step is explained in plain language with exactly what to do next. Switch to Pro any time; it's the same data with more control.</div>
          </div>
          <div className="guide-prog"><div className="gp-ring"><i>{doneCount}<span>/6</span></i></div></div>
        </div>
        <div className="guide-steps">
          {gsteps.map((s, i) => (
            <div className={`gstep ${s.done ? 'done' : ''} ${i === nowIdx ? 'now' : ''}`} key={i}>
              <span className="gs-c">{s.done
                ? <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                : i + 1}</span>
              <div>
                <div className="gs-t">{s.t}</div>
                {i === nowIdx ? (
                  <>
                    <div className="gs-coach"><b>What this means:</b> {s.d}</div>
                    <div className="gs-act"><button className="dm-btn primary" type="button" onClick={() => nav(s.to)}>{s.cta}</button></div>
                  </>
                ) : (
                  <div className="gs-d">{s.done ? 'Done.' : s.d}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="guide-foot"><span className="gf-x">⇄</span>Stuck on anything? Ask in plain English from Intelligence — it only reads your own data.</div>
      </div>

      {/* FOCUS BAND */}
      {focus && (
        <div className="focus">
          <div className="focus-body">
            <div className="focus-kick"><span className="fk-pulse" />Today's focus{daysToShip !== null && daysToShip > 0 ? ` · ${daysToShip} days of runway` : ''}</div>
            <div className="focus-h">{focus.text}<em>.</em></div>
            <div className="focus-why">{focus.sub}. Handle it now and the rest of the thread keeps moving without you.</div>
          </div>
          <div className="focus-side">
            <button className="focus-btn" type="button" onClick={() => nav(focus.to)}>Take care of it</button>
            <button className="focus-btn ghost" type="button" onClick={() => nav('/orders')}>See all orders</button>
            {needsYou.length > 1 && <span className="focus-meta">{needsYou.length - 1} more after this</span>}
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <div className="cv2-pulse">
        <div className="cv2-stat"><div className="cs-num">{committed > 0 ? fmtK(commCurrency, committed) : '—'}</div><div className="cs-lab">Committed{otherCommitted ? ` · plus ${otherCommitted}` : ''}</div></div>
        <div className="cv2-stat"><div className="cs-num">{active.length}</div><div className="cs-lab">Active order{active.length === 1 ? '' : 's'}</div></div>
        <div className="cv2-stat"><div className="cs-num">{unitsInProduction > 0 ? unitsInProduction.toLocaleString() : '—'}</div><div className="cs-lab">Units in production</div></div>
        {(() => {
          const awaiting = lines.filter(l => !l.superseded_by && !l.factory_signed_at && active.some(o => o.id === l.order_id)).length
          return <div className={`cv2-stat ${awaiting > 0 ? 'warn' : ''}`}><div className="cs-num">{awaiting}</div><div className="cs-lab">Line{awaiting === 1 ? '' : 's'} awaiting factory signature</div></div>
        })()}
        <div className="cv2-stat"><div className="cs-num">{daysToShip !== null ? `${daysToShip}d` : '—'}</div><div className="cs-lab">{nextShip ? `To next ship · ${nextShip.name}` : 'No ship dates set'}</div></div>
      </div>

      {/* WHOSE MOVE */}
      {(needsYou.length > 0 || waiting.length > 0) && (
        <div className="court">
          <div className="shared-h">
            <span className="sh-title">Whose move is it?</span>
          </div>
          <div className="court-cols">
            <div className="court-col you">
              <div className="cc-h">Waiting on you <span className="cc-n">{needsYou.length}</span></div>
              {needsYou.length === 0 && <div className="cc-item"><div className="cc-sub">Nothing — you're clear.</div></div>}
              {needsYou.map((q, i) => (
                <div className="cc-item" key={i} onClick={() => nav(q.to)}>
                  <div className="cc-what">{q.text}</div>
                  <div className="cc-sub">{q.sub}.</div>
                </div>
              ))}
            </div>
            <div className="court-col them">
              <div className="cc-h">Waiting on them <span className="cc-n">{waiting.length}</span></div>
              {waiting.length === 0 && <div className="cc-item"><div className="cc-sub">Nothing outstanding from factories.</div></div>}
              {waiting.map((q, i) => (
                <div className="cc-item" key={i} onClick={() => nav(q.to)}>
                  <div className="cc-what">{q.text}</div>
                  <div className="cc-sub">{q.sub}.</div>
                </div>
              ))}
            </div>
          </div>
          <div className="shared-foot">
            <span>Both sides work on the same live record — when it's your move, it's here; everything else is safely theirs.</span>
            {active[0] && <span className="shf-link" onClick={() => nav(`/orders/${active[0].id}`)}>Open an order →</span>}
          </div>
        </div>
      )}

      {/* BENTO */}
      {active.length === 0 ? (
        <div className="hx-card" style={{ padding: '44px 40px', textAlign: 'center' }}>
          <div className="focus-kick" style={{ color: 'var(--thread)', justifyContent: 'center' }}>The thread starts here</div>
          <div className="cv2-hello" style={{ marginTop: 12 }}>No active orders.</div>
          <p className="cv2-sub" style={{ maxWidth: '48ch', margin: '10px auto 20px' }}>
            Create your first production order — name it, and Clewa keeps every spec, price and term on the record from day one.
          </p>
          <button className="hx-newbtn" type="button" onClick={() => nav('/orders/new')}>Start your first order</button>
        </div>
      ) : (
        <div className="bento">
          <div className="hx-card b-orders">
            <div className="hx-chead"><span className="hc-title">Active orders</span><span className="hc-link" onClick={() => nav('/orders')}>All orders →</span></div>
            {active.slice(0, 4).map(o => {
              const k = knotFor(o)
              const next = STAGE_NEXT[o.stage] || ['Underway', 'keep it moving']
              const needsMe = needsYou.some(q => q.to === `/orders/${o.id}`)
              const val = o.quantity && o.unit_price ? fmtMoney(o.currency, o.quantity * Number(o.unit_price)) : '—'
              return (
                <div className="bo-row" key={o.id} onClick={() => nav(`/orders/${o.id}`)}>
                  <div>
                    <div className="bo-name">{o.name}</div>
                    <div className="bo-meta">{o.quantity ? `${o.quantity.toLocaleString()}u` : 'Qty TBD'}{o.factory_name ? ` · ${o.factory_name}` : ''}</div>
                  </div>
                  <div>
                    <div className="hx-track">
                      {[0, 1, 2, 3, 4].flatMap(i => [
                        <span key={`k${i}`} className={`ht-k ${i < k ? 'done' : i === k ? 'now' : ''}`} />,
                        ...(i < 4 ? [<span key={`l${i}`} className={`ht-l ${i < k ? 'done' : ''}`} />] : []),
                      ])}
                    </div>
                    <div className="bo-next">{next[0]} — <b>{next[1]}</b></div>
                  </div>
                  <div className="bo-right">
                    <span className={`bo-pill ${needsMe ? 'risk' : ['production', 'qc', 'ship'].includes(o.stage) ? 'ok' : 'idle'}`}>
                      {needsMe ? 'Action' : ['production', 'qc', 'ship'].includes(o.stage) ? 'On track' : STAGE_LABELS[o.stage]}
                    </span>
                    <div className="bo-val">{val}</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hx-card b-money">
            <div className="hx-chead"><span className="hc-title">Money</span><span className="hc-link" onClick={() => nav('/finances')}>Finances →</span></div>
            <div className="bm-body">
              <div className="bm-big">{committed > 0 ? fmtMoney(commCurrency, committed) : '—'}</div>
              <div className="bm-cap">committed · active orders{otherCommitted ? ` · plus ${otherCommitted}` : ''}</div>
              <div className="bm-bar"><div className="bm-fill" style={{ width: `${committed > 0 ? Math.max(4, Math.round((signedValue / committed) * 100)) : 0}%` }} /></div>
              <div className="bm-scale"><span>{fmtMoney(commCurrency, signedValue)} signed by both sides</span><span>{fmtMoney(commCurrency, committed)} committed</span></div>
              {pricedActive.map(o => {
                const oLines = lines.filter(l => l.order_id === o.id && !l.superseded_by)
                const st = oLines.length === 0 ? ['sched', 'Not on the record yet'] :
                  oLines.every(l => l.factory_signed_at) ? ['paid', 'Signed by both sides'] : ['gated', 'Awaiting factory signature']
                return (
                  <div className="bm-row" key={o.id} onClick={() => nav(`/orders/${o.id}`)} style={{ cursor: 'pointer' }}>
                    <span className={`bm-dot ${st[0]}`} />
                    <div><div className="bm-main">{o.name}</div><div className="bm-sub">{st[1]}</div></div>
                    <span className="bm-amt">{fmtMoney(o.currency, o.quantity! * Number(o.unit_price))}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="hx-card b-week">
            <div className="hx-chead"><span className="hc-title">This week</span><span className="hc-link" onClick={() => nav('/calendar')}>Full calendar →</span></div>
            <div className="hw-grid">
              {week.map((w, i) => (
                <div className={`hw-day ${w.today ? 'today' : ''} ${w.closed ? 'closed' : ''}`} key={i}>
                  <div className="hw-head">{w.d.toLocaleDateString('en-US', { weekday: 'short' })} <b>{w.d.getDate()}</b></div>
                  {w.events.map((e, j) => <span className={`hw-ev ${e.cls}`} key={j}>{e.t}</span>)}
                </div>
              ))}
            </div>
          </div>

          {overnight.length > 0 && (
            <div className="hx-card b-feed">
              <div className="hx-chead"><span className="hc-title">Factory hours</span><span className="hc-sub">while you were away</span></div>
              {overnight.map((o, i) => (
                <div className="bf-item" key={i} onClick={() => nav(o.to)} style={{ cursor: 'pointer' }}>
                  <span className="bf-time">{new Date(o.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  <div className="bf-what"><b>{o.who}</b> {o.text}</div>
                </div>
              ))}
            </div>
          )}

          {invRows.length > 0 && (
            <div className="hx-card b-inv">
              <div className="hx-chead"><span className="hc-title">Inventory signals</span><span className="hc-link" onClick={() => nav('/inventory')}>Inventory →</span></div>
              {invRows.map((r, i) => (
                <div className="bi-row" key={i}>
                  <div><div className="bi-name">{r.name}</div><div className="bi-sub">{r.sub}</div></div>
                  <span className={`bi-pill ${r.cls}`}>{r.pill}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
