import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SUPABASE_URL, SUPABASE_KEY, Order, RecordLine, STAGES } from '../supabase'
import { QcCheck } from '../Qc'

type Sample = { order_id: string; round: number; kind: string; status: string }
type Quote = { order_id: string; unit_price: number; currency: string; status: string }
type Insight = { severity: 'urgent' | 'week' | 'clean'; text: string; why: string; to?: string }

/**
 * The intelligence layer. Everything below the Ask box is computed directly
 * from the user's data — it works with AI off, exactly as promised. Ask Clewa
 * adds language on top when the provider key is configured.
 */
export default function Intelligence() {
  const [orders, setOrders] = useState<Order[]>([])
  const [lines, setLines] = useState<RecordLine[]>([])
  const [samples, setSamples] = useState<Sample[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [qc, setQc] = useState<(QcCheck & { order_id: string })[]>([])
  const [ready, setReady] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [askState, setAskState] = useState<'idle' | 'busy' | 'setup'>('idle')

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*'),
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

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || askState === 'busy') return
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
        body: JSON.stringify({ question: question.trim() }),
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

  if (!ready) return null

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
    // Anomaly: order price vs accepted quote.
    const accepted = quotes.find(q => q.order_id === o.id && q.status === 'accepted')
    if (accepted && o.unit_price && Math.abs(Number(o.unit_price) - Number(accepted.unit_price)) > 0.005) {
      insights.push({
        severity: 'urgent',
        text: `Price anomaly on ${o.name}: order says ${o.currency} ${Number(o.unit_price).toFixed(2)}, accepted quote was ${accepted.currency} ${Number(accepted.unit_price).toFixed(2)}`,
        why: 'The agreed number and the working number differ — check before any invoice is paid.',
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

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Intelligence</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            Everything here is computed from your own orders, records and checklists — it cites its sources,
            and the system of record works with AI off.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Ask Clewa</div>
        <form onSubmit={ask} style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <input
            value={question} onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. What's putting the September ship date at risk?"
            style={{ flex: 1, padding: '10px 13px', border: '1px solid var(--hair-2)', borderRadius: 999, background: 'var(--paper)' }}
          />
          <button className="btn primary small" style={{ borderRadius: 999 }} disabled={askState === 'busy' || !question.trim()}>
            {askState === 'busy' ? 'Thinking…' : 'Ask'}
          </button>
        </form>
        {askState === 'setup' && (
          <p className="quiet" style={{ marginTop: 10, fontSize: 12.5 }}>
            Ask Clewa is deployed but needs the <code>ANTHROPIC_API_KEY</code> secret configured in Supabase.
            The briefing below works without it.
          </p>
        )}
        {answer && <p style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer}</p>}
      </div>

      <div className="focus-band" style={{ display: 'block' }}>
        <div className="eyebrow">Morning briefing</div>
        {urgent.length === 0 && week.length === 0 && (
          <p style={{ marginTop: 10 }}>Nothing urgent. {clean.length > 0 ? `${clean.length} order${clean.length === 1 ? '' : 's'} running clean.` : 'Create an order to start the briefing.'}</p>
        )}
        {urgent.map((i, idx) => (
          <div className="brief-item urgent" key={idx}>
            <strong><Link to={i.to || '#'} style={{ color: 'var(--gold-light)' }}>{i.text}</Link></strong>
            <span>{i.why}</span>
          </div>
        ))}
        {week.map((i, idx) => (
          <div className="brief-item" key={idx}>
            <strong><Link to={i.to || '#'} style={{ color: 'var(--on-dark)' }}>{i.text}</Link></strong>
            <span>{i.why}</span>
          </div>
        ))}
        {clean.length > 0 && (
          <p style={{ marginTop: 14, color: 'var(--on-dark-2)', fontSize: 12.5 }}>
            Running clean: {clean.map(c => c.text.replace(' is running clean', '')).join(' · ')}
          </p>
        )}
      </div>

      <p className="quiet" style={{ marginTop: 16, fontSize: 12.5 }}>
        Coming with more history: pattern detection (sample-round averages per factory, spec-lock timing,
        size-curve bias) — these need a few seasons of data to be honest.
      </p>
    </>
  )
}
