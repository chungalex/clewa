import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type Event = { at: string; who: 'you' | 'them' | 'system'; text: string }

/** The order's paper trail, assembled from every table — nothing is separately logged, so nothing can be forgotten. */
export default function Activity({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    async function build() {
      const [lines, samples, quotes, reports, msgs, invites] = await Promise.all([
        supabase.from('record_lines').select('category, content, brand_signed_at, factory_signed_at, created_at, superseded_by').eq('order_id', orderId),
        supabase.from('samples').select('round, kind, status, decided_at, created_at').eq('order_id', orderId),
        supabase.from('quotes').select('source, unit_price, currency, status, created_at').eq('order_id', orderId),
        supabase.from('production_reports').select('units, source, reported_by, created_at').eq('order_id', orderId),
        supabase.from('order_messages').select('sender, sender_name, created_at').eq('order_id', orderId),
        supabase.from('order_invites').select('accepted_at, accepted_by_name, revoked_at, created_at').eq('order_id', orderId),
      ])
      const ev: Event[] = []
      for (const l of lines.data || []) {
        ev.push({ at: l.created_at, who: 'you', text: `Added to the record (${l.category}): ${String(l.content).slice(0, 70)}${String(l.content).length > 70 ? '…' : ''}` })
        if (l.factory_signed_at) ev.push({ at: l.factory_signed_at, who: 'them', text: `Factory countersigned: ${String(l.content).slice(0, 60)}${String(l.content).length > 60 ? '…' : ''}` })
        if (l.superseded_by) ev.push({ at: l.created_at, who: 'system', text: 'A record line was later revised (history preserved)' })
      }
      for (const s of samples.data || []) {
        ev.push({ at: s.created_at, who: 'you', text: `Requested ${s.kind} sample, round ${s.round}` })
        if (s.decided_at) ev.push({ at: s.decided_at, who: 'you', text: `Sample round ${s.round}: ${s.status === 'approved' ? 'approved' : 'changes requested'}` })
      }
      for (const q of quotes.data || []) {
        ev.push({ at: q.created_at, who: q.source === 'factory' ? 'them' : 'you', text: `Quote ${q.source === 'factory' ? 'received' : 'recorded'}: ${q.currency} ${Number(q.unit_price).toFixed(2)}/unit${q.status !== 'open' ? ` (${q.status})` : ''}` })
      }
      for (const r of reports.data || []) {
        ev.push({ at: r.created_at, who: r.source === 'factory' ? 'them' : 'you', text: `Production report: ${r.units.toLocaleString()} units${r.reported_by ? ` (${r.reported_by})` : ''}` })
      }
      for (const m of msgs.data || []) {
        ev.push({ at: m.created_at, who: m.sender === 'brand' ? 'you' : 'them', text: `Message from ${m.sender === 'brand' ? 'you' : m.sender_name || 'factory'}` })
      }
      for (const i of invites.data || []) {
        ev.push({ at: i.created_at, who: 'you', text: 'Factory invite created' })
        if (i.accepted_at) ev.push({ at: i.accepted_at, who: 'them', text: `${i.accepted_by_name || 'Factory'} opened the shared order` })
        if (i.revoked_at) ev.push({ at: i.revoked_at, who: 'you', text: 'Invite revoked' })
      }
      ev.sort((a, b) => (a.at < b.at ? 1 : -1))
      setEvents(ev)
    }
    build()
  }, [orderId])

  if (events === null) return null
  const shown = expanded ? events : events.slice(0, 8)

  return (
    <div>
      {events.length === 0 && <p className="quiet">Activity appears here as the order moves.</p>}
      {shown.map((e, i) => (
        <div className="act-row" key={i}>
          <span className={`act-dot ${e.who}`} />
          <span className="act-text">{e.text}</span>
          <span className="act-at">{new Date(e.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      ))}
      {events.length > 8 && (
        <p style={{ marginTop: 8 }}>
          <a href="#" onClick={e => { e.preventDefault(); setExpanded(!expanded) }} style={{ fontSize: 12.5 }}>
            {expanded ? 'Show recent only' : `Show all ${events.length} events`}
          </a>
        </p>
      )}
    </div>
  )
}
