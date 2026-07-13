import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, Order, RecordLine, STAGES, STAGE_LABELS } from '../supabase'

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [lines, setLines] = useState<RecordLine[]>([])
  const [newLine, setNewLine] = useState('')
  const [newCat, setNewCat] = useState<'spec' | 'price' | 'terms'>('spec')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: o }, { data: l }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('record_lines').select('*').eq('order_id', id).order('created_at'),
    ])
    setOrder(o as Order)
    setLines((l as RecordLine[]) || [])
  }

  useEffect(() => { load() }, [id])

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    if (!newLine.trim() || !order) return
    setBusy(true)
    await supabase.from('record_lines').insert({
      order_id: order.id,
      owner: order.owner,
      category: newCat,
      content: newLine.trim(),
      brand_signed_at: new Date().toISOString(),
    })
    setNewLine('')
    setBusy(false)
    load()
  }

  async function setStage(stage: Order['stage']) {
    if (!order) return
    await supabase.from('orders').update({ stage }).eq('id', order.id)
    load()
  }

  if (!order) return null
  const stageIdx = STAGES.indexOf(order.stage)

  return (
    <>
      <div className="main-head">
        <div>
          <Link to="/" style={{ fontSize: 12, color: 'var(--ink-3)' }}>← Orders</Link>
          <h1 style={{ marginTop: 4 }}>{order.name}</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 2 }}>
            {order.quantity ? `${order.quantity.toLocaleString()} units` : 'Quantity TBD'}
            {order.factory_name ? ` · ${order.factory_name}` : ''}
            {order.factory_country ? `, ${order.factory_country}` : ''}
          </div>
        </div>
        <span className={`stage-pill ${order.stage}`}>{STAGE_LABELS[order.stage]}</span>
      </div>

      <div className="section-label">Stage</div>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {STAGES.map((s, i) => (
          <button
            key={s}
            className={`btn small ${i === stageIdx ? 'primary' : 'ghost'}`}
            onClick={() => setStage(s)}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="section-label">The Record</div>
      <div className="card">
        {lines.length === 0 && (
          <p style={{ color: 'var(--ink-3)', paddingBottom: 12 }}>
            Nothing on the record yet. Every spec, price and term you add here is dated and signed — if the bulk arrives wrong, it's not a he-said-she-said.
          </p>
        )}
        {lines.map(l => (
          <div className="rec-line" key={l.id}>
            <span className="rec-cat">{l.category}</span>
            <span className="rec-content">{l.content}</span>
            <span className={`rec-sign ${l.factory_signed_at ? '' : 'pending'}`}>
              {l.factory_signed_at ? '✓ both signed' : `you signed ${l.brand_signed_at?.slice(0, 10)} · awaiting factory`}
            </span>
          </div>
        ))}
        <form onSubmit={addLine} style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <select value={newCat} onChange={e => setNewCat(e.target.value as any)} style={{ padding: '9px 10px', border: '1px solid var(--hair-2)', borderRadius: 9, background: 'var(--paper)' }}>
            <option value="spec">Spec</option>
            <option value="price">Price</option>
            <option value="terms">Terms</option>
          </select>
          <input
            value={newLine}
            onChange={e => setNewLine(e.target.value)}
            placeholder="e.g. 420gsm wool twill, colour 19-4008 TCX"
            style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--hair-2)', borderRadius: 9 }}
          />
          <button className="btn primary small" type="submit" disabled={busy || !newLine.trim()}>Add to record</button>
        </form>
      </div>
    </>
  )
}
