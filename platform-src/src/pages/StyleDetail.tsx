import Loading from '../Loading'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabase'
import { toast } from '../toast'
import { CATEGORIES, sectionsFor, completeness, gateStatus, LEVEL_LABELS, Issue } from '../styleRules'
import '../parity/style-detail.css'

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
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [versionNote, setVersionNote] = useState('')
  const [converted, setConverted] = useState(false)
  const [drafting, setDrafting] = useState<'idle' | 'busy' | 'setup'>('idle')
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

  async function draftWithAI() {
    if (!style || drafting === 'busy') return
    setDrafting('busy')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/draft-tech-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${sess.session?.access_token || ''}` },
        body: JSON.stringify({ style_id: style.id }),
      })
      const d = await resp.json()
      if (d.setup) { setDrafting('setup'); return }
      if (!d.ok || !d.drafts) { toast('Drafting failed — try again'); setDrafting('idle'); return }
      // Fill EMPTY fields only — the user's words always win; everything stays editable.
      const next: Content = { ...content }
      let filled = 0
      for (const [secKey, fields] of Object.entries(d.drafts as Record<string, Record<string, string>>)) {
        if (typeof fields !== 'object' || !fields) continue
        for (const [fk, fv] of Object.entries(fields)) {
          if (typeof fv !== 'string' || !fv.trim()) continue
          if ((next[secKey]?.[fk] || '').trim()) continue
          next[secKey] = { ...(next[secKey] || {}), [fk]: fv }
          filled++
        }
      }
      setContent(next)
      for (const secKey of Object.keys(next)) await persistSection(secKey, next[secKey])
      toast(filled ? `${filled} fields drafted — review each; numbers marked "confirm" are typical values, not facts` : 'Nothing to draft — your sections are already filled')
      setDrafting('idle')
    } catch {
      toast('Drafting failed — try again')
      setDrafting('idle')
    }
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

  if (!style) return <Loading variant="detail" />
  const sections = sectionsFor(style.category)
  const issues = completeness(style.category, content)
  const gates = gateStatus(issues)
  const grouped: Record<Issue['level'], Issue[]> = { quote: [], sampling: [], bulk: [], recommend: [] }
  for (const i of issues) grouped[i.level].push(i)
  const gateLabel = gates.bulkReady ? 'Production-ready' : gates.samplingReady ? 'Sampling-ready' : gates.quoteReady ? 'Quote-ready' : 'In development'
  const totalFields = sections.reduce((n, s) => n + s.fields.length, 0)
  const filledFields = sections.reduce((n, s) => n + s.fields.filter(f => (content[s.key]?.[f.key] || '').trim()).length, 0)
  const pct = totalFields ? Math.round((filledFields / totalFields) * 100) : 0

  return (
    <div className="page-w">
      <Link to="/styles" className="od-back no-print" style={{ textDecoration: 'none' }}>← All styles</Link>
      <div className="pg-bar no-print">
        <div>
          <h2 className="pg-h">{style.name}</h2>
          <div className="pg-sub" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={style.category || ''} onChange={e => setCategory(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid var(--hair-2)', borderRadius: 8, background: 'var(--paper)', fontSize: 12.5 }}>
              <option value="">Set category…</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            {style.current_version > 0 && <span>v{style.current_version}</span>}
            {saving && <span className="quiet">saving…</span>}
          </div>
        </div>
        <div className="dv-tools">
          <button className="x-btn ghost" type="button" onClick={async () => {
            if (!window.confirm(`Archive "${style.name}"? It leaves your Styles list; versions and images are kept. Ask me to restore it any time.`)) return
            await supabase.from('styles').update({ archived_at: new Date().toISOString() }).eq('id', style.id)
            nav('/styles')
          }}>Archive</button>
          <button className="x-btn" type="button" onClick={() => window.print()}>
            <span className="xb-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg></span>
            Export PDF
          </button>
          <span className={`ot-stage ${gates.bulkReady ? 'live' : 'idle'}`}>{gateLabel}</span>
        </div>
      </div>

      {/* Artwork, sketches & references */}
      <div className="ibx-card no-print">
        <div className="ibx-head slim">
          <div>
            <div className="ibx-kick">Artwork, sketches &amp; references</div>
            <div className="ibx-sub">
              Drop in your CAD, flats, prints and reference photos — they travel with the spec so the factory makes
              exactly what you drew. AI concept views (front/back, colorways) switch on once an image provider is
              configured in project secrets; uploads work fully today.
            </div>
          </div>
        </div>
        <div className="tp-art">
          {images.map(img => (
            <div className={`tp-slot filled ${img.approved ? 'approved' : ''}`} key={img.id}>
              {img.url
                ? <img src={img.url} alt={img.caption || ''} />
                : <div className="ts-thumb"><span className="ts-name">…</span></div>}
              <span className="ts-meta">
                <span className="ts-cap">{img.kind === 'generated' ? 'Concept' : (img.caption || 'Reference')}</span>
                <span>
                  <a href="#" onClick={e => { e.preventDefault(); toggleApproved(img) }}>{img.approved ? '★ approved' : '☆ approve'}</a>
                  {' · '}
                  <a href="#" onClick={e => { e.preventDefault(); removeImage(img) }}>remove</a>
                </span>
              </span>
            </div>
          ))}
          <button type="button" className="tp-slot" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="ts-lab">{uploading ? 'Uploading…' : 'Add images'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files)} />
        </div>
      </div>

      <div className="tp-grid">
        {/* Guided sections — every field live, autosaved */}
        <div className="ibx-card" style={{ margin: 0 }}>
          {sections.map(sec => {
            const filled = sec.fields.filter(f => (content[sec.key]?.[f.key] || '').trim()).length
            const done = filled === sec.fields.length
            return (
              <div className="tp-sec" key={sec.key}>
                <div className="tp-sec-h">
                  <span className="tps-t">
                    <span className={`tps-c ${done ? 'done' : 'warn'}`}>
                      {done
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                        : '!'}
                    </span>
                    {sec.title}
                  </span>
                  <span className="tps-n">{filled} of {sec.fields.length}{done ? '' : ` · ${sec.fields.length - filled} open`}</span>
                </div>
                <div className="tps-why">{sec.hint}</div>
                <div className="tp-fields">
                  {sec.fields.map(f => (
                    <div className={`tp-f ${f.multiline ? 'full' : ''}`} key={f.key}>
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
              </div>
            )
          })}
        </div>

        {/* Completeness rail */}
        <aside className="tp-side no-print">
          <div className="ibx-card">
            <div className="tp-meter">
              <div
                className={`tp-ring ${pct === 100 ? 'complete' : ''}`}
                style={{ background: `conic-gradient(${pct === 100 ? '#4A6B52' : 'var(--thread)'} 0 ${pct}%, var(--hair) ${pct}% 100%)` }}
              ><span>{pct}%</span></div>
              <div className="tpm-lab">
                {issues.length === 0
                  ? <><b>Factory-ready.</b> Nothing missing from this brief.</>
                  : <><b>{gateLabel}.</b> {issues.length} gap{issues.length === 1 ? '' : 's'} flagged below.</>}
              </div>
            </div>
          </div>

          <div className="ibx-card">
            <div className="hx-chead"><span className="hc-title">Completeness check</span><span className="hc-sub">{issues.length === 0 ? 'no gaps' : `${issues.length} gap${issues.length === 1 ? '' : 's'}`}</span></div>
            <div className="tpx-body">
              <div className="gate-row" style={{ marginTop: 0 }}>
                <span className={`gate ${gates.quoteReady ? 'ok' : ''}`}>Quote</span>
                <span className={`gate ${gates.samplingReady ? 'ok' : ''}`}>Sampling</span>
                <span className={`gate ${gates.bulkReady ? 'ok' : ''}`}>Bulk</span>
              </div>
            </div>
            {issues.length === 0 && (
              <div className="tpfl"><span className="fl-d ok" /><div><b>Nothing missing.</b> This brief is ready for a factory.</div></div>
            )}
            {(['quote', 'sampling', 'bulk', 'recommend'] as const).map(level => grouped[level].length > 0 && (
              <div key={level}>
                <div className="rail-level">{LEVEL_LABELS[level]}</div>
                {grouped[level].map((i, idx) => (
                  <div className="tpfl" key={idx}><span className="fl-d warn" /><div><b>{i.message}</b> {i.why}</div></div>
                ))}
              </div>
            ))}
          </div>

          <div className="ibx-card">
            <div className="hx-chead"><span className="hc-title">Actions</span></div>
            <div className="tpx-body">
              <button className="x-btn ghost" type="button" onClick={draftWithAI} disabled={drafting === 'busy'}>
                {drafting === 'busy' ? 'Drafting…' : 'Draft empty sections with AI'}
              </button>
              {drafting === 'setup' && (
                <p className="quiet" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                  Drafting is deployed but needs the ANTHROPIC_API_KEY secret in Supabase.
                </p>
              )}
              <button className="x-btn" type="button" onClick={() => window.print()}>
                Export tech pack (PDF)
              </button>
              <a className="x-btn" href={sourcingUrl()}>
                Find a factory for this style →
              </a>
              <button className="hx-newbtn" type="button" onClick={createOrder} disabled={converted}>
                {converted ? 'Creating order…' : 'Start a production order'}
              </button>
              <p className="quiet" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
                Starting an order seeds the Record from this brief — fabric, measurements, tolerances, QC.
              </p>
              <div className="tpx-row">
                <input value={versionNote} onChange={e => setVersionNote(e.target.value)} placeholder="Version note" />
                <button className="x-btn ghost" type="button" onClick={saveVersion}>Save v{style.current_version + 1}</button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Print-only tech pack rendering */}
      <div className="print-pack">
        <h1>{style.name}</h1>
        <p className="pp-meta">{style.category || 'Uncategorized'} · v{style.current_version || '0 (draft)'} · exported from Clewa</p>
        {images.filter(im => im.approved && im.url).length > 0 && (
          <section>
            <h2>Approved visuals</h2>
            <div style={{ display: 'flex', gap: '4mm', flexWrap: 'wrap' }}>
              {images.filter(im => im.approved && im.url).slice(0, 6).map(im => (
                <img key={im.id} src={im.url} alt={im.caption || ''} style={{ width: '42mm', height: '42mm', objectFit: 'cover', border: '0.3mm solid #ccc' }} />
              ))}
            </div>
          </section>
        )}
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
    </div>
  )
}
