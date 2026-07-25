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
  const [archived, setArchived] = useState<Style[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [gates, setGates] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('styles').select('*').not('archived_at', 'is', null)
      .then(({ data }) => setArchived((data as Style[]) || []))
    supabase.from('styles').select('*').is('archived_at', null).order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const list = (data as Style[]) || []
        setStyles(list)
        if (list.length) {
          // one thumbnail per style: first approved image, else first image
          supabase.from('style_images').select('style_id, storage_path, approved')
            .in('style_id', list.map(s2 => s2.id)).order('approved', { ascending: false }).order('created_at')
            .then(async ({ data: imgs }) => {
              const first = new Map<string, string>()
              for (const im of (imgs as { style_id: string; storage_path: string }[]) || []) {
                if (!first.has(im.style_id)) first.set(im.style_id, im.storage_path)
              }
              const t: Record<string, string> = {}
              for (const [sid, path] of first) {
                const { data: u } = await supabase.storage.from('style-images').createSignedUrl(path, 3600)
                if (u?.signedUrl) t[sid] = u.signedUrl
              }
              setThumbs(t)
            })
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
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {thumbs[s.id]
                  ? <img src={thumbs[s.id]} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--hair)' }} />
                  : <span style={{ width: 44, height: 44, borderRadius: 9, border: '1px dashed var(--hair-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontFamily: 'var(--serif)', fontSize: 17 }}>{s.name.slice(0, 1)}</span>}
                <div>
                <div className="name">{s.name}</div>
                <div className="meta">
                  {s.category || 'Uncategorized'}
                  {s.current_version > 0 ? ` · v${s.current_version}` : ' · unversioned'}
                  {` · created ${s.created_at.slice(0, 10)}`}
                </div>
                </div>
              </div>
              <span className="stage-pill">{gates[s.id] || '…'}</span>
            </div>
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span className="quiet" style={{ fontSize: 12.5 }}>Archived: </span>
          {archived.map(st => (
            <span key={st.id} className="quiet" style={{ fontSize: 12.5, marginRight: 12 }}>
              {st.name} <a href="#" onClick={async e => {
                e.preventDefault()
                await supabase.from('styles').update({ archived_at: null }).eq('id', st.id)
                location.reload()
              }}>restore</a>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
