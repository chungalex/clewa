import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, Order } from '../supabase'
import { downloadCsv } from '../csv'
import { toast } from '../toast'
import '../parity/inventory.css'

type Product = { id: string; name: string; sku: string | null; on_hand: number; weekly_sales: number; safety_stock: number; order_id: string | null; sizes: Record<string, number> | null }
type Component = { id: string; name: string; unit: string; on_hand: number; on_order: number; location: string | null }
type Bom = { id: string; order_id: string; component_id: string; qty_per_unit: number }
type Report = { id: string; order_id: string; units: number; source: string; reported_by: string | null; note: string | null; stage?: string; created_at: string }

/* ---------- the intelligent grid: schema types ---------- */
type GridRow = { id: string; name: string; sub: string; unit: string; vals: Record<string, number> }
type GridCol = {
  key: string
  label: string
  type: 'text' | 'num' | 'link' | 'calc' | 'status'
  field?: string          // db column, for editable cells
  decimals?: number       // rounding on commit
  tip?: string
  calc?: (r: GridRow) => number
  fmt?: (v: number, r: GridRow) => string
  pre?: string[]
  formula?: string
  plain?: string
  stat?: (r: GridRow) => { t: string; c: string }
}

const nf = (n: number, unit?: string) => {
  if (!Number.isFinite(n)) return '∞'
  const s = Math.abs(n) < 100 && !Number.isInteger(n)
    ? (Math.round(n * 10) / 10).toLocaleString()
    : Math.round(n).toLocaleString()
  return unit ? `${s} ${unit}` : s
}

const WIP_STAGES: [string, string][] = [['cut', 'Cut'], ['sewn', 'Sewn'], ['finished', 'Finished'], ['packed', 'Packed']]
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']

const ExportIcon = () => (
  <span className="xb-ic">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM10 4v16M4 10h16" /></svg>
  </span>
)

export default function Inventory() {
  const nav = useNavigate()
  const [owner, setOwner] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [ready, setReady] = useState(false)
  const [pForm, setPForm] = useState({ name: '', sku: '', on_hand: '', weekly_sales: '', safety_stock: '' })
  const [sizeEdit, setSizeEdit] = useState<string | null>(null)
  const [sizeDraft, setSizeDraft] = useState('')
  const [cForm, setCForm] = useState({ name: '', unit: 'pcs', on_hand: '', location: '' })
  const [bomForm, setBomForm] = useState({ order_id: '', component_id: '', qty: '' })

  // grid state
  const [view, setView] = useState<'grid' | 'overview'>('grid')
  const [ds, setDs] = useState<'finished' | 'components'>('finished')
  const [sel, setSel] = useState({ r: 0, c: 1 })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 })

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    setOwner(userData.user.id)
    const [p, c, b, o, r] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('components').select('*').order('name'),
      supabase.from('boms').select('*'),
      supabase.from('orders').select('*').is('archived_at', null),
      supabase.from('production_reports').select('*').order('created_at', { ascending: false }).limit(200),
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

  if (!ready) return <Loading />

  /* ---------- derived, all from real data ---------- */
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

  const incomingFor = (p: Product) => p.order_id
    ? Math.max(0, (orders.find(o => o.id === p.order_id)?.quantity || 0) - (producedByOrder.get(p.order_id) || 0))
    : 0

  const productStatus = (p: Product) => {
    const incoming = incomingFor(p)
    const weeks = p.weekly_sales > 0 ? p.on_hand / p.weekly_sales : null
    const low = weeks !== null && p.on_hand - p.safety_stock < p.weekly_sales * 6
    const aging = p.on_hand > 0 && (p.weekly_sales === 0 || (weeks !== null && weeks > 26))
    if (p.on_hand <= 0 && incoming > 0) return { t: 'Incoming', c: 'incoming' }
    if (low) return { t: 'Reorder window', c: 'reorder' }
    if (aging) return { t: 'Aging stock', c: 'soon' }
    return { t: 'Covered', c: 'ok' }
  }
  const componentStatus = (c: Component) => {
    const alloc = allocated.get(c.id) || 0
    const free = Number(c.on_hand) - alloc
    if (free < 0) return { t: `${nf(Math.abs(free), c.unit)} short`, c: 'reorder' }
    if (free === 0 && alloc > 0) return { t: 'Fully committed', c: 'reorder' }
    if (alloc > 0 && free < alloc * 0.15) return { t: 'Below reorder', c: 'soon' }
    return { t: 'Healthy', c: 'ok' }
  }

  const lowProducts = products.filter(p => productStatus(p).c === 'reorder')
  const agingProducts = products.filter(p => productStatus(p).c === 'soon')
  const shortComponents = components.filter(c => ['reorder', 'soon'].includes(componentStatus(c).c))

  const unitsInProduction = activeOrders
    .filter(o => ['production', 'qc', 'ship'].includes(o.stage))
    .reduce((a, o) => a + (o.quantity || 0), 0)
  const reorderSignals = lowProducts.length + components.filter(c => componentStatus(c).c === 'reorder').length

  /* ---------- grid rows + schema ---------- */
  const finRows: GridRow[] = products.map(p => ({
    id: p.id, name: p.name, sub: p.sku || '—', unit: '',
    vals: { onhand: p.on_hand, wk: p.weekly_sales, incoming: incomingFor(p), safety: p.safety_stock },
  }))
  const cmpRows: GridRow[] = components.map(c => ({
    id: c.id, name: c.name, sub: c.location || '—', unit: c.unit === 'pcs' ? '' : c.unit,
    vals: { onhand: Number(c.on_hand), alloc: allocated.get(c.id) || 0 },
  }))

  const finCols: GridCol[] = [
    { key: 'name', label: 'Product', type: 'text' },
    { key: 'onhand', label: 'On hand', type: 'num', field: 'on_hand', decimals: 0 },
    { key: 'wk', label: '/ wk', type: 'num', field: 'weekly_sales', decimals: 1, tip: 'Units sold per week — set it from your store’s numbers.' },
    { key: 'incoming', label: 'Incoming', type: 'link', tip: 'Units in production, landing as stock — linked from your orders.' },
    { key: 'safety', label: 'Safety', type: 'num', field: 'safety_stock', decimals: 0, tip: 'The floor you never want to dip below.' },
    {
      key: 'cover', label: 'Cover', type: 'calc',
      calc: r => r.vals.wk > 0 ? (r.vals.onhand + r.vals.incoming) / r.vals.wk : Infinity,
      fmt: v => Number.isFinite(v) ? `${nf(v)} wk` : '∞',
      pre: ['onhand', 'incoming', 'wk'], formula: '( On hand + Incoming ) ÷ / wk',
      plain: 'Weeks of stock left at the current sell-through rate.',
    },
    {
      key: 'status', label: 'Status', type: 'status',
      stat: r => {
        const p = products.find(x => x.id === r.id)
        return p ? productStatus({ ...p, on_hand: r.vals.onhand, weekly_sales: r.vals.wk, safety_stock: r.vals.safety }) : { t: '—', c: 'ok' }
      },
    },
  ]
  const cmpCols: GridCol[] = [
    { key: 'name', label: 'Item', type: 'text' },
    { key: 'onhand', label: 'On hand', type: 'num', field: 'on_hand', decimals: 1 },
    { key: 'alloc', label: 'Allocated', type: 'link', tip: 'Reserved by open production orders — remaining units × BOM per-unit.' },
    {
      key: 'free', label: 'Free', type: 'calc',
      calc: r => r.vals.onhand - r.vals.alloc,
      fmt: (v, r) => nf(v, r.unit),
      pre: ['onhand', 'alloc'], formula: 'On hand − Allocated',
      plain: 'What is actually available to plan new orders with.',
    },
    {
      key: 'status', label: 'Status', type: 'status',
      stat: r => {
        const c = components.find(x => x.id === r.id)
        return c ? componentStatus({ ...c, on_hand: r.vals.onhand }) : { t: '—', c: 'ok' }
      },
    },
  ]

  const gridCols = ds === 'finished' ? finCols : cmpCols
  const baseRows = ds === 'finished' ? finRows : cmpRows
  const gridRows = [...baseRows]
  if (sort.key) {
    const col = gridCols.find(c => c.key === sort.key)
    if (col) {
      const val = (r: GridRow) => col.type === 'calc' && col.calc ? col.calc(r) : r.vals[col.key] ?? 0
      gridRows.sort((a, b) => (val(a) - val(b)) * sort.dir)
    }
  }
  const selR = Math.max(0, Math.min(gridRows.length - 1, sel.r))
  const selC = Math.max(0, Math.min(gridCols.length - 1, sel.c))
  const selCol = gridCols[selC]
  const selRow = gridRows[selR]
  const tracePre = selCol?.type === 'calc' && selCol.pre ? new Set(selCol.pre.map(k => gridCols.findIndex(c => c.key === k))) : new Set<number>()

  function select(r: number, c: number) {
    setSel({
      r: Math.max(0, Math.min(gridRows.length - 1, r)),
      c: Math.max(0, Math.min(gridCols.length - 1, c)),
    })
  }

  function startEdit(initial?: string) {
    if (!selCol || selCol.type !== 'num' || !selRow) return
    setDraft(initial != null ? initial : String(selRow.vals[selCol.key]))
    setEditing(true)
  }

  async function commitEdit(move: boolean) {
    if (!editing || !selCol || !selRow || !selCol.field) { setEditing(false); return }
    let v = parseFloat(draft.replace(/[^0-9.\-]/g, ''))
    if (isNaN(v) || v < 0) v = 0
    v = selCol.decimals === 1 ? Math.round(v * 10) / 10 : Math.round(v)
    const table = ds === 'finished' ? 'products' : 'components'
    const field = selCol.field
    if (ds === 'finished') setProducts(prev => prev.map(p => p.id === selRow.id ? { ...p, [field]: v } : p))
    else setComponents(prev => prev.map(c => c.id === selRow.id ? { ...c, [field]: v } : c))
    setEditing(false)
    supabase.from(table).update({ [field]: v }).eq('id', selRow.id).then(() => {})
    if (move) select(selR + 1, selC)
  }

  async function fillDown() {
    if (!selCol || selCol.type !== 'num' || !selCol.field || !selRow) {
      toast('Pick an editable (white) cell to fill down from.')
      return
    }
    const v = selRow.vals[selCol.key]
    const field = selCol.field
    const below = gridRows.slice(selR + 1)
    if (ds === 'finished') setProducts(prev => prev.map(p => below.some(b => b.id === p.id) ? { ...p, [field]: v } : p))
    else setComponents(prev => prev.map(c => below.some(b => b.id === c.id) ? { ...c, [field]: v } : c))
    for (const b of below) supabase.from(ds === 'finished' ? 'products' : 'components').update({ [field]: v }).eq('id', b.id).then(() => {})
    toast(`Filled ${selCol.label} down · ${below.length} cell${below.length === 1 ? '' : 's'}`)
  }

  function sortBy(ci: number) {
    const col = gridCols[ci]
    if (!col || col.type === 'text' || col.type === 'status') return
    setSort(prev => prev.key === col.key ? { key: col.key, dir: prev.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 })
  }

  function gridKeyDown(e: React.KeyboardEvent) {
    if (editing) return // the input handles its own keys
    const k = e.key
    if (k === 'ArrowDown') { e.preventDefault(); select(selR + 1, selC) }
    else if (k === 'ArrowUp') { e.preventDefault(); select(selR - 1, selC) }
    else if (k === 'ArrowLeft') { e.preventDefault(); select(selR, selC - 1) }
    else if (k === 'ArrowRight') { e.preventDefault(); select(selR, selC + 1) }
    else if (k === 'Tab') { e.preventDefault(); select(selR, selC + (e.shiftKey ? -1 : 1)) }
    else if (k === 'Enter' || k === 'F2') { e.preventDefault(); startEdit() }
    else if ((e.metaKey || e.ctrlKey) && (k === 'd' || k === 'D')) { e.preventDefault(); fillDown() }
    else if (/^[0-9.]$/.test(k)) { e.preventDefault(); startEdit(k) }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); startEdit('0') }
  }

  function exportGrid() {
    if (ds === 'finished') {
      downloadCsv('clewa-inventory-finished',
        ['product', 'sku', 'on_hand', 'weekly_sales', 'incoming', 'safety_stock', 'cover_weeks', 'status'],
        gridRows.map(r => {
          const cover = r.vals.wk > 0 ? (r.vals.onhand + r.vals.incoming) / r.vals.wk : ''
          const st = finCols[finCols.length - 1].stat!(r)
          return [r.name, r.sub === '—' ? '' : r.sub, r.vals.onhand, r.vals.wk, r.vals.incoming, r.vals.safety,
            typeof cover === 'number' ? cover.toFixed(1) : '', st.t]
        }))
    } else {
      downloadCsv('clewa-inventory-components',
        ['item', 'location', 'unit', 'on_hand', 'allocated', 'free', 'status'],
        gridRows.map(r => {
          const c = components.find(x => x.id === r.id)
          const st = cmpCols[cmpCols.length - 1].stat!(r)
          return [r.name, r.sub === '—' ? '' : r.sub, c?.unit || '', r.vals.onhand, r.vals.alloc, r.vals.onhand - r.vals.alloc, st.t]
        }))
    }
  }

  /* formula bar content */
  let fbarRef = '—'
  let fbarBody: React.ReactNode = <span className="igf-plain">Select a cell to see how it is calculated.</span>
  let fbarEq = false
  if (selRow && selCol) {
    fbarRef = `${(selRow.sub !== '—' ? selRow.sub : selRow.name).slice(0, 14)} · ${selCol.label}`
    if (selCol.type === 'calc' && selCol.calc && selCol.fmt) {
      fbarEq = true
      fbarBody = <>
        <span className="igf-formula">{selCol.formula}</span> <span className="igf-arrow">=</span> <b>{selCol.fmt(selCol.calc(selRow), selRow)}</b>
        <span className="igf-plain">{selCol.plain}</span>
      </>
    } else if (selCol.type === 'num') {
      fbarBody = <><b>{nf(selRow.vals[selCol.key])}</b><span className="igf-plain">{selCol.tip || 'Editable — type to change it; everything downstream updates.'}</span></>
    } else if (selCol.type === 'link') {
      fbarBody = <><b>{selRow.vals[selCol.key] > 0 ? nf(selRow.vals[selCol.key], selRow.unit) : '—'}</b><span className="igf-plain">{selCol.tip || 'Linked from your orders — not edited here.'}</span></>
    } else if (selCol.type === 'status' && selCol.stat) {
      fbarBody = <><b>{selCol.stat(selRow).t}</b><span className="igf-plain">Computed from cover, safety stock and what is already on the way.</span></>
    } else {
      fbarBody = <><b>{selRow.name}</b><span className="igf-plain">{selRow.sub}</span></>
    }
  }

  /* grid insight, computed from real rows */
  let insight: React.ReactNode = null
  if (ds === 'finished' && finRows.length > 0) {
    const now = lowProducts.length
    insight = now > 0
      ? <><b>{now} style{now > 1 ? 's are' : ' is'} inside the reorder window.</b> Cover no longer clears safety stock at the current sell-through — edit any white cell and this recalculates.</>
      : <><b>Nothing is below its reorder point right now.</b> Cover clears the safety line on every style. Edit any white cell and this recalculates.</>
  } else if (ds === 'components' && cmpRows.length > 0) {
    const blocked = components.filter(c => componentStatus(c).c !== 'ok').length
    insight = <><b>{blocked} component{blocked === 1 ? '' : 's'} won&rsquo;t cover committed production.</b> Free stock is what is left after every open order reserves its share — raise On hand to see a line clear instantly.</>
  }

  /* size-curve matrix: union of size keys across products, in wearable order */
  const sizedProducts = products.filter(p => p.sizes && Object.keys(p.sizes).length > 0)
  const sizeCols = [...new Set(sizedProducts.flatMap(p => Object.keys(p.sizes!)))]
    .sort((a, b) => {
      const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b, undefined, { numeric: true })
    })

  /* consumption cards: active orders that have BOM lines */
  const bomOrders = activeOrders.filter(o => boms.some(b => b.order_id === o.id))

  /* WIP: orders with production reports, broken down by stage */
  const wipOrders = activeOrders.filter(o => reports.some(r => r.order_id === o.id))
  const stageCount = (orderId: string, stage: string) =>
    reports.filter(r => r.order_id === orderId && (r.stage || 'cut') === stage).reduce((a, r) => a + r.units, 0)

  const inp = (w: number): React.CSSProperties =>
    ({ width: w, padding: '8px 10px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13, background: 'var(--paper)' })

  const maxOnHand = Math.max(1, ...products.map(p => p.on_hand))

  return (
    <section className="page on" data-page="inventory">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Inventory</h2>
            <div className="pg-sub">Finished goods, components &amp; materials — one consolidated count</div>
          </div>
          <div className="dv-tools">
            {(products.length > 0 || components.length > 0) && (
              <button className="x-btn" type="button" onClick={() => {
                downloadCsv('clewa-inventory',
                  ['type', 'name', 'sku_or_unit', 'on_hand', 'weekly_sales', 'safety_stock', 'location'],
                  [
                    ...products.map(p2 => ['product', p2.name, p2.sku || '', p2.on_hand, p2.weekly_sales, p2.safety_stock, '']),
                    ...components.map(c2 => ['component', c2.name, c2.unit, c2.on_hand, '', '', c2.location || '']),
                  ])
              }}><ExportIcon />Export</button>
            )}
          </div>
        </div>

        <div className="inv-kpis">
          <div className="inv-kpi"><div className="ik-num">{nf(products.reduce((a, p) => a + p.on_hand, 0))}</div><div className="ik-label">Finished units on hand</div></div>
          <div className="inv-kpi"><div className="ik-num">{nf(components.reduce((a, c) => a + Number(c.on_hand), 0))}</div><div className="ik-label">Components in stock</div></div>
          <div className="inv-kpi"><div className="ik-num">{nf(unitsInProduction)}</div><div className="ik-label">Units in production</div></div>
          <div className={`inv-kpi ${reorderSignals > 0 ? 'warn' : ''}`}><div className="ik-num">{reorderSignals}</div><div className="ik-label">Reorder signal{reorderSignals === 1 ? '' : 's'}</div></div>
        </div>

        {/* VIEW SWITCH */}
        <div className="inv-switch">
          <div className="ivs-seg">
            <button className={`ivs-btn ${view === 'grid' ? 'on' : ''}`} type="button" onClick={() => setView('grid')}>The grid</button>
            <button className={`ivs-btn ${view === 'overview' ? 'on' : ''}`} type="button" onClick={() => setView('overview')}>Overview</button>
          </div>
          <div className="ivs-note">A spreadsheet, but intelligent — or the same numbers as cards.</div>
        </div>

        {/* ============ THE INTELLIGENT GRID ============ */}
        <div className={`inv-view ${view === 'grid' ? '' : 'off'}`} data-iv="grid">
          <div className="ibx-card grid-card">
            <div className="ig-head">
              <div>
                <div className="ibx-kick">The grid · spreadsheet, but intelligent</div>
                <div className="ig-lede">Edit any white cell — cover, free stock and status recompute the instant you hit Enter, and the change is saved.</div>
              </div>
              <div className="ig-tabs">
                <button className={`ig-tab ${ds === 'finished' ? 'on' : ''}`} type="button"
                  onClick={() => { setDs('finished'); setSort({ key: null, dir: 1 }); setSel({ r: 0, c: 1 }); setEditing(false) }}>Finished goods</button>
                <button className={`ig-tab ${ds === 'components' ? 'on' : ''}`} type="button"
                  onClick={() => { setDs('components'); setSort({ key: null, dir: 1 }); setSel({ r: 0, c: 1 }); setEditing(false) }}>Components &amp; trims</button>
              </div>
            </div>

            <div className="ig-fbar">
              <span className="igf-ref">{fbarRef}</span>
              <span className={`igf-eq ${fbarEq ? 'on' : ''}`}>ƒ<span className="dot">x</span></span>
              <span className="igf-val">{fbarBody}</span>
            </div>

            <div className="ig-tools">
              <button className="ig-tbtn" type="button" onClick={fillDown}><span className="igt-ic">⤓</span>Fill down</button>
              <button className="ig-tbtn" type="button" onClick={() => { setSort({ key: null, dir: 1 }); load(); toast('Grid refreshed from the record') }}><span className="igt-ic">↺</span>Refresh</button>
              <span className="ig-spacer" />
              <span className="ig-legend">
                <span className="igl-item"><span className="igl-sw edit" />you edit</span>
                <span className="igl-item"><span className="igl-sw calc" />Clewa computes</span>
                <span className="igl-item"><span className="igl-sw link" />from orders</span>
              </span>
              <button className="x-btn" type="button" onClick={exportGrid}><ExportIcon />Export</button>
            </div>

            <div className="ig-grid" tabIndex={0} onKeyDown={gridKeyDown}>
              <div className="ig-scroll">
                <table className="ig-table">
                  <thead>
                    <tr>
                      {gridCols.map((col, ci) => (
                        <th key={col.key} onClick={() => sortBy(ci)}
                          className={[
                            col.type === 'num' ? 'h-edit' : col.type === 'calc' ? 'h-calc' : col.type === 'link' ? 'h-link' : '',
                            col.type === 'text' ? 'g-prod' : '',
                            ci === selC ? 'col-sel' : '',
                          ].filter(Boolean).join(' ')}>
                          <span className="igh-lab">{col.label}{sort.key === col.key && <span className="igh-ar">{sort.dir > 0 ? '▲' : '▼'}</span>}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.length === 0 && (
                      <tr><td className="g-cell g-text" colSpan={gridCols.length} style={{ whiteSpace: 'normal', color: 'var(--ink-3)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
                        {ds === 'finished'
                          ? 'Add your sellable products below (switch to Overview) — Clewa computes cover, stockout timing and status.'
                          : 'Add components in the Overview view — buttons, zips, fabric, labels — and production reports deduct them automatically.'}
                      </td></tr>
                    )}
                    {gridRows.map((r, ri) => (
                      <tr key={r.id}>
                        {gridCols.map((col, ci) => {
                          const isSel = ri === selR && ci === selC
                          const isTrace = ri === selR && tracePre.has(ci)
                          const isEditing = isSel && editing && col.type === 'num'
                          const cls = ['g-cell']
                          if (col.type === 'text') cls.push('g-text')
                          if (col.type === 'num') cls.push('g-edit', 'g-num')
                          if (col.type === 'link') cls.push('g-link', 'g-num')
                          if (col.type === 'calc') cls.push('g-calc', 'g-num')
                          if (col.type === 'status') cls.push('g-status')
                          if (isSel) cls.push('sel')
                          if (isTrace) cls.push('trace')
                          if (isEditing) cls.push('editing')
                          let content: React.ReactNode = null
                          if (isEditing) {
                            content = (
                              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(true) }
                                  else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
                                  else if (e.key === 'Tab') { e.preventDefault(); commitEdit(false); select(selR, selC + (e.shiftKey ? -1 : 1)) }
                                }}
                                onBlur={() => commitEdit(false)}
                                style={{ width: '100%', border: 0, outline: 'none', background: 'transparent', font: 'inherit', textAlign: 'right', color: 'inherit', caretColor: 'var(--thread)', padding: 0 }} />
                            )
                          } else if (col.type === 'text') {
                            content = <><span className="gc-name">{r.name}</span><span className="gc-sub">{r.sub}</span></>
                          } else if (col.type === 'num') {
                            content = nf(r.vals[col.key])
                          } else if (col.type === 'link') {
                            const lv = r.vals[col.key]
                            content = (
                              <span className="gc-link">{lv > 0 ? nf(lv, r.unit) : '—'}{lv > 0 && (
                                <svg viewBox="0 0 24 24" className="gc-li"><path d="M9 15l6-6M8.5 8.5h-1a3.5 3.5 0 100 7h2M15.5 15.5h1a3.5 3.5 0 100-7h-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                              )}</span>
                            )
                          } else if (col.type === 'calc' && col.calc && col.fmt) {
                            content = col.fmt(col.calc(r), r)
                          } else if (col.type === 'status' && col.stat) {
                            const s = col.stat(r)
                            content = <span className={`ig-pill ${s.c}`}>{s.t}</span>
                          }
                          return (
                            <td key={col.key} className={cls.join(' ')}
                              onMouseDown={() => { if (editing) commitEdit(false); select(ri, ci) }}
                              onDoubleClick={() => { select(ri, ci); startEdit() }}>
                              {content}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {gridRows.length > 0 && (
                    <tfoot>
                      {ds === 'finished' ? (
                        <tr>
                          <td className="lab">Totals</td>
                          <td className="g-num">{nf(gridRows.reduce((a, r) => a + r.vals.onhand, 0))}</td>
                          <td />
                          <td className="g-num">{nf(gridRows.reduce((a, r) => a + r.vals.incoming, 0))}</td>
                          <td /><td /><td />
                        </tr>
                      ) : (
                        <tr>
                          <td className="lab">Totals</td>
                          <td className="g-num">{nf(gridRows.reduce((a, r) => a + r.vals.onhand, 0))}</td>
                          <td className="g-num">{nf(gridRows.reduce((a, r) => a + r.vals.alloc, 0))}</td>
                          <td /><td />
                        </tr>
                      )}
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {insight && (
              <div className="ibx-alert ai-surface">
                <span className="iv-ic">C</span>
                <span className="iv-txt">{insight}</span>
                {reorderSignals > 0 && <button className="dm-btn primary" type="button" onClick={() => nav('/orders/new')}>Start a reorder</button>}
              </div>
            )}
          </div>
        </div>

        {/* ============ OVERVIEW (cards) ============ */}
        <div className={`inv-view ${view === 'overview' ? '' : 'off'}`} data-iv="overview">

          {/* LIVE BOM CONSUMPTION */}
          {bomOrders.map(o => {
            const lines = boms.filter(b => b.order_id === o.id)
            const produced = producedByOrder.get(o.id) || 0
            const qty = o.quantity || 0
            const pct = qty > 0 ? Math.min(100, Math.round((produced / qty) * 100)) : 0
            const lineData = lines.map(b => {
              const c = components.find(x => x.id === b.component_id)
              if (!c) return null
              const per = Number(b.qty_per_unit)
              const consumed = produced * per
              const need = Math.max(0, qty - produced) * per
              const short = Number(c.on_hand) < need
              return { b, c, per, consumed, need, short }
            }).filter((x): x is NonNullable<typeof x> => x !== null)
            const worstShort = lineData.filter(l => l.short).sort((a, b2) => (b2.need - Number(b2.c.on_hand)) - (a.need - Number(a.c.on_hand)))[0]
            return (
              <div className="ibx-card" key={o.id}>
                <div className="ibx-head">
                  <div>
                    <div className="ibx-kick">Live consumption · from the BOM</div>
                    <div className="ibx-title"><Link to={`/orders/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{o.name}</Link></div>
                    <div className="ibx-bom">per unit: {lineData.map((l, i) => (
                      <span key={l.b.id}>{i > 0 && ' · '}<b>{nf(l.per, l.c.unit === 'pcs' ? '' : l.c.unit)} {l.c.name}</b></span>
                    ))}</div>
                  </div>
                  {qty > 0 && (
                    <div className="ibx-prog">
                      <div className="ip-top"><span className="ipt-n">{nf(produced)} <span className="ipt-of">/ {nf(qty)} units reported</span></span><span className="ipt-pct">{pct}%</span></div>
                      <div className="ip-bar"><div className="ip-fill" style={{ width: `${pct}%` }} /></div>
                      <div className="ip-cap">{o.factory_name ? `Reported by ${o.factory_name} · ` : ''}updates the counts below automatically</div>
                    </div>
                  )}
                </div>
                <div className="ibx-table">
                  <div className="ibx-thead"><span>Component</span><span>Per unit</span><span>Consumed</span><span>Remaining</span><span>Run status</span></div>
                  {lineData.map(l => (
                    <div className="ibx-row" key={l.b.id}>
                      <span className="ib-name">{l.c.name}</span>
                      <span className="ib-per">{nf(l.per, l.c.unit === 'pcs' ? '' : l.c.unit)}</span>
                      <span className="ib-used">−{nf(l.consumed, l.c.unit === 'pcs' ? '' : l.c.unit)}</span>
                      <span className="ib-left">{nf(Number(l.c.on_hand), l.c.unit === 'pcs' ? '' : l.c.unit)}</span>
                      {l.short
                        ? <span className="ib-st warn">{nf(l.need - Number(l.c.on_hand), l.c.unit === 'pcs' ? '' : l.c.unit)} short</span>
                        : <span className="ib-st ok">Covers the run</span>}
                    </div>
                  ))}
                </div>
                {worstShort && (
                  <div className="ibx-alert">
                    <span className="iv-ic">!</span>
                    <span className="iv-txt"><b>{worstShort.c.name} won&rsquo;t cover the rest of this run.</b> The remaining {nf(Math.max(0, qty - produced))} units
                      need {nf(worstShort.need, worstShort.c.unit === 'pcs' ? '' : worstShort.c.unit)} and only {nf(Number(worstShort.c.on_hand), worstShort.c.unit === 'pcs' ? '' : worstShort.c.unit)} remain —
                      it comes up <span className="iv-strong">{nf(worstShort.need - Number(worstShort.c.on_hand), worstShort.c.unit === 'pcs' ? '' : worstShort.c.unit)} short</span>. Order now and production never notices.</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* COMPONENTS & MATERIALS */}
          <div className="ibx-card">
            <div className="ibx-head slim"><div><div className="ibx-kick">Components &amp; materials</div><div className="ibx-sub">Allocated = reserved by open production orders. Free = available to plan with.</div></div></div>
            <div className="ibx-table cmp5">
              <div className="ibx-thead"><span>Item</span><span>Location</span><span>Allocated</span><span>Free</span><span>Status</span></div>
              {components.length === 0 && (
                <p className="ibx-sub" style={{ padding: '14px 22px' }}>
                  Buttons, zips, fabric, labels — track what production consumes. Link them to orders in a BOM and
                  factory progress reports deduct them automatically.
                </p>
              )}
              {components.map(c => {
                const alloc = allocated.get(c.id) || 0
                const free = Number(c.on_hand) - alloc
                const st = componentStatus(c)
                return (
                  <div className="ibx-row" key={c.id}>
                    <span className="ib-name">{c.name}</span>
                    <span className="ib-loc">{c.location || '—'}</span>
                    <span className="ib-used">{nf(alloc, c.unit === 'pcs' ? '' : c.unit)}</span>
                    <span className="ib-left">{nf(free, c.unit === 'pcs' ? '' : c.unit)}</span>
                    <span className={`ib-st ${st.c === 'ok' ? 'ok' : 'warn'}`}>{st.t}</span>
                  </div>
                )
              })}
            </div>
            <form onSubmit={addComponent} style={{ display: 'flex', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--hair)', flexWrap: 'wrap' }}>
              <input placeholder="Component (e.g. horn button 15mm)" value={cForm.name} onChange={e => setCForm({ ...cForm, name: e.target.value })} style={inp(200)} />
              <select value={cForm.unit} onChange={e => setCForm({ ...cForm, unit: e.target.value })} style={inp(70)}>
                {['pcs', 'm', 'kg', 'rolls', 'sets'].map(u => <option key={u}>{u}</option>)}
              </select>
              <input placeholder="On hand" value={cForm.on_hand} onChange={e => setCForm({ ...cForm, on_hand: e.target.value })} style={inp(80)} />
              <input placeholder="Location" value={cForm.location} onChange={e => setCForm({ ...cForm, location: e.target.value })} style={inp(110)} />
              <button className="dm-btn" type="submit">Add component</button>
            </form>
          </div>

          {/* FINISHED GOODS */}
          <div className="ibx-card">
            <div className="ibx-head slim">
              <div><div className="ibx-kick">Finished goods</div><div className="ibx-sub">Sell-through drives cover; incoming production lands back as inventory on the way.</div></div>
            </div>
            <div className="inv-panel" style={{ border: 0, borderRadius: 0 }}>
              <div className="inv-phead"><span>Product</span><span>On hand</span><span>Sell-through</span><span>Status</span></div>
              {products.length === 0 && (
                <p className="ibx-sub" style={{ padding: '14px 18px' }}>
                  Add your sellable products with rough weekly sales — Clewa computes cover, stockout dates and reorder timing.
                </p>
              )}
              {products.map(p => {
                const incoming = incomingFor(p)
                const weeks = p.weekly_sales > 0 ? p.on_hand / p.weekly_sales : null
                const stockout = weeks !== null ? new Date(Date.now() + weeks * 7 * 86400000).toISOString().slice(0, 10) : null
                const st = productStatus(p)
                const pct = Math.min(100, Math.round((p.on_hand / maxOnHand) * 100))
                return (
                  <div className="inv-row" key={p.id}>
                    <div className="inv-prod">
                      <span className="ip-sw" />
                      <div>
                        <div className="ip-name">{p.name}</div>
                        <div className="ip-sku">{p.sku || 'no SKU'}{incoming > 0 ? ' · incoming' : ''}</div>
                      </div>
                    </div>
                    <div className="inv-stock">
                      <span className="ist-num">{nf(p.on_hand)}</span>
                      <div className="ist-bar"><div className={`ist-fill ${st.c === 'reorder' ? 'low' : ''}`} style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="inv-sell">
                      {incoming > 0 && <><b>{nf(incoming)} units</b> on the way · </>}
                      {weeks !== null
                        ? <><b>~{nf(weeks)} week{Math.round(weeks) === 1 ? '' : 's'}</b> to stockout · {nf(p.weekly_sales)}/wk{stockout ? ` · ~${stockout}` : ''}</>
                        : 'no sales velocity set'}
                    </div>
                    <span className={`inv-status ${st.c === 'soon' ? 'reorder' : st.c}`}>{st.t}</span>
                  </div>
                )
              })}
            </div>
            {lowProducts.length > 0 && (
              <div className="ibx-alert">
                <span className="iv-ic">!</span>
                <span className="iv-txt"><b>{lowProducts[0].name} is inside its reorder window{lowProducts.length > 1 ? ` — and ${lowProducts.length - 1} more style${lowProducts.length > 2 ? 's are' : ' is'} with it` : ''}.</b> Cover
                  no longer clears safety stock at the current sell-through. Start the reorder before the gap becomes dark weeks.</span>
                <button className="dm-btn primary" type="button" onClick={() => nav('/orders/new')}>Start reorder</button>
              </div>
            )}
            <form onSubmit={addProduct} style={{ display: 'flex', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--hair)', flexWrap: 'wrap' }}>
              <input placeholder="Product name" value={pForm.name} onChange={e => setPForm({ ...pForm, name: e.target.value })} style={inp(160)} />
              <input placeholder="SKU" value={pForm.sku} onChange={e => setPForm({ ...pForm, sku: e.target.value })} style={inp(90)} />
              <input placeholder="On hand" value={pForm.on_hand} onChange={e => setPForm({ ...pForm, on_hand: e.target.value })} style={inp(80)} />
              <input placeholder="Sales/week" value={pForm.weekly_sales} onChange={e => setPForm({ ...pForm, weekly_sales: e.target.value })} style={inp(90)} />
              <input placeholder="Safety stock" value={pForm.safety_stock} onChange={e => setPForm({ ...pForm, safety_stock: e.target.value })} style={inp(100)} />
              <button className="dm-btn" type="submit">Add product</button>
            </form>
          </div>

          {/* WIP TRACKER */}
          {(wipOrders.length > 0 || reports.length > 0) && (
            <div className="ibx-card">
              <div className="ibx-head slim">
                <div><div className="ibx-kick">Work in progress · live from the floor</div><div className="ibx-sub">Each order&rsquo;s units as they move through cutting, sewing, finishing and packing — reported by the factory, visible to you both.</div></div>
              </div>
              {wipOrders.map(o => (
                <div className="wip-row" key={o.id}>
                  <div className="wip-name">
                    <Link to={`/orders/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{o.name}</Link>
                    <div className="wn-sub">{o.factory_name || 'factory'}{o.quantity ? ` · ${nf(o.quantity)}u` : ''}</div>
                  </div>
                  <div className="wip-stages" style={{ gridTemplateColumns: `repeat(${WIP_STAGES.length}, 1fr)` }}>
                    {WIP_STAGES.map(([key, label]) => {
                      const n = stageCount(o.id, key)
                      const state = o.quantity && n >= o.quantity ? 'done' : n > 0 ? 'active' : 'idle'
                      return (
                        <div className={`wip-stg ${state}`} key={key}>
                          <div className="ws-lab">{label}</div>
                          <div className="ws-n">{nf(n)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {reports.slice(0, 8).map(r => {
                const o = orders.find(x => x.id === r.order_id)
                return (
                  <div key={r.id} className="ibx-sub" style={{ padding: '8px 22px', borderTop: '1px solid var(--hair-soft)', marginTop: 0 }}>
                    <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{r.units.toLocaleString()} {r.stage || 'cut'}</b>
                    {' — '}{o ? <Link to={`/orders/${o.id}`}>{o.name}</Link> : 'order'}
                    {' · '}{r.source === 'factory' ? `reported by ${r.reported_by || 'factory'}` : 'recorded by you'} · {r.created_at.slice(0, 10)}{r.note ? ` · ${r.note}` : ''}
                  </div>
                )
              })}
              {reports.length === 0 && (
                <p className="ibx-sub" style={{ padding: '14px 22px' }}>
                  When your factory reports progress from their order link (&ldquo;120 sewn&rdquo;), it lands here — and components deduct automatically.
                </p>
              )}
            </div>
          )}

          {/* SIZE-CURVE MATRIX */}
          <div className="ibx-card">
            <div className="ibx-head slim">
              <div><div className="ibx-kick">Size curve · stock by size</div><div className="ibx-sub">Clewa watches the curve, not just the total — sizes under 8% of stock are flagged, because the size that sells out first decides your reorder date.</div></div>
              {sizedProducts.length > 0 && (
                <button className="x-btn" type="button" onClick={() => downloadCsv('clewa-size-curve',
                  ['product', ...sizeCols, 'total'],
                  sizedProducts.map(p => [p.name, ...sizeCols.map(s => p.sizes![s] ?? ''), Object.values(p.sizes!).reduce((a, b) => a + b, 0)]))}>
                  <ExportIcon />Export</button>
              )}
            </div>
            {sizedProducts.length > 0 && (
              <div className="sz-wrap">
                <table className="sz-grid">
                  <thead><tr><th className="prod">Product</th>{sizeCols.map(s => <th key={s}>{s}</th>)}<th className="tot">Total</th></tr></thead>
                  <tbody>
                    {sizedProducts.map(p => {
                      const total = Object.values(p.sizes!).reduce((a, b) => a + b, 0)
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="sz-prod">{p.name}
                              <div className="szp-sub">
                                {p.weekly_sales > 0 ? `${nf(p.weekly_sales)} / wk` : 'no sell-through set'}
                                {' · '}
                                <a href="#" onClick={e => {
                                  e.preventDefault()
                                  setSizeEdit(p.id)
                                  setSizeDraft(Object.entries(p.sizes || {}).map(([k, v]) => `${k}:${v}`).join(', '))
                                }}>edit</a>
                              </div>
                            </div>
                          </td>
                          {sizeCols.map(s => {
                            const q = p.sizes![s]
                            if (q == null) return <td className="sz-cell" key={s} />
                            const lowSize = total > 0 && q / total < 0.08
                            return (
                              <td className="sz-cell" key={s}>
                                <span className={`sz-chip ${lowSize ? 'out' : ''}`} title={lowSize ? 'Under 8% of stock — this size sells out first' : ''}>
                                  <span className="szc-n">{nf(q)}</span>
                                  <span className="szc-w">{total > 0 ? `${Math.round((q / total) * 100)}%` : ''}</span>
                                </span>
                              </td>
                            )
                          })}
                          <td className="sz-tot">{nf(total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {sizeEdit && (
              <div style={{ padding: '0 22px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="ibx-sub" style={{ marginTop: 0 }}>{products.find(p => p.id === sizeEdit)?.name} sizes:</span>
                <input value={sizeDraft} onChange={e => setSizeDraft(e.target.value)} placeholder="S:120, M:300, L:240, XL:80" style={inp(240)} />
                <button className="dm-btn" type="button" onClick={async () => {
                  const sizes: Record<string, number> = {}
                  for (const part of sizeDraft.split(',')) {
                    const [k, v] = part.split(':').map(x => x.trim())
                    if (k && Number.isFinite(parseInt(v, 10))) sizes[k.toUpperCase()] = parseInt(v, 10)
                  }
                  await supabase.from('products').update({ sizes: Object.keys(sizes).length ? sizes : null }).eq('id', sizeEdit)
                  setSizeEdit(null); setSizeDraft(''); load()
                }}>Save</button>
                <button className="dm-btn" type="button" onClick={() => { setSizeEdit(null); setSizeDraft('') }}>Cancel</button>
              </div>
            )}
            {sizedProducts.length === 0 && !sizeEdit && (
              <p className="ibx-sub" style={{ padding: '14px 22px' }}>
                {products.length > 0
                  ? <>No size curves yet — <a href="#" onClick={e => { e.preventDefault(); setSizeEdit(products[0].id); setSizeDraft('') }}>set sizes</a> on
                    a product and the matrix appears, with thin sizes flagged.</>
                  : 'Add a product first, then set its size curve — the matrix appears here.'}
              </p>
            )}
          </div>

          {/* RECIPES (BOM) */}
          <div className="ibx-card">
            <div className="ibx-head slim">
              <div><div className="ibx-kick">Recipes · the BOM</div><div className="ibx-sub">&ldquo;One overcoat = 1.9m wool + 4 buttons + 1 zip.&rdquo; Link components to an order and every factory progress report deducts them — this is how a BOM never goes missing.</div></div>
            </div>
            {boms.length > 0 && (
              <div className="ibx-table cmp5">
                <div className="ibx-thead"><span>Order</span><span>Component</span><span>Per unit</span><span>Consumed</span><span>&nbsp;</span></div>
                {boms.map(b => {
                  const o = orders.find(x => x.id === b.order_id)
                  const c = components.find(x => x.id === b.component_id)
                  if (!o || !c) return null
                  const produced = producedByOrder.get(o.id) || 0
                  return (
                    <div className="ibx-row" key={b.id}>
                      <span className="ib-name">{o.name}</span>
                      <span className="ib-loc">{c.name}</span>
                      <span className="ib-per">{nf(Number(b.qty_per_unit), c.unit === 'pcs' ? '' : c.unit)}</span>
                      <span className="ib-used">−{nf(produced * Number(b.qty_per_unit), c.unit === 'pcs' ? '' : c.unit)}</span>
                      <span className="ib-loc">{nf(produced)} units reported</span>
                    </div>
                  )
                })}
              </div>
            )}
            <form onSubmit={addBom} style={{ display: 'flex', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--hair)', flexWrap: 'wrap' }}>
              <select value={bomForm.order_id} onChange={e => setBomForm({ ...bomForm, order_id: e.target.value })} style={inp(180)}>
                <option value="">Order…</option>
                {activeOrders.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={bomForm.component_id} onChange={e => setBomForm({ ...bomForm, component_id: e.target.value })} style={inp(180)}>
                <option value="">Component…</option>
                {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Qty per unit" value={bomForm.qty} onChange={e => setBomForm({ ...bomForm, qty: e.target.value })} style={inp(100)} />
              <button className="dm-btn" type="submit">Link</button>
            </form>
          </div>

          {/* DEADSTOCK / AGING */}
          {agingProducts.length > 0 && (
            <div className="ibx-card">
              <div className="ibx-head slim">
                <div><div className="ibx-kick">Deadstock &amp; aging · capital sitting still</div><div className="ibx-sub">Stock with no sell-through, or more than 26 weeks of cover. Clewa nudges you to use it up before you buy more.</div></div>
              </div>
              <div className="dead-grid">
                {agingProducts.map(p => (
                  <div className="dead-card warn" key={p.id}>
                    <div className="dead-age">Aging</div>
                    <div className="dead-name">{p.name} · {nf(p.on_hand)} units</div>
                    <div className="dead-sub">
                      {p.weekly_sales === 0
                        ? 'no sell-through recorded'
                        : `~${nf(p.on_hand / p.weekly_sales)} weeks of cover at ${nf(p.weekly_sales)}/wk`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* /inv-view overview */}
      </div>
    </section>
  )
}
