import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import '../parity/settings.css'

type SourcingRequest = {
  id: string
  brand_name: string
  contact_name: string | null
  email: string
  product_category: string | null
  product_description: string | null
  target_quantity: string | null
  target_cost: string | null
  target_region: string | null
  target_delivery: string | null
  has_produced_before: string | null
  main_challenges: string | null
  budget_readiness: string | null
  status: string
  internal_notes: string | null
  next_action: string | null
  follow_up_date: string | null
  created_at: string
}

const STAGES = [
  'new', 'reviewing', 'discovery_call', 'brief_confirmed', 'factory_search',
  'shortlist', 'sampling', 'production', 'won', 'lost',
] as const

const STAGE_NAMES: Record<string, string> = {
  new: 'New', reviewing: 'Reviewing', discovery_call: 'Discovery call',
  brief_confirmed: 'Brief confirmed', factory_search: 'Factory search',
  shortlist: 'Shortlist', sampling: 'Sampling', production: 'Production',
  won: 'Won', lost: 'Lost',
}

/** Internal pipeline — RLS restricts rows to the Clewa team account. */
type PageView = { path: string; created_at: string }

export default function Sourcing() {
  const [reqs, setReqs] = useState<SourcingRequest[] | null>(null)
  const [views, setViews] = useState<PageView[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Partial<SourcingRequest>>>({})

  async function load() {
    const { data } = await supabase.from('sourcing_requests').select('*').order('created_at', { ascending: false })
    setReqs((data as SourcingRequest[]) || [])
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: pv } = await supabase.from('page_views').select('path, created_at').gte('created_at', since)
    setViews((pv as PageView[]) || null)
  }
  useEffect(() => { load() }, [])

  async function save(r: SourcingRequest) {
    const d = drafts[r.id]
    if (!d) return
    await supabase.from('sourcing_requests').update(d).eq('id', r.id)
    setDrafts({ ...drafts, [r.id]: {} })
    load()
  }

  async function setStatus(r: SourcingRequest, status: string) {
    await supabase.from('sourcing_requests').update({ status }).eq('id', r.id)
    load()
  }

  if (reqs === null) return <Loading variant="detail" />

  return (
    <section className="page on" data-page="sourcing">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Sourcing pipeline</h2>
            <div className="pg-sub">Internal — intake submissions from the public form land here.</div>
          </div>
        </div>

        {views && (
          <div className="fin-kpis">
            <div className="fin-kpi"><div className="fk-num">{views.length}</div><div className="fk-label">Page views · 7 days</div></div>
            <div className="fin-kpi"><div className="fk-num">{views.filter(v => v.path === '/' || v.path === '/index.html').length}</div><div className="fk-label">Homepage</div></div>
            <div className="fin-kpi"><div className="fk-num">{views.filter(v => v.path.includes('platform')).length}</div><div className="fk-label">Platform</div></div>
            <div className="fin-kpi"><div className="fk-num">{views.filter(v => v.path.includes('app.html')).length}</div><div className="fk-label">Demo</div></div>
          </div>
        )}

        {reqs.length === 0 && (
          <div className="ibx-card">
            <div className="empty">
              <h2>No sourcing requests yet.</h2>
              <p>When a brand submits the sourcing brief, it appears here with the full pipeline: New → Discovery → Brief → Search → Shortlist → Sampling → Production.</p>
            </div>
          </div>
        )}

        {reqs.map(r => {
          const d = drafts[r.id] || {}
          const isOpen = open === r.id
          return (
            <div className="ibx-card" key={r.id}>
              <div className="team-row" style={{ cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r.id)}>
                <span className="team-av">{r.brand_name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <div className="team-name">{r.brand_name}</div>
                  <div className="team-email">
                    {r.product_category || 'uncategorized'} · {r.target_quantity || 'qty ?'} · {r.email}
                  </div>
                </div>
                <span className="team-sees">{r.created_at.slice(0, 10)}</span>
                <span className="stage-pill">{STAGE_NAMES[r.status]}</span>
              </div>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--hair)', padding: '16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, fontSize: 13 }}>
                    <div><span className="quiet">Contact:</span> {r.contact_name || '—'}</div>
                    <div><span className="quiet">Region:</span> {r.target_region || '—'}</div>
                    <div><span className="quiet">Target cost:</span> {r.target_cost || '—'}</div>
                    <div><span className="quiet">Delivery:</span> {r.target_delivery || '—'}</div>
                    <div><span className="quiet">Produced before:</span> {r.has_produced_before || '—'}</div>
                    <div><span className="quiet">Budget/readiness:</span> {r.budget_readiness || '—'}</div>
                  </div>
                  {r.product_description && <p style={{ fontSize: 13, marginTop: 10 }}><span className="quiet">Product:</span> {r.product_description}</p>}
                  {r.main_challenges && <p style={{ fontSize: 13, marginTop: 6 }}><span className="quiet">Challenges:</span> {r.main_challenges}</p>}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                    {STAGES.map(s => (
                      <button key={s} className={`btn small ${r.status === s ? 'primary' : 'ghost'}`} onClick={() => setStatus(r, s)}>
                        {STAGE_NAMES[s]}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginTop: 12 }}>
                    <textarea
                      placeholder="Internal notes"
                      defaultValue={r.internal_notes || ''}
                      onChange={e => setDrafts({ ...drafts, [r.id]: { ...d, internal_notes: e.target.value } })}
                      style={{ padding: '8px 11px', border: '1px solid var(--hair-2)', borderRadius: 9, minHeight: 60, font: 'inherit', fontSize: 13 }}
                    />
                    <input
                      placeholder="Next action"
                      defaultValue={r.next_action || ''}
                      onChange={e => setDrafts({ ...drafts, [r.id]: { ...d, next_action: e.target.value } })}
                      style={{ padding: '8px 11px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13 }}
                    />
                    <input
                      type="date"
                      defaultValue={r.follow_up_date || ''}
                      onChange={e => setDrafts({ ...drafts, [r.id]: { ...d, follow_up_date: e.target.value } })}
                      style={{ padding: '8px 11px', border: '1px solid var(--hair-2)', borderRadius: 9, fontSize: 13 }}
                    />
                  </div>
                  <div className="dv-tools" style={{ marginTop: 12 }}>
                    <button className="hx-newbtn" onClick={() => save(r)}>Save notes</button>
                    <a className="x-btn" href={`mailto:${r.email}?subject=Clewa Sourcing — ${encodeURIComponent(r.brand_name)}`} style={{ textDecoration: 'none' }}>Email {r.contact_name || 'them'}</a>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
