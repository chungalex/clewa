import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

type Provider = {
  key: string
  name: string
  category: string
  tier: number
  status: 'available' | 'setup_required' | 'coming_later'
  blurb: string | null
}

const STATUS_LABELS = {
  available: 'Available',
  setup_required: 'Setup required',
  coming_later: 'Coming later',
}

/**
 * The honest integrations catalog. Nothing here pretends to be connected —
 * every provider carries its true status, and the framework underneath
 * (providers + per-user connections) is the same one real connections will use.
 */
export default function Integrations() {
  const [providers, setProviders] = useState<Provider[] | null>(null)

  useEffect(() => {
    supabase.from('integration_providers').select('*').order('tier').order('name')
      .then(({ data }) => setProviders((data as Provider[]) || []))
  }, [])

  if (providers === null) return <Loading variant="detail" />
  const categories = [...new Set(providers.map(p => p.category))]

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Integrations</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>
            Everything feeds Clewa; Clewa stays the source of truth. Statuses below are honest — nothing
            shows as connected unless it genuinely works.
          </div>
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat}>
          <div className="section-label">{cat}</div>
          <div className="contact-grid" style={{ marginBottom: 6 }}>
            {providers.filter(p => p.category === cat).map(p => (
              <div className="card" key={p.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <strong style={{ fontSize: 14.5 }}>{p.name}</strong>
                  <span className={`sample-status ${p.status === 'available' ? 'approved' : p.status === 'setup_required' ? 'submitted' : ''}`}>
                    {STATUS_LABELS[p.status]}
                  </span>
                </div>
                {p.blurb && <p className="quiet" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>{p.blurb}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="quiet" style={{ marginTop: 16, fontSize: 12.5, maxWidth: 640 }}>
        Shopify is first — it powers reorder intelligence and needs app credentials to switch on.
        The email and file integrations depend on provider review processes (Google, Meta) that take
        weeks; until then, everything they'd automate can be done manually inside Clewa today.
        Want one prioritized? Tell us: hello@clewa.io.
      </p>
    </>
  )
}
