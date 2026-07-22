import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order } from '../supabase'
import { downloadCsv } from '../csv'
import { toast } from '../toast'

type PlanItem = {
  id: string
  season: string
  name: string
  order_id: string | null
  planned_qty: number | null
  target_cost: number | null
  target_retail: number | null
  currency: string
  status: 'planned' | 'in_development' | 'ordered' | 'dropped'
}

const STATUS_LABELS = { planned: 'Planned', in_development: 'In development', ordered: 'Ordered', dropped: 'Dropped' }

export default function Planning() {
  const [owner, setOwner] = useState('')
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [form, setForm] = useState({ season: '', name: '', qty: '', cost: '', retail: '', currency: 'USD' })
  const [budgets, setBudgets] = useState<{ season: string; budget: number; currency: string }[]>([])
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({})
  const [owner2, setOwner2] = useState('')

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    setOwner(userData.user.id)
    const [p, o, b] = await Promise.all([
      supabase.from('planning_items').select('*').order('season', { ascending: false }).order('created_at'),
      supabase.from('orders').select('*'),
      supabase.from('season_budgets').select('season, budget, currency'),
    ])
    setItems((p.data as PlanItem[]) || [])
    setOrders((o.data as Order[]) || [])
    setBudgets((b.data as { season: string; budget: number; currency: string }[]) || [])
    setOwner2(userData.user.id)
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.season.trim()) return
    await supabase.from('planning_items').insert({
      owner, season: form.season.trim(), name: form.name.trim(),
      planned_qty: parseInt(form.qty, 10) || null,
      target_cost: parseFloat(form.cost) || null,
      target_retail: parseFloat(form.retail) || null,
      currency: form.currency,
    })
    setForm({ ...form, name: '', qty: '', cost: '', retail: '' })
    load()
  }

  async function setStatus(item: PlanItem, status: PlanItem['status']) {
    await supabase.from('planning_items').update({ status }).eq('id', item.id)
    load()
  }

  if (items === null) return null

  const seasons = [...new Set(items.map(i => i.season))]
  const closedOrders = orders.filter(o => ['delivered', 'closed'].includes(o.stage))

  function seasonTotals(list: PlanItem[]) {
    const live = list.filter(i => i.status !== 'dropped')
    const units = live.reduce((s, i) => s + (i.planned_qty || 0), 0)
    const spend = live.reduce((s, i) => s + (i.planned_qty && i.target_cost ? i.planned_qty * Number(i.target_cost) : 0), 0)
    const revenue = live.reduce((s, i) => s + (i.planned_qty && i.target_retail ? i.planned_qty * Number(i.target_retail) : 0), 0)
    const margin = revenue > 0 ? Math.round(((revenue - spend) / revenue) * 100) : null
    return { units, spend, revenue, margin }
  }

  return (
    <>
      <div className="main-head no-print">
        <div>
          <h1>Planning</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            The season on one page — what you're making, what it costs, what it returns.
          </div>
        </div>
        {closedOrders.length > 0 && (
          <button className="btn ghost" onClick={() => window.print()}>Season close report (PDF)</button>
        )}
      </div>

      {items.length === 0 && (
        <div className="card empty no-print">
          <h2>No line plan yet.</h2>
          <p>Add the styles you're planning for the season with target quantities and prices — Clewa keeps the blended margin honest as the plan evolves.</p>
        </div>
      )}

      {seasons.map(season => {
        const list = items.filter(i => i.season === season)
        const t = seasonTotals(list)
        return (
          <div key={season} className="no-print">
            <div className="section-label">{season}</div>
            {(() => {
              const bud = budgets.find(x => x.season === season)
              if (!bud) return null
              const pct = bud.budget > 0 ? Math.min(100, Math.round((t.spend / Number(bud.budget)) * 100)) : 0
              const over = t.spend > Number(bud.budget)
              return (
                <div className="card" style={{ marginBottom: 10, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                    <span className="quiet">Open-to-buy · {season}</span>
                    <span style={{ color: over ? 'var(--err)' : 'var(--ink-2)' }}>
                      {bud.currency} {t.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })} of {bud.currency} {Number(bud.budget).toLocaleString()}
                      {over ? ' — over budget' : ` · ${bud.currency} ${(Number(bud.budget) - t.spend).toLocaleString(undefined, { maximumFractionDigits: 0 })} open`}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--hair)', borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: 5, borderRadius: 3, background: over ? 'var(--err)' : 'var(--gold-light)' }} />
                  </div>
                </div>
              )
            })()}
            <div className="kpi-row">
              <div className="kpi"><strong>{t.units.toLocaleString() || '—'}</strong><span>Planned units</span></div>
              <div className="kpi"><strong>{t.spend > 0 ? `${list[0].currency} ${t.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</strong><span>Planned production spend</span></div>
              <div className="kpi"><strong>{t.revenue > 0 ? `${list[0].currency} ${t.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</strong><span>Revenue at full sell-through</span></div>
              <div className={`kpi ${t.margin !== null && t.margin < 55 ? 'warn' : ''}`}><strong>{t.margin !== null ? `${t.margin}%` : '—'}</strong><span>Blended margin{t.margin !== null && t.margin < 55 ? ' · below typical 55% target' : ''}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input placeholder="Season production budget" value={budgetDraft[season] ?? ''}
                onChange={e => setBudgetDraft({ ...budgetDraft, [season]: e.target.value })}
                style={{ width: 190, padding: '7px 10px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12.5 }} />
              <button className="btn ghost small" onClick={async () => {
                const v = parseFloat(budgetDraft[season] || '')
                if (!Number.isFinite(v) || v <= 0) return
                await supabase.from('season_budgets').upsert(
                  { owner: owner2, season, budget: v, currency: list[0].currency }, { onConflict: 'owner,season' })
                setBudgetDraft({ ...budgetDraft, [season]: '' })
                toast('Budget set — open-to-buy is live')
                load()
              }}>Set budget</button>
              <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => downloadCsv(`clewa-plan-${season}`,
                ['season', 'style', 'status', 'qty', 'target_cost', 'target_retail', 'currency'],
                list.map(i => [i.season, i.name, i.status, i.planned_qty, i.target_cost, i.target_retail, i.currency]))}>Export CSV</button>
            </div>
            <div className="card" style={{ padding: 0, marginBottom: 8 }}>
              {list.map(i => (
                <div className="fin-row" key={i.id}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{i.name}</strong>
                    <span className="fin-meta">
                      {i.planned_qty ? `${i.planned_qty.toLocaleString()} units` : 'qty TBD'}
                      {i.target_cost ? ` · cost ${i.currency} ${Number(i.target_cost).toFixed(2)}` : ''}
                      {i.target_retail ? ` · retail ${i.currency} ${Number(i.target_retail).toFixed(2)}` : ''}
                      {i.target_cost && i.target_retail ? ` · ${Math.round(((Number(i.target_retail) - Number(i.target_cost)) / Number(i.target_retail)) * 100)}% margin` : ''}
                      {i.order_id && <> · <Link to={`/orders/${i.order_id}`}>order →</Link></>}
                    </span>
                  </div>
                  <select value={i.status} onChange={e => setStatus(i, e.target.value as PlanItem['status'])}
                    style={{ padding: '6px 9px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12, background: 'var(--paper)' }}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="section-label no-print">Add to the plan</div>
      <div className="card no-print">
        <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Season (e.g. FW27)" value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} style={pi(110)} />
          <input placeholder="Style name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={pi(180)} />
          <input placeholder="Qty" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} style={pi(70)} />
          <input placeholder="Target cost" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} style={pi(90)} />
          <input placeholder="Target retail" value={form.retail} onChange={e => setForm({ ...form, retail: e.target.value })} style={pi(90)} />
          <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={pi(70)}>
            {['USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn primary small" type="submit">Add</button>
        </form>
      </div>

      {/* Print-only: the season close report */}
      <div className="print-pack">
        <h1>Season close report</h1>
        <p className="pp-meta">Generated {new Date().toISOString().slice(0, 10)} · Clewa</p>
        <section>
          <h2>Delivered & closed orders</h2>
          {closedOrders.length === 0 && <p>No delivered or closed orders yet.</p>}
          {closedOrders.map(o => (
            <p key={o.id}>
              <strong>{o.name}</strong> — {o.factory_name || 'factory'}
              {o.quantity ? ` · ${o.quantity.toLocaleString()} units` : ''}
              {o.quantity && o.unit_price ? ` · ${o.currency} ${(o.quantity * Number(o.unit_price)).toLocaleString()}` : ''}
              {o.ship_by ? ` · shipped by ${o.ship_by}` : ''}
            </p>
          ))}
        </section>
        <section>
          <h2>Totals</h2>
          <p><strong>Orders completed:</strong> {closedOrders.length}</p>
          <p><strong>Units delivered:</strong> {closedOrders.reduce((s, o) => s + (o.quantity || 0), 0).toLocaleString()}</p>
        </section>
        <p className="pp-foot">Every number traces to a dual-signed record in Clewa. clewa.io</p>
      </div>
    </>
  )
}

function pi(w: number): React.CSSProperties {
  return { width: w, padding: '8px 10px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13, background: 'var(--paper)' }
}
