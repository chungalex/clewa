import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order } from '../supabase'
import { downloadCsv } from '../csv'

type Product = { id: string; name: string; sku: string | null; on_hand: number; weekly_sales: number; safety_stock: number; order_id: string | null }
type Component = { id: string; name: string; unit: string; on_hand: number; on_order: number; location: string | null }
type Bom = { id: string; order_id: string; component_id: string; qty_per_unit: number }
type Report = { id: string; order_id: string; units: number; source: string; reported_by: string | null; note: string | null; stage?: string; created_at: string }

export default function Inventory() {
  const [owner, setOwner] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [ready, setReady] = useState(false)
  const [pForm, setPForm] = useState({ name: '', sku: '', on_hand: '', weekly_sales: '', safety_stock: '' })
  const [cForm, setCForm] = useState({ name: '', unit: 'pcs', on_hand: '', location: '' })
  const [bomForm, setBomForm] = useState({ order_id: '', component_id: '', qty: '' })

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    setOwner(userData.user.id)
    const [p, c, b, o, r] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('components').select('*').order('name'),
      supabase.from('boms').select('*'),
      supabase.from('orders').select('*').is('archived_at', null),
      supabase.from('production_reports').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setProducts((p.data as Product[]) || [])
    setComponents((c.data as Component[]) || [])
    setBoms((b.data as Bom[]) || [])
    setOrders((o.data as Order[]) || [])
    setReports((r.data as Report[]) || [])
    setReady(true)
  }
  useEffect(() => {
    load()
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => clearInterval(tick)
  }, [])

  async function addProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!pForm.name.trim()) return
    await supabase.from('products').insert({
      owner, name: pForm.name.trim(), sku: pForm.sku.trim() || null,
      on_hand: parseInt(pForm.on_hand, 10) || 0,
      weekly_sales: parseFloat(pForm.weekly_sales) || 0,
      safety_stock: parseInt(pForm.safety_stock, 10) || 0,
    })
    setPForm({ name: '', sku: '', on_hand: '', weekly_sales: '', safety_stock: '' })
    load()
  }

  async function addComponent(e: React.FormEvent) {
    e.preventDefault()
    if (!cForm.name.trim()) return
    await supabase.from('components').insert({
      owner, name: cForm.name.trim(), unit: cForm.unit,
      on_hand: parseFloat(cForm.on_hand) || 0, location: cForm.location.trim() || null,
    })
    setCForm({ name: '', unit: 'pcs', on_hand: '', location: '' })
    load()
  }

  async function addBom(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseFloat(bomForm.qty)
    if (!bomForm.order_id || !bomForm.component_id || !Number.isFinite(qty) || qty <= 0) return
    await supabase.from('boms').upsert({
      owner, order_id: bomForm.order_id, component_id: bomForm.component_id, qty_per_unit: qty,
    }, { onConflict: 'order_id,component_id' })
    setBomForm({ order_id: '', component_id: '', qty: '' })
    load()
  }

  if (!ready) return null

  const activeOrders = orders.filter(o => !['delivered', 'closed'].includes(o.stage))
  const producedByOrder = new Map<string, number>()
  for (const r of reports) producedByOrder.set(r.order_id, (producedByOrder.get(r.order_id) || 0) + r.units)

  // Allocation: remaining units of each active order × its BOM lines.
  const allocated = new Map<string, number>()
  for (const b of boms) {
    const o = activeOrders.find(x => x.id === b.order_id)
    if (!o || !o.quantity) continue
    const remaining = Math.max(0, o.quantity - (producedByOrder.get(o.id) || 0))
    allocated.set(b.component_id, (allocated.get(b.component_id) || 0) + remaining * Number(b.qty_per_unit))
  }

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Inventory</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            Finished goods, components, and the recipes that connect them to production.
            Components deduct when units are reported cut.
          </div>
        </div>
        {(products.length > 0 || components.length > 0) && (
          <button className="btn ghost" onClick={() => {
            downloadCsv('clewa-inventory',
              ['type', 'name', 'sku_or_unit', 'on_hand', 'weekly_sales', 'safety_stock', 'location'],
              [
                ...products.map(p2 => ['product', p2.name, p2.sku || '', p2.on_hand, p2.weekly_sales, p2.safety_stock, '']),
                ...components.map(c2 => ['component', c2.name, c2.unit, c2.on_hand, '', '', c2.location || '']),
              ])
          }}>Export CSV</button>
        )}
      </div>

      <div className="section-label">Finished goods</div>
      <div className="card" style={{ padding: 0 }}>
        {products.length === 0 && (
          <p className="quiet" style={{ padding: 18 }}>
            Add your sellable products with rough weekly sales — Clewa computes cover, stockout dates and reorder timing.
            Shopify sync will fill these automatically once connected.
          </p>
        )}
        {products.map(p => {
          const incoming = p.order_id
            ? Math.max(0, (orders.find(o => o.id === p.order_id)?.quantity || 0) - (producedByOrder.get(p.order_id) || 0))
            : 0
          const weeks = p.weekly_sales > 0 ? p.on_hand / p.weekly_sales : null
          const stockout = weeks !== null ? new Date(Date.now() + weeks * 7 * 86400000).toISOString().slice(0, 10) : null
          const low = weeks !== null && p.on_hand - p.safety_stock < p.weekly_sales * 6
          const aging = p.on_hand > 0 && (p.weekly_sales === 0 || (weeks !== null && weeks > 26))
          return (
            <div className="fin-row" key={p.id}>
              <div>
                <strong style={{ fontSize: 14 }}>{p.name}</strong>
                <span className="fin-meta">
                  {p.sku ? `${p.sku} · ` : ''}{p.on_hand.toLocaleString()} on hand
                  {incoming > 0 ? ` · ${incoming.toLocaleString()} incoming` : ''}
                  {p.weekly_sales > 0 ? ` · ~${p.weekly_sales}/week` : ' · no sales velocity set'}
                  {stockout ? ` · stockout ~${stockout}` : ''}
                </span>
              </div>
              {aging
                ? <span className="sample-status" title="No sell-through recorded, or over 26 weeks of cover — capital sitting still">aging stock</span>
                : low
                  ? <span className="sample-status changes">reorder window</span>
                  : <span className="sample-status approved">covered</span>}
            </div>
          )
        })}
        <form onSubmit={addProduct} style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--hair)', flexWrap: 'wrap' }}>
          <input placeholder="Product name" value={pForm.name} onChange={e => setPForm({ ...pForm, name: e.target.value })} style={inp(160)} />
          <input placeholder="SKU" value={pForm.sku} onChange={e => setPForm({ ...pForm, sku: e.target.value })} style={inp(90)} />
          <input placeholder="On hand" value={pForm.on_hand} onChange={e => setPForm({ ...pForm, on_hand: e.target.value })} style={inp(80)} />
          <input placeholder="Sales/week" value={pForm.weekly_sales} onChange={e => setPForm({ ...pForm, weekly_sales: e.target.value })} style={inp(90)} />
          <input placeholder="Safety stock" value={pForm.safety_stock} onChange={e => setPForm({ ...pForm, safety_stock: e.target.value })} style={inp(100)} />
          <button className="btn ghost small" type="submit">Add product</button>
        </form>
      </div>

      <div className="section-label">Components & materials</div>
      <div className="card" style={{ padding: 0 }}>
        {components.length === 0 && (
          <p className="quiet" style={{ padding: 18 }}>
            Buttons, zips, fabric, labels — track what production consumes. Link them to orders below and
            factory progress reports deduct them automatically.
          </p>
        )}
        {components.map(c => {
          const alloc = allocated.get(c.id) || 0
          const free = Number(c.on_hand) - alloc
          const short = free < 0
          return (
            <div className="fin-row" key={c.id}>
              <div>
                <strong style={{ fontSize: 14 }}>{c.name}</strong>
                <span className="fin-meta">
                  {Number(c.on_hand).toLocaleString()} {c.unit} on hand
                  {alloc > 0 ? ` · ${alloc.toLocaleString(undefined, { maximumFractionDigits: 1 })} allocated to open orders` : ''}
                  {c.location ? ` · ${c.location}` : ''}
                </span>
              </div>
              {short
                ? <span className="sample-status changes">{Math.abs(free).toLocaleString(undefined, { maximumFractionDigits: 1 })} {c.unit} short — order now</span>
                : <span className="sample-status approved">{free.toLocaleString(undefined, { maximumFractionDigits: 1 })} {c.unit} free</span>}
            </div>
          )
        })}
        <form onSubmit={addComponent} style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--hair)', flexWrap: 'wrap' }}>
          <input placeholder="Component (e.g. horn button 15mm)" value={cForm.name} onChange={e => setCForm({ ...cForm, name: e.target.value })} style={inp(200)} />
          <select value={cForm.unit} onChange={e => setCForm({ ...cForm, unit: e.target.value })} style={inp(70)}>
            {['pcs', 'm', 'kg', 'rolls', 'sets'].map(u => <option key={u}>{u}</option>)}
          </select>
          <input placeholder="On hand" value={cForm.on_hand} onChange={e => setCForm({ ...cForm, on_hand: e.target.value })} style={inp(80)} />
          <input placeholder="Location" value={cForm.location} onChange={e => setCForm({ ...cForm, location: e.target.value })} style={inp(110)} />
          <button className="btn ghost small" type="submit">Add component</button>
        </form>
      </div>

      <div className="section-label">Recipes (BOM)</div>
      <div className="card">
        {boms.length === 0 && (
          <p className="quiet" style={{ marginBottom: 10 }}>
            "One overcoat = 1.9m wool + 4 buttons + 1 zip." Link components to an order and every factory
            progress report deducts them — this is how a BOM never goes missing.
          </p>
        )}
        {boms.map(b => {
          const o = orders.find(x => x.id === b.order_id)
          const c = components.find(x => x.id === b.component_id)
          if (!o || !c) return null
          return (
            <div className="q-item" key={b.id} style={{ cursor: 'default' }}>
              <strong>{o.name} — {Number(b.qty_per_unit)} {c.unit} of {c.name} per unit</strong>
              <span>{(producedByOrder.get(o.id) || 0).toLocaleString()} units reported → {((producedByOrder.get(o.id) || 0) * Number(b.qty_per_unit)).toLocaleString(undefined, { maximumFractionDigits: 1 })} {c.unit} consumed so far</span>
            </div>
          )
        })}
        <form onSubmit={addBom} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <select value={bomForm.order_id} onChange={e => setBomForm({ ...bomForm, order_id: e.target.value })} style={inp(180)}>
            <option value="">Order…</option>
            {activeOrders.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={bomForm.component_id} onChange={e => setBomForm({ ...bomForm, component_id: e.target.value })} style={inp(180)}>
            <option value="">Component…</option>
            {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Qty per unit" value={bomForm.qty} onChange={e => setBomForm({ ...bomForm, qty: e.target.value })} style={inp(100)} />
          <button className="btn ghost small" type="submit">Link</button>
        </form>
      </div>

      <div className="section-label">Production reports</div>
      <div className="card">
        {reports.length === 0 && (
          <p className="quiet">
            When your factory reports progress from their order link ("120 sewn"), it lands here — and components deduct automatically.
          </p>
        )}
        {reports.map(r => {
          const o = orders.find(x => x.id === r.order_id)
          return (
            <div className="q-item" key={r.id} style={{ cursor: 'default' }}>
              <strong>{r.units.toLocaleString()} {r.stage || 'cut'} — {o ? <Link to={`/orders/${o.id}`}>{o.name}</Link> : 'order'}</strong>
              <span>{r.source === 'factory' ? `reported by ${r.reported_by || 'factory'}` : 'recorded by you'} · {r.created_at.slice(0, 10)}{r.note ? ` · ${r.note}` : ''}</span>
            </div>
          )
        })}
      </div>

      <p className="quiet" style={{ marginTop: 14, fontSize: 12.5 }}>
        Shopify sync (sell-through in, incoming production out, automatic reorder recommendations) is the next
        milestone — everything above is built to receive it.
      </p>
    </>
  )
}

function inp(w: number): React.CSSProperties {
  return { width: w, padding: '8px 10px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13, background: 'var(--paper)' }
}
