import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { sectionsFor, completeness, gateStatus } from '../styleRules'

type Style = {
  id: string
  name: string
  category: string | null
  status: string
  description: string | null
  current_version: number
  created_at: string
}

export default function Styles() {
  const nav = useNavigate()
  const [styles, setStyles] = useState<Style[] | null>(null)
  const [gates, setGates] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('styles').select('*').order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const list = (data as Style[]) || []
        setStyles(list)
        if (list.length) {
          const { data: secs } = await supabase.from('style_sections')
            .select('style_id, section, content')
            .in('style_id', list.map(s => s.id))
          const byStyle: Record<string, Record<string, Record<string, string>>> = {}
          for (const r of (secs as { style_id: string; section: string; content: Record<string, string> }[]) || []) {
            byStyle[r.style_id] = byStyle[r.style_id] || {}
            byStyle[r.style_id][r.section] = r.content
          }
          const g: Record<string, string> = {}
          for (const s of list) {
            const st = gateStatus(completeness(s.category, byStyle[s.id] || {}))
            g[s.id] = st.bulkReady ? 'Production-ready' : st.samplingReady ? 'Sampling-ready' : st.quoteReady ? 'Quote-ready' : 'In development'
          }
          setGates(g)
        }
      })
  }, [])

  if (styles === null) return null

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Styles</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            From idea to factory-ready brief — every style becomes a tech pack, a sourcing request, or an order.
          </div>
        </div>
        <Link to="/styles/new" className="btn primary">+ New style</Link>
      </div>

      {styles.length === 0 ? (
        <div className="card empty">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>Start from anything</div>
          <h2>Describe it, and Clewa builds the brief.</h2>
          <p>
            A style starts as a sentence or a few reference photos. The guided builder turns it into
            a structured tech pack — and flags exactly what a factory still needs before it can quote.
          </p>
          <Link to="/styles/new" className="btn gold">Create your first style →</Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {styles.map(s => (
            <div className="order-row" key={s.id} onClick={() => nav(`/styles/${s.id}`)}>
              <div>
                <div className="name">{s.name}</div>
                <div className="meta">
                  {s.category || 'Uncategorized'}
                  {s.current_version > 0 ? ` · v${s.current_version}` : ' · unversioned'}
                  {` · created ${s.created_at.slice(0, 10)}`}
                </div>
              </div>
              <span className="stage-pill">{gates[s.id] || '…'}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
