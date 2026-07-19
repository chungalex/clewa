import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, STAGE_LABELS } from '../supabase'
import Messages from '../Messages'
import Samples from '../Samples'
import Qc from '../Qc'
import Quotes from '../Quotes'

type FactoryLine = {
  id: string
  category: 'spec' | 'price' | 'terms'
  content: string
  brand_signed_at: string | null
  factory_signed_at: string | null
  superseded_by?: string | null
}

type FactoryOrder = {
  brand: string
  accepted_at: string | null
  accepted_by_name: string | null
  order: {
    name: string
    quantity: number | null
    unit_price: number | null
    currency: string
    stage: keyof typeof STAGE_LABELS
    ship_by: string | null
  }
  lines: FactoryLine[]
}

export default function FactoryView() {
  const { token } = useParams()
  const [data, setData] = useState<FactoryOrder | null>(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [named, setNamed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const { data: d, error } = await supabase.rpc('factory_get_order', { p_token: token })
    if (error || !d) { setMissing(true); return }
    const fo = d as FactoryOrder
    setData(fo)
    if (fo.accepted_by_name) { setName(fo.accepted_by_name); setNamed(true) }
  }

  useEffect(() => { load() }, [token])

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await supabase.rpc('factory_accept', { p_token: token, p_name: name.trim() })
    setNamed(true)
    load()
  }

  async function confirmLine(id: string) {
    setBusy(id)
    await supabase.rpc('factory_confirm_line', { p_token: token, p_line: id })
    setBusy(null)
    load()
  }

  if (missing) {
    return (
      <div className="fv-wrap">
        <div className="fv-card" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>This link isn't active</h1>
          <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>
            Ask the brand to send you a fresh invitation link.
          </p>
        </div>
      </div>
    )
  }

  if (!data) return null
  const o = data.order
  const activeLines = data.lines.filter(l => !l.superseded_by)
  const supersededLines = data.lines.filter(l => l.superseded_by)
  const pending = activeLines.filter(l => !l.factory_signed_at)

  return (
    <div className="fv-wrap">
      <header className="fv-head">
        <span className="fv-brandmark">Cle<em>w</em>a</span>
        <span className="fv-sub">Shared order · you see exactly what {data.brand} sees</span>
      </header>

      <div className="fv-card">
        <div className="fv-order-head">
          <div>
            <h1>{o.name}</h1>
            <div className="fv-meta">
              {data.brand}
              {o.quantity ? ` · ${o.quantity.toLocaleString()} units` : ''}
              {o.unit_price ? ` · ${o.currency} ${Number(o.unit_price).toFixed(2)}/unit` : ''}
              {o.ship_by ? ` · ship by ${o.ship_by}` : ''}
            </div>
          </div>
          <span className="stage-pill">{STAGE_LABELS[o.stage]}</span>
        </div>

        {!named && (
          <form className="fv-name" onSubmit={saveName}>
            <label>Confirming on behalf of the factory — your name</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Marco Da Silva" />
              <button className="btn primary small" type="submit" disabled={!name.trim()}>That's me</button>
            </div>
          </form>
        )}

        <div className="section-label" style={{ marginTop: 22 }}>
          The record — {activeLines.length} {activeLines.length === 1 ? 'line' : 'lines'}, {pending.length} awaiting your confirmation
        </div>
        {activeLines.map(l => (
          <div className="rec-line" key={l.id}>
            <span className="rec-cat">{l.category}</span>
            <span className="rec-content">{l.content}</span>
            {l.factory_signed_at ? (
              <span className="rec-sign">✓ confirmed {l.factory_signed_at.slice(0, 10)}</span>
            ) : (
              <button
                className="btn primary small"
                disabled={!named || busy === l.id}
                title={named ? '' : 'Add your name above first'}
                onClick={() => confirmLine(l.id)}
              >
                {busy === l.id ? '…' : 'Confirm'}
              </button>
            )}
          </div>
        ))}
        {activeLines.length === 0 && (
          <p style={{ color: 'var(--ink-3)' }}>The brand hasn't put anything on the record yet.</p>
        )}
        {supersededLines.length > 0 && (
          <p className="quiet" style={{ marginTop: 10, fontSize: 12 }}>
            {supersededLines.length} earlier line{supersededLines.length === 1 ? ' was' : 's were'} revised by the brand — the versions above are current. Your earlier confirmations on old versions stay on file.
          </p>
        )}

        {pending.length === 0 && activeLines.length > 0 && (
          <p className="fv-done">Every line is confirmed by both sides. This is the agreement of record.</p>
        )}

        <div className="section-label" style={{ marginTop: 22 }}>Quotes</div>
        <Quotes mode="factory" token={token!} />

        <div className="section-label" style={{ marginTop: 22 }}>Samples</div>
        <Samples mode="factory" token={token!} />

        <div className="section-label" style={{ marginTop: 22 }}>Quality control</div>
        <p className="quiet" style={{ fontSize: 12, marginBottom: 8 }}>
          You and {data.brand} inspect the same checklist — record your verdict per item.
        </p>
        <Qc mode="factory" token={token!} />

        <div className="section-label" style={{ marginTop: 22 }}>Messages with {data.brand}</div>
        <Messages mode="factory" token={token!} senderName={name} />
      </div>

      <footer className="fv-foot">
        Confirmations are dated and permanent — both sides keep the receipts. Powered by Clewa.
      </footer>
    </div>
  )
}
