import { useEffect, useRef, useState } from 'react'
import { supabase, SUPABASE_URL } from './supabase'
import { toast } from './toast'

function photoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/sample-photos/${path}`
}

export type Sample = {
  id: string
  round: number
  kind: 'proto' | 'fit' | 'pp' | 'shipment'
  status: 'requested' | 'submitted' | 'approved' | 'changes'
  brand_note: string | null
  factory_note: string | null
  decided_at: string | null
  created_at: string
  photos?: { path: string; caption: string | null }[]
}

export const KIND_LABELS = { proto: 'Proto', fit: 'Fit', pp: 'Pre-production', shipment: 'Shipment' }
export const STATUS_LABELS = {
  requested: 'Requested — waiting on factory',
  submitted: 'Submitted — your review',
  approved: 'Approved',
  changes: 'Changes requested',
}

/**
 * The sample ladder, shared by both sides.
 * Brand: requests rounds, approves or requests changes. A decision with a
 * condition writes that condition to the Record, brand-signed.
 * Factory: marks a round submitted, with a note. No table access — RPCs only.
 */
export default function Samples(props:
  | { mode: 'brand'; orderId: string; owner: string }
  | { mode: 'factory'; token: string }) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [uploadFor, setUploadFor] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (props.mode === 'brand') {
      const [{ data }, { data: ph }] = await Promise.all([
        supabase.from('samples').select('*').eq('order_id', props.orderId).order('round'),
        supabase.from('sample_photos').select('sample_id, storage_path, caption').eq('order_id', props.orderId),
      ])
      const photosBySample = new Map<string, { path: string; caption: string | null }[]>()
      for (const x of (ph as { sample_id: string; storage_path: string; caption: string | null }[]) || []) {
        if (!photosBySample.has(x.sample_id)) photosBySample.set(x.sample_id, [])
        photosBySample.get(x.sample_id)!.push({ path: x.storage_path, caption: x.caption })
      }
      setSamples(((data as Sample[]) || []).map(sm => ({ ...sm, photos: photosBySample.get(sm.id) || [] })))
    } else {
      const { data } = await supabase.rpc('factory_get_samples', { p_token: props.token })
      setSamples((data as Sample[]) || [])
    }
  }

  useEffect(() => {
    load()
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 8000)
    return () => clearInterval(tick)
  }, [props.mode === 'brand' ? props.orderId : props.token])

  async function requestRound(kind: Sample['kind']) {
    if (props.mode !== 'brand') return
    setBusy('new')
    const nextRound = samples.length ? Math.max(...samples.map(s => s.round)) + 1 : 1
    await supabase.from('samples').insert({
      order_id: props.orderId, owner: props.owner, round: nextRound, kind,
    })
    setBusy(null)
    load()
  }

  async function decide(s: Sample, status: 'approved' | 'changes') {
    if (props.mode !== 'brand') return
    setBusy(s.id)
    const note = (notes[s.id] || '').trim()
    await supabase.from('samples').update({
      status, brand_note: note || null, decided_at: new Date().toISOString(),
    }).eq('id', s.id)
    // An approval condition is part of the agreement — put it on the Record.
    if (status === 'approved' && note) {
      await supabase.from('record_lines').insert({
        order_id: props.orderId, owner: props.owner, category: 'terms',
        content: `${KIND_LABELS[s.kind]} sample round ${s.round} approved on condition: ${note}`,
        brand_signed_at: new Date().toISOString(),
      })
    }
    setBusy(null)
    if (status === 'approved') toast(note ? 'Approved — condition written to the record' : 'Sample approved')
    load()
  }

  async function uploadPhotos(sampleId: string, files: FileList | null) {
    if (props.mode !== 'brand' || !files) return
    setBusy(sampleId)
    for (const f of Array.from(files).slice(0, 6)) {
      const path = `${props.owner}/${props.orderId}/${sampleId}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
      const { error } = await supabase.storage.from('sample-photos').upload(path, f)
      if (!error) {
        await supabase.from('sample_photos').insert({
          sample_id: sampleId, order_id: props.orderId, owner: props.owner, storage_path: path, caption: f.name,
        })
      }
    }
    setBusy(null)
    toast('Photos added — your factory sees them on their link')
    load()
  }

  async function submit(s: Sample) {
    if (props.mode !== 'factory') return
    setBusy(s.id)
    await supabase.rpc('factory_submit_sample', {
      p_token: props.token, p_sample: s.id, p_note: (notes[s.id] || '').trim(),
    })
    setBusy(null)
    load()
  }

  return (
    <div>
      {samples.length === 0 && (
        <p className="quiet">
          {props.mode === 'brand'
            ? 'No sample rounds yet. Request one and your factory sees it on their link.'
            : 'No sample rounds requested yet.'}
        </p>
      )}
      {samples.map(s => (
        <div className="sample-row" key={s.id}>
          <div className="sample-head">
            <strong>{KIND_LABELS[s.kind]} — round {s.round}</strong>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {props.mode === 'brand' && (
                <a href="#" style={{ fontSize: 11.5 }} onClick={e => {
                  e.preventDefault()
                  setUploadFor(s.id)
                  fileRef.current?.click()
                }}>{busy === s.id ? 'uploading…' : '+ photos'}</a>
              )}
              <span className={`sample-status ${s.status}`}>{STATUS_LABELS[s.status]}</span>
            </span>
          </div>
          {(s.photos || []).length > 0 && (
            <div className="sample-photos">
              {(s.photos || []).map((ph, pi) => (
                <a href={photoUrl(ph.path)} target="_blank" rel="noreferrer" key={pi}>
                  <img src={photoUrl(ph.path)} alt={ph.caption || 'sample photo'} loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {s.factory_note && <p className="sample-note">Factory: {s.factory_note}</p>}
          {s.brand_note && <p className="sample-note">Brand: {s.brand_note}{s.status === 'approved' ? ' (on the record)' : ''}</p>}

          {props.mode === 'brand' && s.status === 'submitted' && (
            <div className="sample-actions">
              <input
                placeholder="Optional note — an approval condition goes on the record"
                value={notes[s.id] || ''}
                onChange={e => setNotes({ ...notes, [s.id]: e.target.value })}
              />
              <button className="btn primary small" disabled={busy === s.id} onClick={() => decide(s, 'approved')}>Approve</button>
              <button className="btn ghost small" disabled={busy === s.id} onClick={() => decide(s, 'changes')}>Request changes</button>
            </div>
          )}

          {props.mode === 'factory' && (s.status === 'requested' || s.status === 'changes') && (
            <div className="sample-actions">
              <input
                placeholder="Note for the brand — what's in this round?"
                value={notes[s.id] || ''}
                onChange={e => setNotes({ ...notes, [s.id]: e.target.value })}
              />
              <button className="btn primary small" disabled={busy === s.id} onClick={() => submit(s)}>Mark submitted</button>
            </div>
          )}
        </div>
      ))}
      {props.mode === 'brand' && (
        <input ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={e => { if (uploadFor) uploadPhotos(uploadFor, e.target.files) }} />
      )}
      {props.mode === 'brand' && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['proto', 'fit', 'pp', 'shipment'] as const).map(k => (
            <button key={k} className="btn ghost small" disabled={busy === 'new'} onClick={() => requestRound(k)}>
              + Request {KIND_LABELS[k]} round
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
