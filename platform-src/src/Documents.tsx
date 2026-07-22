import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

type Doc = {
  id: string
  storage_path: string
  filename: string
  size_bytes: number | null
  doc_type: string
  created_at: string
}

const DOC_TYPES: Record<string, string> = {
  tech_pack: 'Tech packs', invoice: 'Invoices', lab_dip: 'Lab dips',
  artwork: 'Artwork', shipping: 'Shipping', contract: 'Contracts', other: 'Other',
}

/** Order documents — tech packs, invoices, lab dips. Private storage, signed links. */
export default function Documents({ orderId, owner }: { orderId: string; owner: string }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('other')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('order_documents').select('*')
      .eq('order_id', orderId).order('created_at', { ascending: false })
    setDocs((data as Doc[]) || [])
  }
  useEffect(() => { load() }, [orderId])

  async function upload(files: FileList | null) {
    if (!files) return
    setUploading(true)
    for (const f of Array.from(files).slice(0, 10)) {
      const path = `${owner}/${orderId}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
      const { error } = await supabase.storage.from('order-docs').upload(path, f)
      if (!error) {
        await supabase.from('order_documents').insert({
          order_id: orderId, owner, storage_path: path, filename: f.name, size_bytes: f.size, doc_type: docType,
        })
      }
    }
    setUploading(false)
    load()
  }

  async function open(d: Doc) {
    const { data } = await supabase.storage.from('order-docs').createSignedUrl(d.storage_path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(d: Doc) {
    await supabase.storage.from('order-docs').remove([d.storage_path])
    await supabase.from('order_documents').delete().eq('id', d.id)
    load()
  }

  function fmtSize(b: number | null) {
    if (!b) return ''
    return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
  }

  return (
    <div>
      {docs.length === 0 && (
        <p className="quiet">Tech packs, invoices, lab dips, artwork — everything for this order in one place, dated.</p>
      )}
      {Object.keys(DOC_TYPES).filter(t => docs.some(d => (d.doc_type || 'other') === t)).map(t => (
        <div key={t}>
          <div className="quiet" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '10px 0 2px' }}>{DOC_TYPES[t]}</div>
          {docs.filter(d => (d.doc_type || 'other') === t).map(d => (
            <div className="doc-row" key={d.id}>
              <a href="#" onClick={e => { e.preventDefault(); open(d) }}><strong>{d.filename}</strong></a>
              <span className="quiet" style={{ fontSize: 12 }}>
                {fmtSize(d.size_bytes)} · {d.created_at.slice(0, 10)}
                {' · '}<a href="#" onClick={e => { e.preventDefault(); remove(d) }}>remove</a>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: docs.length ? 12 : 10, alignItems: 'center' }}>
        <select value={docType} onChange={e => setDocType(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--hair-2)', borderRadius: 8, fontSize: 12.5, background: 'var(--paper)' }}>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn ghost small" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : '+ Upload documents'}
        </button>
      </div>
      <input ref={fileRef} type="file" multiple hidden onChange={e => upload(e.target.files)} />
    </div>
  )
}
