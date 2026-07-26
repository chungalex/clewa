import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import '../parity/settings.css'

export default function NewOrder() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [factory, setFactory] = useState('')
  const [country, setCountry] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [shipBy, setShipBy] = useState('')
  const [situation, setSituation] = useState<string | null>(null)
  const [brandName, setBrandName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('factory_situation, brand_name').eq('id', data.user.id).single()
        .then(({ data: p }) => {
          setSituation(p?.factory_situation || null)
          setBrandName(p?.brand_name || '')
        })
    })
  }, [])

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

  const factoryHint =
    situation === 'no_factory'
      ? "You don't have a factory yet — that's fine. The record you build here becomes your brief when you approach one."
      : situation === 'in_talks'
        ? 'Still choosing? Leave the factory blank — you can attach one the moment you decide.'
        : 'You can invite your factory right after this — they confirm your terms line by line.'

  // Live preview math — computed from what's actually typed, nothing invented.
  const qtyN = qty ? parseInt(qty, 10) : 0
  const priceN = price ? parseFloat(price) : 0
  const total = qtyN > 0 && priceN > 0 ? qtyN * priceN : 0
  const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const priceLine = price ? `Unit price ${currency} ${price}${qty ? ` × ${qty} units` : ''}` : ''
  const shipLine = shipBy ? `Ship by ${shipBy}` : ''

  return (
    <section className="page on" data-page="neworder">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">New order</h2>
            <div className="pg-sub">Start with a name — everything you add here goes straight onto the record, signed by you.</div>
          </div>
        </div>

        <div className="po-wrap">
          <form className="po-form" onSubmit={submit}>
            <div className="pf-h">Order details</div>
            <div className="po-fields">
              <div className="po-field">
                <label htmlFor="name">What are you making?</label>
                <input id="name" required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Wool Overcoat — FW26" />
                <p className="field-hint">Just the product and season — this is the only thing you need to start.</p>
              </div>
              <div className="po-field">
                <label htmlFor="qty">Roughly how many units? <span className="opt">optional</span></label>
                <input id="qty" type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="320" />
              </div>

              {!showDetails ? (
                <button type="button" className="details-toggle" onClick={() => setShowDetails(true)}>
                  + Add factory & commercial terms <span className="opt">optional — most brands add these as they're negotiated</span>
                </button>
              ) : (
                <div className="details-block">
                  <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>{factoryHint}</p>
                  <div className="po-two">
                    <div className="po-field">
                      <label htmlFor="factory">Factory</label>
                      <input id="factory" value={factory} onChange={e => setFactory(e.target.value)} placeholder="Atelier Norte" />
                    </div>
                    <div className="po-field">
                      <label htmlFor="country">Country</label>
                      <input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="Portugal" />
                    </div>
                  </div>
                  <div className="po-two">
                    <div className="po-field">
                      <label htmlFor="price">Agreed unit price</label>
                      <input id="price" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="59.00" />
                    </div>
                    <div className="po-field">
                      <label htmlFor="currency">Currency</label>
                      <select id="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
                        {['USD', 'EUR', 'GBP', 'VND', 'CNY', 'TRY'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="po-field">
                    <label htmlFor="shipby">Ship-by date</label>
                    <input id="shipby" type="date" value={shipBy} onChange={e => setShipBy(e.target.value)} />
                    <p className="field-hint">Anything you fill in here goes straight onto the record, signed by you, awaiting your factory's confirmation.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="pf-foot">
              <button className="hx-newbtn" type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Create order →'}
              </button>
              {error && <p className="err-note" style={{ marginTop: 0 }}>{error}</p>}
            </div>
          </form>

          <div className="po-doc">
            <div className="po-doc-inner">
              <div className="pod-top">
                <div>
                  <div className="pod-brand">{brandName || 'Your brand'}</div>
                  <div className="pod-co">Order record — starts the moment you create it</div>
                </div>
                <div className="pod-po">
                  <div className="pp-lab">Order</div>
                  <div className="pp-num">Draft</div>
                  <div className="pp-date">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
              <div className="pod-parties">
                <div className="pod-party">
                  <div className="pd-lab">From</div>
                  <div className="pd-name">{brandName || 'Your brand'}</div>
                  <div className="pd-line">Signs the record at creation</div>
                </div>
                <div className="pod-party">
                  <div className="pd-lab">To</div>
                  <div className="pd-name">{factory || 'No factory yet'}</div>
                  <div className="pd-line">
                    {factory
                      ? `${country ? `${country} · ` : ''}countersigns from their invite link — no account needed`
                      : 'Attach one any time — the record becomes your brief'}
                  </div>
                </div>
              </div>
              <table className="pod-table">
                <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Unit</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  <tr>
                    <td>
                      {name || 'Untitled order'}
                      <div className="td-sub">specs, materials and terms join the record as they're agreed</div>
                    </td>
                    <td className="r">{qtyN > 0 ? qtyN.toLocaleString() : '—'}</td>
                    <td className="r pod-money">{priceN > 0 ? money(priceN) : '—'}</td>
                    <td className="r pod-money">{total > 0 ? money(total) : '—'}</td>
                  </tr>
                </tbody>
              </table>
              {total > 0 && (
                <div className="pod-totals"><div className="pod-totals-in">
                  <div className="pod-trow grand"><span>Total</span><span>{money(total)}</span></div>
                </div></div>
              )}
              <div className="pod-terms">
                {priceLine || shipLine ? (
                  <>
                    {priceLine && <div className="pod-term"><div className="pt-lab">Record line — price</div><div className="pt-val">{priceLine}</div></div>}
                    {shipLine && <div className="pod-term"><div className="pt-lab">Record line — terms</div><div className="pt-val">{shipLine}</div></div>}
                  </>
                ) : (
                  <div className="pod-term" style={{ gridColumn: '1 / -1' }}>
                    <div className="pt-lab">Record lines</div>
                    <div className="pt-val quiet" style={{ fontSize: 13 }}>None yet — add a price or ship-by date and it lands on the record, signed by you.</div>
                  </div>
                )}
              </div>
              <div className="pod-sign">
                <div className="ps-line">{brandName || 'You'} — signed at creation</div>
                <div className="ps-line">{factory || 'Factory'} — countersigns from their link</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
