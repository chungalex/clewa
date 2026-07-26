import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SUPABASE_URL, SUPABASE_KEY, Order, RecordLine, STAGES } from '../supabase'
import { QcCheck } from '../Qc'
import '../parity/intelligence.css'

type Sample = { order_id: string; round: number; kind: string; status: string }
type Quote = { order_id: string; unit_price: number; currency: string; status: string }
type Insight = { severity: 'urgent' | 'week' | 'clean'; text: string; why: string; to?: string }

const CHIPS = [
  "What's at risk this week?",
  'Which orders need me today?',
  'Which factory is my most reliable?',
  'What must I place next, and when?',
]

/**
 * The intelligence layer. Everything below is computed directly from the
 * user's data — it works with AI off, exactly as promised. Ask Clewa adds
 * language on top when the provider key is configured.
 */
export default function Intelligence() {
  const [orders, setOrders] = useState<Order[]>([])
  const [lines, setLines] = useState<RecordLine[]>([])
  const [samples, setSamples] = useState<Sample[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [qc, setQc] = useState<(QcCheck & { order_id: string })[]>([])
  const [ready, setReady] = useState(false)
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [askState, setAskState] = useState<'idle' | 'busy' | 'setup'>('idle')

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*').is('archived_at', null),
      supabase.from('record_lines').select('*'),
      supabase.from('samples').select('order_id, round, kind, status'),
      supabase.from('quotes').select('order_id, unit_price, currency, status'),
      supabase.from('qc_checks').select('*'),
    ]).then(([o, l, s, q, c]) => {
      setOrders((o.data as Order[]) || [])
      setLines((l.data as RecordLine[]) || [])
      setSamples((s.data as Sample[]) || [])
      setQuotes((q.data as Quote[]) || [])
      setQc((c.data as (QcCheck & { order_id: string })[]) || [])
      setReady(true)
    })
  }, [])

  async function ask(q: string) {
    const text = q.trim()
    if (!text || askState === 'busy') return
    setAsked(text)
    setQuestion('')
    setAskState('busy')
    setAnswer('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ask-clewa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', apikey: SUPABASE_KEY,
          Authorization: `Bearer ${sess.session?.access_token || ''}`,
        },
        body: JSON.stringify({ question: text }),
      })
      const d = await resp.json()
      if (d.setup) { setAskState('setup'); return }
      setAnswer(d.ok ? d.answer : 'Something went wrong — try again.')
      setAskState('idle')
    } catch {
      setAnswer('Something went wrong — try again.')
      setAskState('idle')
    }
  }

  if (!ready) return <Loading />

  const active = orders.filter(o => !['delivered', 'closed'].includes(o.stage))
  const insights: Insight[] = []
  const today = Date.now()

  for (const o of active) {
    const oLines = lines.filter(l => l.order_id === o.id && !l.superseded_by)
    const unsigned = oLines.filter(l => !l.factory_signed_at)
    const oSamples = samples.filter(s => s.order_id === o.id)
    const awaitingReview = oSamples.filter(s => s.status === 'submitted')
    const oQc = qc.filter(c => c.order_id === o.id)
    const conflicts = oQc.filter(c =>
      (c.brand_status === 'pass' && c.factory_status === 'fail') ||
      (c.brand_status === 'fail' && c.factory_status === 'pass'))

    // Time risk: production window vs ship date (mirrors the calendar's backward plan).
    if (o.ship_by) {
      const prodDue = new Date(o.ship_by).getTime() - 50 * 86400000
      const days = Math.ceil((new Date(o.ship_by).getTime() - today) / 86400000)
      if (STAGES.indexOf(o.stage) < STAGES.indexOf('production') && prodDue < today) {
        insights.push({
          severity: 'urgent',
          text: `${o.name} will miss its ${o.ship_by} ship date at this pace`,
          why: `Production hasn't started and its window passed ${Math.ceil((today - prodDue) / 86400000)} days ago. ${days}d remain.`,
          to: `/orders/${o.id}`,
        })
      } else if (days <= 21 && STAGES.indexOf(o.stage) < STAGES.indexOf('qc')) {
        insights.push({
          severity: 'week',
          text: `${o.name} ships in ${days} days — QC window approaching`,
          why: 'Agree the inspection checklist with the factory before goods are packed.',
          to: `/orders/${o.id}`,
        })
      }
    }
    if (conflicts.length > 0) {
      insights.push({
        severity: 'urgent',
        text: `QC disagreement on ${o.name}: "${conflicts[0].item}"`,
        why: conflicts[0].factory_note ? `Factory says: ${conflicts[0].factory_note}` : 'You and the factory recorded opposite verdicts — resolve it before shipment.',
        to: `/orders/${o.id}`,
      })
    }
    if (awaitingReview.length > 0) {
      insights.push({
        severity: 'week',
        text: `Sample round ${awaitingReview[0].round} on ${o.name} awaits your review`,
        why: 'The factory is blocked until you approve or request changes.',
        to: `/orders/${o.id}`,
      })
    }
    if (unsigned.length > 0) {
      insights.push({
        severity: 'week',
        text: `${unsigned.length} record line${unsigned.length === 1 ? '' : 's'} unconfirmed on ${o.name}`,
        why: 'Nothing unconfirmed is agreed — nudge the factory from the order page.',
        to: `/orders/${o.id}`,
      })
    }
    if (oLines.length > 0 && unsigned.length === 0 && conflicts.length === 0 && awaitingReview.length === 0) {
      insights.push({ severity: 'clean', text: `${o.name} is running clean`, why: 'Record fully signed, nothing waiting on either side.', to: `/orders/${o.id}` })
    }
  }

  const urgent = insights.filter(i => i.severity === 'urgent')
  const week = insights.filter(i => i.severity === 'week')
  const clean = insights.filter(i => i.severity === 'clean')

  // Anomaly watch: numbers that don't match the record.
  const anomalies: { text: React.ReactNode; to: string }[] = []
  for (const o of active) {
    const accepted = quotes.find(q => q.order_id === o.id && q.status === 'accepted')
    if (accepted && o.unit_price && Math.abs(Number(o.unit_price) - Number(accepted.unit_price)) > 0.005) {
      anomalies.push({
        to: `/orders/${o.id}`,
        text: <><b>{o.name}'s working price is {o.currency} {Number(o.unit_price).toFixed(2)} — the accepted quote says {accepted.currency} {Number(accepted.unit_price).toFixed(2)}.</b> The agreed number and the working number differ — check before any invoice is paid.</>,
      })
    }
    const conflicts = qc.filter(c => c.order_id === o.id &&
      ((c.brand_status === 'pass' && c.factory_status === 'fail') || (c.brand_status === 'fail' && c.factory_status === 'pass')))
    if (conflicts.length > 0) {
      anomalies.push({
        to: `/orders/${o.id}`,
        text: <><b>QC verdicts disagree on {o.name}: "{conflicts[0].item}".</b> You and the factory recorded opposite results — resolve it before shipment.</>,
      })
    }
  }

  // Readiness gate: the most pressing active order (earliest ship date first).
  const gateOrder = [...active].sort((a, b) =>
    (a.ship_by ? new Date(a.ship_by).getTime() : Infinity) - (b.ship_by ? new Date(b.ship_by).getTime() : Infinity))[0]
  let gates: { state: 'done' | 'warn' | 'idle'; c?: string; what: string; sub: string }[] = []
  if (gateOrder) {
    const gLines = lines.filter(l => l.order_id === gateOrder.id && !l.superseded_by)
    const gSigned = gLines.filter(l => l.factory_signed_at)
    const gSamples = samples.filter(s => s.order_id === gateOrder.id)
    const gApproved = gSamples.some(s => s.status === 'approved')
    const gSubmitted = gSamples.some(s => s.status === 'submitted')
    const gQc = qc.filter(c => c.order_id === gateOrder.id)
    const gConflicts = gQc.filter(c =>
      (c.brand_status === 'pass' && c.factory_status === 'fail') ||
      (c.brand_status === 'fail' && c.factory_status === 'pass'))
    gates = [
      {
        state: gLines.length > 0 ? 'done' : 'idle',
        what: 'Record started',
        sub: gLines.length > 0 ? `${gLines.length} line${gLines.length === 1 ? '' : 's'} on the shared record` : 'Add spec, price and terms lines on the order',
      },
      {
        state: gLines.length === 0 ? 'idle' : gSigned.length === gLines.length ? 'done' : 'warn',
        c: gLines.length > 0 && gSigned.length < gLines.length ? `${gSigned.length}/${gLines.length}` : undefined,
        what: 'Factory line-by-line confirmation',
        sub: gLines.length === 0 ? 'Unlocks once the record has lines'
          : gSigned.length === gLines.length ? `All ${gLines.length} lines confirmed by the factory`
            : `Factory has confirmed ${gSigned.length} of ${gLines.length} record lines`,
      },
      {
        state: gApproved ? 'done' : gSubmitted ? 'warn' : 'idle',
        c: gSubmitted && !gApproved ? '!' : undefined,
        what: 'Sample approved',
        sub: gApproved ? 'An approved sample is on the record'
          : gSubmitted ? 'A sample awaits your review' : 'No sample rounds yet',
      },
      {
        state: gConflicts.length > 0 ? 'warn' : gQc.length > 0 ? 'done' : 'idle',
        c: gConflicts.length > 0 ? '!' : undefined,
        what: 'QC checklist agreed',
        sub: gConflicts.length > 0 ? `${gConflicts.length} verdict${gConflicts.length === 1 ? '' : 's'} in dispute`
          : gQc.length > 0 ? `${gQc.length} check${gQc.length === 1 ? '' : 's'} on the list, no disputes` : 'Build the checklist before goods are packed',
      },
      {
        state: gateOrder.ship_by ? 'done' : 'idle',
        what: 'Ship date set',
        sub: gateOrder.ship_by ? `Shipping by ${gateOrder.ship_by}` : 'Set a ship date to plan backward from',
      },
    ]
  }

  const briefLine = active.length === 0
    ? 'Create an order and the briefing starts here.'
    : urgent.length === 0 && week.length === 0
      ? (clean.length > 0 ? `Nothing needs you — ${clean.length} order${clean.length === 1 ? ' is' : 's are'} running clean.` : 'Nothing urgent on the record today.')
      : [
        urgent.length > 0 ? `${urgent.length === 1 ? 'One thing is' : `${urgent.length} things are`} urgent` : '',
        week.length > 0 ? `${week.length === 1 ? 'one needs' : `${week.length} need`} attention this week` : '',
        clean.length > 0 ? 'the rest is running clean' : '',
      ].filter(Boolean).join(', ') + '.'

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <section className="page on" data-page="intel">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Intelligence</h2>
            <div className="pg-sub">Your sourcing director — watching every order, every date, every number</div>
          </div>
          <div className="dv-tools"><span className="inv-sync"><span className="is-dot" />Computed <b>live from your record</b></span></div>
        </div>

        <div className="ix-brief">
          <div className="ixb-head">
            <span className="ixb-mark">C</span>
            <div>
              <div className="ixb-kick">The morning briefing · {todayLabel}</div>
              <div className="ixb-line">{briefLine}</div>
            </div>
          </div>
          <div className="ixb-items">
            {urgent.map((i, idx) => (
              <div className="ixi urgent" key={`u${idx}`}>
                <span className="ixi-tag">Urgent</span>
                <div className="ixi-body">
                  <div className="ixi-what">{i.text}</div>
                  <div className="ixi-why">{i.why}</div>
                  <div className="ixi-act">
                    <Link className="dm-btn primary" to={i.to || '#'}>Open order</Link>
                    <span className="ixi-conf">Computed from your orders and record — not an estimate</span>
                  </div>
                </div>
              </div>
            ))}
            {week.map((i, idx) => (
              <div className="ixi" key={`w${idx}`}>
                <span className="ixi-tag warn">This week</span>
                <div className="ixi-body">
                  <div className="ixi-what">{i.text}</div>
                  <div className="ixi-why">{i.why}</div>
                  <div className="ixi-act"><Link className="dm-btn" to={i.to || '#'}>Open order</Link></div>
                </div>
              </div>
            ))}
            {clean.length > 0 && (
              <div className="ixi">
                <span className="ixi-tag ok">Running clean</span>
                <div className="ixi-body">
                  <div className="ixi-what">{clean.map(c => c.text.replace(' is running clean', '')).join(', ')} {clean.length === 1 ? 'is' : 'are'} fully signed with nothing waiting on either side.</div>
                  <div className="ixi-why">Nothing to do — this is what on-track looks like.</div>
                </div>
              </div>
            )}
            {active.length > 0 && urgent.length === 0 && week.length === 0 && clean.length === 0 && (
              <div className="ixi">
                <span className="ixi-tag ok">Quiet</span>
                <div className="ixi-body">
                  <div className="ixi-what">Your active orders have no record lines yet.</div>
                  <div className="ixi-why">The briefing sharpens as specs, prices and terms land on the record.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ix-grid">
          <div className="ix-card">
            <div className="hx-chead"><span className="hc-title">Readiness gate{gateOrder ? ` · ${gateOrder.name}` : ''}</span><span className="hc-sub">nothing starts incomplete</span></div>
            <div className="ixr-body">
              {gateOrder ? (
                <>
                  <p className="ixr-cap">Every gate below is read straight from this order's record — nothing is estimated.</p>
                  {gates.map((g, i) => (
                    <div className={`ixr-item ${g.state}`} key={i}>
                      <span className="ixr-c">{g.state === 'done'
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                        : g.c || '·'}</span>
                      <div><div className="ixr-what">{g.what}</div><div className="ixr-sub">{g.sub}</div></div>
                    </div>
                  ))}
                  <div style={{ marginTop: 14 }}><Link className="dm-btn" to={`/orders/${gateOrder.id}`}>Open {gateOrder.name}</Link></div>
                </>
              ) : (
                <p className="ixr-cap">Appears once you have an active order — each gate is read straight from its record.</p>
              )}
            </div>
          </div>

          <div className="ix-col">
            <div className="ix-card">
              <div className="hx-chead"><span className="hc-title">Anomaly watch</span><span className="hc-sub">numbers that don't match the record</span></div>
              {anomalies.length === 0 ? (
                <div className="ixa-item ok"><span className="ixa-dot ok" /><div className="ixa-txt"><b>Nothing out of line.</b> Order prices match accepted quotes and QC verdicts agree on every active order.</div></div>
              ) : anomalies.map((a, i) => (
                <div className="ixa-item" key={i}>
                  <span className="ixa-dot" />
                  <div className="ixa-txt">{a.text}</div>
                  <Link className="dm-btn" to={a.to}>Open order</Link>
                </div>
              ))}
            </div>
            <div className="ix-card">
              <div className="hx-chead"><span className="hc-title">Patterns · from your history</span><span className="hc-sub">judgment, accumulated</span></div>
              <div className="ixr-body">
                <p className="ixr-cap" style={{ margin: 0 }}>
                  Pattern detection — sample-round averages per factory, spec-lock timing, size-curve bias —
                  unlocks with more history. These need a few seasons of data to be honest.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="ask-wrap">
          <div className="ask-hero">
            <div className="ask-mark">C</div>
            <h2>Ask Clewa</h2>
            <p>Your production copilot — it knows your orders, factories, costs and calendar. Ask anything.</p>
            <div className="ask-chips">
              {CHIPS.map(c => (
                <button className="ask-chip" type="button" key={c} onClick={() => ask(c)}
                  style={{ font: 'inherit' }}>{c}</button>
              ))}
            </div>
          </div>
          {asked && (
            <div className="ask-convo">
              <div className="ask-q">{asked}</div>
              {askState === 'busy' && (
                <div className="ask-a">
                  <div className="ask-a-h"><span className="aah-mk">C</span>Clewa</div>
                  <div className="ask-a-body">Thinking — reading your orders and record…</div>
                </div>
              )}
              {askState === 'setup' && (
                <div className="ask-a">
                  <div className="ask-a-h"><span className="aah-mk">C</span>Clewa</div>
                  <div className="ask-a-body">Ask Clewa is deployed but needs the <b>ANTHROPIC_API_KEY</b> secret configured in Supabase. Everything above works without it.</div>
                </div>
              )}
              {answer && (
                <div className="ask-a">
                  <div className="ask-a-h"><span className="aah-mk">C</span>Clewa</div>
                  <div className="ask-a-body" style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>
                  <div className="ask-cites">
                    <Link className="ask-cite" to="/orders" style={{ textDecoration: 'none' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
                      Your orders
                    </Link>
                    <Link className="ask-cite" to="/contacts" style={{ textDecoration: 'none' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="8" r="3" /><path d="M4 19c0-3 2.5-5 5-5s5 2 5 5" /></svg>
                      Your factories
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
          <form className="ask-bar" onSubmit={e => { e.preventDefault(); ask(question) }}>
            <div className="ask-inwrap">
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask about your orders, costs, factories, timing…"
              />
              <button className="chat-send" type="submit" disabled={askState === 'busy' || !question.trim()} aria-label="Ask Clewa">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
              </button>
            </div>
            <div className="ask-note">Answers are grounded in your Clewa data and always cite their source. The briefing above works with AI off.</div>
          </form>
        </div>
      </div>
    </section>
  )
}
