import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { toast } from './toast'

export type Quote = {
  id: string
  source: 'brand' | 'factory'
  quantity: number | null
  unit_price: number
  currency: string
  lead_time_days: number | null
  notes: string | null
  status: 'open' | 'accepted' | 'declined'
  created_at: string
}

/**
 * Negotiation history. The factory submits quotes from their link; the brand
 * records quotes received elsewhere. Accepting one writes the price to the
 * Record (brand-signed, awaiting factory countersignature) and updates the order.
 */
export default function Quotes(props:
  | { mode: 'brand'; orderId: string; owner: string; onAccepted?: () => void }
  | { mode: 'factory'; token: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ quantity: '', unit_price: '', currency: 'USD', lead: '', notes: '' })

  async function load() {
    if (props.mode === 'brand') {
      const { data } = await supabase.from('quotes').select('*')
        .eq('order_id', props.orderId).order('created_at')
      setQuotes((data as Quote[]) || [])
    } else {
      const { data } = await supabase.rpc('factory_get_quotes', { p_token: props.token })
      setQuotes((data as Quote[]) || [])
    }
  }

  useEffect(() => {
    load()
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 8000)
    return () => clearInterval(tick)
  }, [props.mode === 'brand' ? props.orderId : props.token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const price = parseFloat(form.unit_price)
    if (!Number.isFinite(price) || price <= 0) return
    setBusy('new')
    const qty = parseInt(form.quantity, 10)
    const lead = parseInt(form.lead, 10)
    if (props.mode === 'brand') {
      await supabase.from('quotes').insert({
        order_id: props.orderId, owner: props.owner, source: 'brand',
        quantity: Number.isFinite(qty) ? qty : null, unit_price: price,
        currency: form.currency, lead_time_days: Number.isFinite(lead) ? lead : null,
        notes: form.notes.trim() || null,
      })
    } else {
      await supabase.rpc('factory_submit_quote', {
        p_token: props.token, p_quantity: Number.isFinite(qty) ? qty : null,
        p_unit_price: price, p_currency: form.currency,
        p_lead_time_days: Number.isFinite(lead) ? lead : null, p_notes: form.notes,
      })
    }
    setForm({ quantity: '', unit_price: '', currency: form.currency, lead: '', notes: '' })
    setBusy(null)
    load()
  }

  async function decide(q: Quote, status: 'accepted' | 'declined') {
    if (props.mode !== 'brand') return
    setBusy(q.id)
    await supabase.from('quotes').update({ status }).eq('id', q.id)
    if (status === 'accepted') {
      // The accepted quote becomes commercial reality: order fields + the Record.
      // FX snapshot: lock the ECB rate at the moment of agreement (frankfurter.app,
      // public, no key). Failure is silent — FX is a bonus, never a blocker.
      let fx: { fx_rate: number; fx_base: string; fx_captured_at: string } | {} = {}
      if (q.currency !== 'USD') {
        try {
          const r = await fetch(`https://api.frankfurter.app/latest?from=${q.currency}&to=USD`)
          const d = await r.json()
          if (d?.rates?.USD) fx = { fx_rate: d.rates.USD, fx_base: q.currency, fx_captured_at: new Date().toISOString() }
        } catch { /* offline or blocked — skip */ }
      }
      await supabase.from('orders').update({
        unit_price: q.unit_price, currency: q.currency,
        ...(q.quantity ? { quantity: q.quantity } : {}),
        ...fx,
      }).eq('id', props.orderId)
      await supabase.from('record_lines').insert({
        order_id: props.orderId, owner: props.owner, category: 'price',
        content: `Agreed price: ${q.currency} ${Number(q.unit_price).toFixed(2)}/unit${q.quantity ? ` × ${q.quantity.toLocaleString()} units` : ''}${q.lead_time_days ? ` · ${q.lead_time_days}-day lead time` : ''}`,
        brand_signed_at: new Date().toISOString(),
      })
      toast('Quote accepted — price written to the record')
      props.onAccepted?.()
    }
    setBusy(null)
    load()
  }

  return (
    <div>
      {quotes.length === 0 && (
        <p className="quiet">
          {props.mode === 'brand'
            ? 'No quotes yet. Your factory can submit one from their link, or record one you received by email or WhatsApp.'
            : 'No quotes yet — submit yours below. The brand sees it instantly.'}
        </p>
      )}
      {quotes.map(q => (
        <div className={`quote-row ${q.status}`} key={q.id}>
          <div>
            <strong className="quote-price">{q.currency} {Number(q.unit_price).toFixed(2)}<span>/unit</span></strong>
            <span className="quote-meta">
              {q.source === 'factory' ? 'from factory' : 'recorded by brand'}
              {q.quantity ? ` · ${q.quantity.toLocaleString()} units` : ''}
              {q.lead_time_days ? ` · ${q.lead_time_days}d lead` : ''}
              {` · ${q.created_at.slice(0, 10)}`}
            </span>
            {q.notes && <span className="quote-notes">{q.notes}</span>}
          </div>
          {q.status === 'open' && props.mode === 'brand' ? (
            <span className="quote-actions">
              <button className="btn primary small" disabled={busy === q.id} onClick={() => decide(q, 'accepted')}>Accept → record</button>
              <button className="btn ghost small" disabled={busy === q.id} onClick={() => decide(q, 'declined')}>Decline</button>
            </span>
          ) : (
            <span className={`sample-status ${q.status === 'accepted' ? 'approved' : q.status === 'declined' ? 'changes' : ''}`}>{q.status}</span>
          )}
        </div>
      ))}
      <form className="quote-form" onSubmit={submit}>
        <input placeholder="Qty" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} style={{ width: 70 }} />
        <input placeholder="Unit price" required value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} style={{ width: 90 }} />
        <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
          {['USD', 'EUR', 'GBP', 'VND', 'CNY', 'TRY'].map(c => <option key={c}>{c}</option>)}
        </select>
        <input placeholder="Lead (days)" value={form.lead} onChange={e => setForm({ ...form, lead: e.target.value })} style={{ width: 90 }} />
        <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button className="btn ghost small" type="submit" disabled={busy === 'new'}>
          {props.mode === 'factory' ? 'Submit quote' : 'Record quote'}
        </button>
      </form>
    </div>
  )
}
