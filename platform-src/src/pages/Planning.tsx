import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, Order } from '../supabase'
import { downloadCsv } from '../csv'
import { toast } from '../toast'
import '../parity/planning.css'

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

function money(cur: string, n: number) {
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function Planning() {
  const [owner, setOwner] = useState('')
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [form, setForm] = useState({ season: '', name: '', qty: '', cost: '', retail: '', currency: 'USD' })
  const [budgets, setBudgets] = useState<{ season: string; budget: number; currency: string }[]>([])
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({})

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

  if (items === null) return <Loading />

  const seasons = [...new Set(items.map(i => i.season))]
  const closedOrders = orders.filter(o => ['delivered', 'closed'].includes(o.stage))
  const live = items.filter(i => i.status !== 'dropped')

  function seasonTotals(list: PlanItem[]) {
    const liveList = list.filter(i => i.status !== 'dropped')
    const units = liveList.reduce((s, i) => s + (i.planned_qty || 0), 0)
    const spend = liveList.reduce((s, i) => s + (i.planned_qty && i.target_cost ? i.planned_qty * Number(i.target_cost) : 0), 0)
    const revenue = liveList.reduce((s, i) => s + (i.planned_qty && i.target_retail ? i.planned_qty * Number(i.target_retail) : 0), 0)
    const margin = revenue > 0 ? Math.round(((revenue - spend) / revenue) * 100) : null
    const spent = liveList.filter(i => i.status === 'ordered')
      .reduce((s, i) => s + (i.planned_qty && i.target_cost ? i.planned_qty * Number(i.target_cost) : 0), 0)
    return { units, spend, revenue, margin, spent, committed: spend - spent }
  }

  function itemMargin(i: PlanItem) {
    if (!i.target_cost || !i.target_retail) return null
    return Math.round(((Number(i.target_retail) - Number(i.target_cost)) / Number(i.target_retail)) * 100)
  }

  const pipeCols: { key: PlanItem['status']; label: string; ghost: string | null }[] = [
    { key: 'planned', label: 'Planned', ghost: null },
    { key: 'in_development', label: 'In development', ghost: null },
    { key: 'ordered', label: 'Ordered', ghost: 'hands off to a PO' },
  ]

  return (
    <section className="page on" data-page="planning">
      <div className="page-w">
        <div className="pg-bar no-print">
          <div>
            <h2 className="pg-h">Planning</h2>
            <div className="pg-sub" style={{ marginBottom: 0 }}>
              Decide what next season should be — the line, the budget and the design pipeline. Timing lives in Calendar; reorders in Inventory.
            </div>
          </div>
          <div className="dv-tools">
            {items.length > 0 && (
              <button className="x-btn" type="button" onClick={() => downloadCsv('clewa-plan',
                ['season', 'style', 'status', 'qty', 'target_cost', 'target_retail', 'currency'],
                items.map(i => [i.season, i.name, i.status, i.planned_qty, i.target_cost, i.target_retail, i.currency]))}>
                <span className="xb-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM10 4v16M4 10h16" /></svg></span>
                Export
              </button>
            )}
            {closedOrders.length > 0 && (
              <button className="x-btn ghost" type="button" onClick={() => window.print()}>Season close report (PDF)</button>
            )}
            <button className="x-btn ghost" type="button" onClick={() => {
              const el = document.getElementById('addPlan')
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              el?.querySelector('input')?.focus({ preventScroll: true })
            }}>+ Plan a style</button>
          </div>
        </div>

        {items.length === 0 && (
          <div className="ibx-card no-print">
            <div className="ibx-head slim">
              <div>
                <div className="ibx-kick">No line plan yet</div>
                <div className="ibx-sub">Add the styles you're planning for the season with target quantities and prices — Clewa keeps the blended margin honest as the plan evolves.</div>
              </div>
            </div>
          </div>
        )}

        {/* SEASON ROADMAP */}
        {seasons.length > 0 && (
          <div className="plan-road no-print">
            {seasons.map((season, idx) => {
              const list = items.filter(i => i.season === season)
              const liveList = list.filter(i => i.status !== 'dropped')
              const t = seasonTotals(list)
              const orderedCount = liveList.filter(i => i.status === 'ordered').length
              const pct = liveList.length > 0 ? Math.round((orderedCount / liveList.length) * 100) : 0
              const phase = liveList.length > 0 && orderedCount === liveList.length ? 'Ordered'
                : liveList.some(i => i.status === 'in_development') ? 'In development' : 'Planned'
              return (
                <div className={`road-col${idx === 0 ? ' now' : ''}`} key={season}>
                  <div className="road-top">
                    <div className="road-ph">{phase}</div>
                    <div className="road-name">{season}</div>
                    <div className="road-win">{t.units > 0 ? `${t.units.toLocaleString()} units planned` : 'quantities TBD'}</div>
                  </div>
                  <div className="road-body">
                    <div className="road-stat"><span>Styles</span><b>{liveList.length}</b></div>
                    <div className="road-stat"><span>Planned spend</span><b>{t.spend > 0 ? money(list[0].currency, t.spend) : '—'}</b></div>
                    <div className="road-bar"><div className={`road-fill${pct === 100 ? ' done' : ''}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {seasons.map(season => {
          const list = items.filter(i => i.season === season)
          const t = seasonTotals(list)
          const cur = list[0].currency
          const bud = budgets.find(x => x.season === season)
          const open = bud ? Number(bud.budget) - t.spend : 0
          const over = bud ? t.spend > Number(bud.budget) : false
          const spentPct = bud && Number(bud.budget) > 0 ? Math.min(100, (t.spent / Number(bud.budget)) * 100) : 0
          const committedPct = bud && Number(bud.budget) > 0 ? Math.min(100 - spentPct, (t.committed / Number(bud.budget)) * 100) : 0
          const openPct = Math.max(0, 100 - spentPct - committedPct)
          return (
            <div key={season} className="no-print">
              {/* OPEN TO BUY */}
              <div className="ibx-card">
                <div className="ibx-head slim">
                  <div>
                    <div className="ibx-kick">Open-to-buy · {season} budget</div>
                    <div className="ibx-sub">Your season budget and how much is still free to commit — the financial frame before you place anything.</div>
                  </div>
                  {bud && (
                    <span className="ibx-bom" style={over ? { color: 'var(--err)' } : undefined}>
                      {over ? <>over budget by <b>{money(bud.currency, t.spend - Number(bud.budget))}</b></> : <><b>{money(bud.currency, open)}</b> still open</>}
                    </span>
                  )}
                </div>
                {bud ? (
                  <>
                    <div className="otb-bar">
                      <i className="spent" style={{ width: `${spentPct}%` }} />
                      <i className="committed" style={{ width: `${committedPct}%` }} />
                      <i className="open" style={{ width: `${openPct}%` }} />
                    </div>
                    <div className="otb-legend">
                      <span className="ol"><span className="ol-sw" style={{ background: 'var(--thread)' }} />Spent (ordered) <b>{money(bud.currency, t.spent)}</b></span>
                      <span className="ol"><span className="ol-sw" style={{ background: 'var(--thread-dim)' }} />Committed <b>{money(bud.currency, t.committed)}</b></span>
                      <span className="ol"><span className="ol-sw" style={{ background: '#C2D1BD' }} />Open to buy <b>{money(bud.currency, Math.max(0, open))}</b> of {money(bud.currency, Number(bud.budget))}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '4px 20px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="quiet" style={{ fontSize: 12.5 }}>Set a season budget to see open-to-buy live.</span>
                    <input placeholder="Season production budget" value={budgetDraft[season] ?? ''}
                      onChange={e => setBudgetDraft({ ...budgetDraft, [season]: e.target.value })}
                      style={{ width: 190, padding: '7px 10px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12.5 }} />
                    <button className="dm-btn" type="button" onClick={async () => {
                      const v = parseFloat(budgetDraft[season] || '')
                      if (!Number.isFinite(v) || v <= 0) return
                      await supabase.from('season_budgets').upsert(
                        { owner, season, budget: v, currency: cur }, { onConflict: 'owner,season' })
                      setBudgetDraft({ ...budgetDraft, [season]: '' })
                      toast('Budget set — open-to-buy is live')
                      load()
                    }}>Set budget</button>
                  </div>
                )}
              </div>

              {/* SEASON KPIS */}
              <div className="sc-kpis">
                <div className="fin-kpi"><div className="fk-num">{t.units > 0 ? t.units.toLocaleString() : '—'}</div><div className="fk-label">Planned units</div></div>
                <div className="fin-kpi"><div className="fk-num">{t.spend > 0 ? money(cur, t.spend) : '—'}</div><div className="fk-label">Planned production spend</div></div>
                <div className="fin-kpi"><div className="fk-num">{t.revenue > 0 ? money(cur, t.revenue) : '—'}</div><div className="fk-label">Revenue at full sell-through</div></div>
                <div className="fin-kpi">
                  <div className="fk-num">{t.margin !== null ? `${t.margin}%` : '—'}</div>
                  <div className="fk-label">Blended margin</div>
                  {t.margin !== null && <div className={`fk-sub ${t.margin < 55 ? 'warn' : 'up'}`}>{t.margin < 55 ? 'below typical 55% target' : 'target 55%'}</div>}
                </div>
              </div>

              {/* THE LINE PLAN */}
              <div className="ibx-card">
                <div className="ibx-head slim">
                  <div>
                    <div className="ibx-kick">The line plan · {season}</div>
                    <div className="ibx-sub">The shape of the collection — quantity, price and the margin each style needs to earn its slot.</div>
                  </div>
                  <button className="x-btn ghost" type="button" onClick={() => downloadCsv(`clewa-plan-${season}`,
                    ['season', 'style', 'status', 'qty', 'target_cost', 'target_retail', 'currency'],
                    list.map(i => [i.season, i.name, i.status, i.planned_qty, i.target_cost, i.target_retail, i.currency]))}>Export CSV</button>
                </div>
                <div className="ibx-table">
                  <div className="ibx-thead" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.1fr' }}>
                    <span>Style</span><span>Qty</span><span>Cost → retail</span><span>Target margin</span><span>Decision</span>
                  </div>
                  {list.map(i => {
                    const m = itemMargin(i)
                    return (
                      <div className="ibx-row" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.1fr' }} key={i.id}>
                        <span className="ib-name">
                          {i.name}
                          {i.order_id && <> · <Link to={`/orders/${i.order_id}`}>order →</Link></>}
                        </span>
                        <span className="ib-loc">{i.planned_qty ? `${i.planned_qty.toLocaleString()} units` : 'qty TBD'}</span>
                        <span className="ib-loc">
                          {i.target_cost ? `${i.currency} ${Number(i.target_cost).toFixed(2)}` : '—'}
                          {' → '}
                          {i.target_retail ? `${i.currency} ${Number(i.target_retail).toFixed(2)}` : '—'}
                        </span>
                        <span className="ib-per">{m !== null ? `${m}%` : '—'}</span>
                        <span>
                          <select value={i.status} onChange={e => setStatus(i, e.target.value as PlanItem['status'])}
                            style={{ padding: '6px 9px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12, background: 'var(--paper)' }}>
                            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </span>
                      </div>
                    )
                  })}
                </div>
                {t.margin !== null && t.margin < 55 && (
                  <div className="ibx-alert ai-surface">
                    <span className="iv-ic">C</span>
                    <span className="iv-txt">
                      <b>Blended margin for {season} is {t.margin}% — under the typical 55% floor.</b>{' '}
                      Lift target retail or trim cost on the thinnest styles until the blended number clears the floor.
                    </span>
                    <Link className="dm-btn" to="/finances">Check the math</Link>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* DESIGN PIPELINE */}
        {live.length > 0 && (
          <div className="ibx-card no-print">
            <div className="ibx-head slim">
              <div>
                <div className="ibx-kick">Design pipeline</div>
                <div className="ibx-sub">Where each style sits on its way to production. When a style is ready, it hands off to a PO.</div>
              </div>
            </div>
            <div className="pipe" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {pipeCols.map(col => {
                const colItems = live.filter(i => i.status === col.key)
                return (
                  <div className="pipe-col" key={col.key}>
                    <div className="pipe-h">{col.label} <span className="ph-n">{colItems.length}</span></div>
                    {colItems.map(i => (
                      <div className="pipe-card" key={i.id}>
                        <div className="pc-t">{i.name}</div>
                        <div className="pc-sub">{i.season}{i.planned_qty ? ` · ${i.planned_qty.toLocaleString()} units` : ''}</div>
                      </div>
                    ))}
                    {colItems.length === 0 && <div className="pipe-card ghost">{col.ghost || 'nothing here yet'}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* SEASON CLOSE — delivered & closed orders */}
        {closedOrders.length > 0 && (
          <div className="ibx-card no-print">
            <div className="ibx-head slim">
              <div>
                <div className="ibx-kick">Season close · delivered &amp; closed</div>
                <div className="ibx-sub">What shipped and what it was worth — export the PDF to share the full report.</div>
              </div>
            </div>
            <div className="perf-head"><span>Order</span><span className="r">Factory</span><span className="r">Units</span><span className="r">Value</span><span className="r">Shipped by</span></div>
            {closedOrders.map(o => (
              <div className="perf-row" key={o.id}>
                <span className="perf-name"><Link to={`/orders/${o.id}`}>{o.name}</Link></span>
                <span className="perf-num">{o.factory_name || '—'}</span>
                <span className="perf-num">{o.quantity ? o.quantity.toLocaleString() : '—'}</span>
                <span className="perf-num good">{o.quantity && o.unit_price ? money(o.currency, o.quantity * Number(o.unit_price)) : '—'}</span>
                <span className="perf-num">{o.ship_by || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {/* ADD TO THE PLAN */}
        <div className="ibx-card no-print" id="addPlan">
          <div className="ibx-head slim">
            <div>
              <div className="ibx-kick">Add to the plan</div>
              <div className="ibx-sub">A style, its season and the targets it has to hit.</div>
            </div>
          </div>
          <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '16px 22px' }}>
            <input placeholder="Season (e.g. FW27)" value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} style={pi(130)} />
            <input placeholder="Style name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={pi(180)} />
            <input placeholder="Qty" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} style={pi(70)} />
            <input placeholder="Target cost" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} style={pi(90)} />
            <input placeholder="Target retail" value={form.retail} onChange={e => setForm({ ...form, retail: e.target.value })} style={pi(90)} />
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={pi(70)}>
              {['USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="dm-btn primary" type="submit">Add</button>
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
      </div>
    </section>
  )
}

function pi(w: number): React.CSSProperties {
  return { width: w, padding: '8px 10px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13, background: 'var(--paper)' }
}
