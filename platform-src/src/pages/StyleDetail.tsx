import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { CATEGORIES, sectionsFor, completeness, gateStatus, LEVEL_LABELS, Issue } from '../styleRules'

type Style = {
  id: string
  owner: string
  name: string
  category: string | null
  status: string
  description: string | null
  current_version: number
}

type StyleImage = {
  id: string
  kind: string
  storage_path: string
  caption: string | null
  approved: boolean
  url?: string
}

type Content = Record<string, Record<string, string>>

export default function StyleDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [style, setStyle] = useState<Style | null>(null)
  const [content, setContent] = useState<Content>({})
  const [images, setImages] = useState<StyleImage[]>([])
  const [openSection, setOpenSection] = useState<string>('overview')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [versionNote, setVersionNote] = useState('')
  const [converted, setConverted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load() {
    const [{ data: s }, { data: secs }, { data: imgs }] = await Promise.all([
      supabase.from('styles').select('*').eq('id', id).single(),
      supabase.from('style_sections').select('section, content').eq('style_id', id),
      supabase.from('style_images').select('*').eq('style_id', id).order('created_at'),
    ])
    setStyle(s as Style)
    const c: Content = {}
    for (const r of (secs as { section: string; content: Record<string, string> }[]) || []) c[r.section] = r.content
    setContent(c)
    const list = (imgs as StyleImage[]) || []
    // signed URLs — the bucket is private
    const withUrls = await Promise.all(list.map(async img => {
      const { data } = await supabase.storage.from('style-images').createSignedUrl(img.storage_path, 3600)
      return { ...img, url: data?.signedUrl }
    }))
    setImages(withUrls)
  }

  useEffect(() => { load() }, [id])

  function setField(section: string, field: string, value: string) {
    const next = { ...content, [section]: { ...(content[section] || {}), [field]: value } }
    setContent(next)
    // Debounced autosave — the builder should feel like a notebook, not a form.
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistSection(section, next[section]), 700)
  }

  async function persistSection(section: string, c: Record<string, string>) {
    if (!style) return
    setSaving(true)
    await supabase.from('style_sections').upsert({
      style_id: style.id, owner: style.owner, section, content: c,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'style_id,section' })
    setSaving(false)
  }

  async function setCategory(category: string) {
    if (!style) return
    await supabase.from('styles').update({ category: category || null }).eq('id', style.id)
    setStyle({ ...style, category: category || null })
  }

  async function upload(files: FileList | null) {
    if (!files || !style) return
    setUploading(true)
    for (const f of Array.from(files).slice(0, 8)) {
      const path = `${style.owner}/${style.id}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
      const { error } = await supabase.storage.from('style-images').upload(path, f)
      if (!error) {
        await supabase.from('style_images').insert({
          style_id: style.id, owner: style.owner, kind: 'reference', storage_path: path, caption: f.name,
        })
      }
    }
    setUploading(false)
    load()
  }

  async function toggleApproved(img: StyleImage) {
    await supabase.from('style_images').update({ approved: !img.approved }).eq('id', img.id)
    load()
  }

  async function removeImage(img: StyleImage) {
    await supabase.storage.from('style-images').remove([img.storage_path])
    await supabase.from('style_images').delete().eq('id', img.id)
    load()
  }

  async function saveVersion() {
    if (!style) return
    const v = style.current_version + 1
    await supabase.from('style_versions').insert({
      style_id: style.id, owner: style.owner, version: v,
      snapshot: { category: style.category, content, note: versionNote || null },
      note: versionNote || null,
    })
    await supabase.from('styles').update({ current_version: v }).eq('id', style.id)
    setVersionNote('')
    setStyle({ ...style, current_version: v })
  }

  async function createOrder() {
    if (!style || converted) return
    setConverted(true)
    const qty = parseInt(content.overview?.quantity || '', 10)
    const { data: order } = await supabase.from('orders').insert({
      owner: style.owner, name: style.name, style_id: style.id,
      quantity: Number.isFinite(qty) ? qty : null,
    }).select('id').single()
    if (!order) { setConverted(false); return }
    // Seed the Record from the brief's factory-critical lines — brand-signed now.
    const now = new Date().toISOString()
    const seed: { category: string; content: string }[] = []
    const fab = content.materials?.main_fabric
    const weight = content.materials?.weight
    if (fab) seed.push({ category: 'spec', content: `Main fabric: ${fab}${weight ? `, ${weight}` : ''}` })
    if (content.measurements?.pom) seed.push({ category: 'spec', content: `Measurements (base size): ${content.measurements.pom}` })
    if (content.measurements?.tolerance) seed.push({ category: 'terms', content: `Tolerances: ${content.measurements.tolerance}` })
    if (content.qc?.qc_notes) seed.push({ category: 'terms', content: `QC: ${content.qc.qc_notes}` })
    if (seed.length) {
      await supabase.from('record_lines').insert(seed.map(l => ({
        order_id: order.id, owner: style.owner, ...l, brand_signed_at: now,
      })))
    }
    nav(`/orders/${order.id}`)
  }

  function sourcingUrl() {
    if (!style) return '../sourcing-apply.html'
    const p = new URLSearchParams()
    p.set('product_description', `${style.name}${content.overview?.summary ? ` — ${content.overview.summary}` : ''}`)
    if (style.category) p.set('product_category', style.category)
    if (content.overview?.quantity) p.set('target_quantity', content.overview.quantity)
    if (content.overview?.target_price) p.set('target_cost', content.overview.target_price)
    return `../sourcing-apply.html?${p.toString()}`
  }

  if (!style) return null
  const sections = sectionsFor(style.category)
  const issues = completeness(style.category, content)
  const gates = gateStatus(issues)
  const grouped: Record<Issue['level'], Issue[]> = { quote: [], sampling: [], bulk: [], recommend: [] }
  for (const i of issues) grouped[i.level].push(i)
  const gateLabel = gates.bulkReady ? 'Production-ready' : gates.samplingReady ? 'Sampling-ready' : gates.quoteReady ? 'Quote-ready' : 'In development'

  return (
    <>
      <div className="main-head no-print">
        <div>
          <Link to="/styles" style={{ fontSize: 12, color: 'var(--ink-3)' }}>← Styles</Link>
          <h1 style={{ marginTop: 4 }}>{style.name}</h1>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={style.category || ''} onChange={e => setCategory(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid var(--hair-2)', borderRadius: 8, background: 'var(--paper)', fontSize: 12.5 }}>
              <option value="">Set category…</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            {style.current_version > 0 && <span>v{style.current_version}</span>}
            {saving && <span className="quiet">saving…</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn ghost small" onClick={async () => {
            if (!window.confirm(`Archive "${style.name}"? It leaves your Styles list; versions and images are kept. Ask me to restore it any time.`)) return
            await supabase.from('styles').update({ archived_at: new Date().toISOString() }).eq('id', style.id)
            nav('/styles')
          }}>Archive</button>
          <span className="stage-pill">{gateLabel}</span>
        </div>
      </div>

      <div className="style-grid">
        <div>
          {/* Visuals */}
          <div className="card no-print" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <span className="ch-title">Visuals</span>
              <span className="ch-sub">references now — AI concept views when generation is configured</span>
            </div>
            <div className="img-grid">
              {images.map(img => (
                <figure className={`img-tile ${img.approved ? 'approved' : ''}`} key={img.id}>
                  {img.url ? <img src={img.url} alt={img.caption || ''} /> : <div className="img-missing">…</div>}
                  <figcaption>
                    <span>{img.kind === 'generated' ? 'Concept visualization' : 'Reference'}</span>
                    <span className="img-actions">
                      <a href="#" onClick={e => { e.preventDefault(); toggleApproved(img) }}>{img.approved ? '★ approved' : '☆ approve'}</a>
                      {' · '}
                      <a href="#" onClick={e => { e.preventDefault(); removeImage(img) }}>remove</a>
                    </span>
                  </figcaption>
                </figure>
              ))}
              <button className="img-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : '+ Add images'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files)} />
            </div>
            <p className="quiet" style={{ marginTop: 10, fontSize: 12 }}>
              AI concept generation (front/back views, colorways) is ready to switch on — it needs an image
              provider configured in project secrets. Uploads work fully today.
            </p>
          </div>

          {/* Guided sections */}
          {sections.map(sec => {
            const open = openSection === sec.key
            const filled = sec.fields.filter(f => (content[sec.key]?.[f.key] || '').trim()).length
            return (
              <div className={`card sec-card ${open ? '' : 'collapsed'}`} key={sec.key} style={{ marginBottom: 10 }}>
                <button className="sec-head" onClick={() => setOpenSection(open ? '' : sec.key)}>
                  <span className="sec-title">{sec.title}</span>
                  <span className="sec-state">{filled}/{sec.fields.length}{open ? ' —' : ' +'}</span>
                </button>
                {open && (
                  <div className="sec-body">
                    <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>{sec.hint}</p>
                    {sec.fields.map(f => (
                      <div className="field" key={f.key}>
                        <label>{f.label}</label>
                        {f.multiline ? (
                          <textarea rows={3} value={content[sec.key]?.[f.key] || ''} placeholder={f.placeholder}
                            onChange={e => setField(sec.key, f.key, e.target.value)} />
                        ) : (
                          <input value={content[sec.key]?.[f.key] || ''} placeholder={f.placeholder}
                            onChange={e => setField(sec.key, f.key, e.target.value)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Completeness rail */}
        <aside className="rail no-print">
          <div className="card">
            <div className="eyebrow">Factory readiness</div>
            <div className="gate-row">
              <span className={`gate ${gates.quoteReady ? 'ok' : ''}`}>Quote</span>
              <span className={`gate ${gates.samplingReady ? 'ok' : ''}`}>Sampling</span>
              <span className={`gate ${gates.bulkReady ? 'ok' : ''}`}>Bulk</span>
            </div>
            {issues.length === 0 && (
              <p className="fv-done" style={{ marginTop: 12 }}>
                Nothing missing. This brief is ready for a factory.
              </p>
            )}
            {(['quote', 'sampling', 'bulk', 'recommend'] as const).map(level => grouped[level].length > 0 && (
              <div key={level} style={{ marginTop: 14 }}>
                <div className="rail-level">{LEVEL_LABELS[level]}</div>
                {grouped[level].map((i, idx) => (
                  <div className="rail-issue" key={idx}>
                    <strong>{i.message}</strong>
                    <span>{i.why}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="eyebrow">Actions</div>
            <button className="btn primary small" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => window.print()}>
              Export tech pack (PDF)
            </button>
            <a className="btn gold small" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} href={sourcingUrl()}>
              Find a factory for this style →
            </a>
            <button className="btn ghost small" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={createOrder} disabled={converted}>
              {converted ? 'Creating order…' : 'Start a production order'}
            </button>
            <p className="quiet" style={{ fontSize: 11.5, marginTop: 8 }}>
              Starting an order seeds the Record from this brief — fabric, measurements, tolerances, QC.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <input value={versionNote} onChange={e => setVersionNote(e.target.value)} placeholder="Version note"
                style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12.5 }} />
              <button className="btn ghost small" onClick={saveVersion}>Save v{style.current_version + 1}</button>
            </div>
          </div>
        </aside>
      </div>

      {/* Print-only tech pack rendering */}
      <div className="print-pack">
        <h1>{style.name}</h1>
        <p className="pp-meta">{style.category || 'Uncategorized'} · v{style.current_version || '0 (draft)'} · exported from Clewa</p>
        {sections.map(sec => {
          const filled = sec.fields.filter(f => (content[sec.key]?.[f.key] || '').trim())
          if (!filled.length) return null
          return (
            <section key={sec.key}>
              <h2>{sec.title}</h2>
              {filled.map(f => (
                <p key={f.key}><strong>{f.label}:</strong> {content[sec.key][f.key]}</p>
              ))}
            </section>
          )
        })}
        <p className="pp-foot">Generated by Clewa — the record of what was agreed. clewa.io</p>
      </div>
    </>
  )
}
