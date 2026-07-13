import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function NewOrder() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [factory, setFactory] = useState('')
  const [country, setCountry] = useState('')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [shipBy, setShipBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    const owner = userData.user?.id
    if (!owner) { setError('Session expired — sign in again.'); setBusy(false); return }

    const { data, error } = await supabase.from('orders').insert({
      owner,
      name,
      factory_name: factory || null,
      factory_country: country || null,
      quantity: qty ? parseInt(qty, 10) : null,
      unit_price: price ? parseFloat(price) : null,
      currency,
      ship_by: shipBy || null,
    }).select().single()

    if (error || !data) { setError(error?.message || 'Could not create the order.'); setBusy(false); return }

    // seed the Record with whatever is known at creation — signed by the brand now,
    // awaiting factory counter-signature when they join
    const now = new Date().toISOString()
    const lines = []
    if (price) lines.push({ order_id: data.id, owner, category: 'price', content: `Unit price ${currency} ${price}${qty ? ` × ${qty} units` : ''}`, brand_signed_at: now })
    if (shipBy) lines.push({ order_id: data.id, owner, category: 'terms', content: `Ship by ${shipBy}`, brand_signed_at: now })
    if (lines.length) await supabase.from('record_lines').insert(lines)

    nav(`/orders/${data.id}`)
  }

  return (
    <>
      <div className="main-head"><h1>New order</h1></div>
      <div className="card" style={{ maxWidth: 560 }}>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">What are you making?</label>
            <input id="name" required value={name} onChange={e => setName(e.target.value)} placeholder="Wool Overcoat — FW26" />
          </div>
          <div className="field">
            <label htmlFor="factory">Factory (leave blank if you don't have one yet)</label>
            <input id="factory" value={factory} onChange={e => setFactory(e.target.value)} placeholder="Atelier Norte" />
          </div>
          <div className="field">
            <label htmlFor="country">Factory country</label>
            <input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="Portugal" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field">
              <label htmlFor="qty">Quantity</label>
              <input id="qty" type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="320" />
            </div>
            <div className="field">
              <label htmlFor="price">Unit price</label>
              <input id="price" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="59.00" />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select id="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
                {['USD', 'EUR', 'GBP', 'VND', 'CNY', 'TRY'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="shipby">Ship-by date</label>
            <input id="shipby" type="date" value={shipBy} onChange={e => setShipBy(e.target.value)} />
          </div>
          <button className="btn gold" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create order →'}
          </button>
          {error && <p className="err-note">{error}</p>}
        </form>
      </div>
    </>
  )
}
