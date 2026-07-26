import Loading from '../Loading'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import '../parity/settings.css'

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
    <section className="page on" data-page="integrations">
      <div className="page-w">
        <div className="pg-bar">
          <div>
            <h2 className="pg-h">Integrations</h2>
            <div className="pg-sub">
              Everything feeds Clewa; Clewa stays the source of truth. Statuses below are honest — nothing
              shows as connected unless it genuinely works.
            </div>
          </div>
        </div>

        {categories.map(cat => (
          <div className="ibx-card" key={cat}>
            <div className="ibx-head slim"><div>
              <div className="ibx-kick">{cat}</div>
            </div></div>
            {providers.filter(p => p.category === cat).map(p => (
              <div className="team-row" key={p.key}>
                <span className="team-av">{p.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <div className="team-name">{p.name}</div>
                  {p.blurb && <div className="team-email" style={{ maxWidth: 560, lineHeight: 1.5 }}>{p.blurb}</div>}
                </div>
                <span className="team-sees" />
                <span className={`sample-status ${p.status === 'available' ? 'approved' : p.status === 'setup_required' ? 'submitted' : ''}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </div>
            ))}
          </div>
        ))}

        <p className="quiet" style={{ marginTop: 16, fontSize: 12.5, maxWidth: 640 }}>
          Shopify is first — it powers reorder intelligence and needs app credentials to switch on.
          The email and file integrations depend on provider review processes (Google, Meta) that take
          weeks; until then, everything they'd automate can be done manually inside Clewa today.
          Want one prioritized? Tell us: hello@clewa.io.
        </p>
      </div>
    </section>
  )
}
