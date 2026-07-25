// draft-tech-pack — drafts guided-section content from the style's description.
// Every value returned is a SUGGESTION for the user to review; nothing is
// written to the style by this function. Honest setup state without the key.
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-5'

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const { style_id } = await req.json()
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u.user) return json({ ok: false, error: 'unauthorized' }, 403, cors)
    const { data: style } = await admin.from('styles').select('*').eq('id', style_id).single()
    if (!style || style.owner !== u.user.id) return json({ ok: false, error: 'not found' }, 404, cors)

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ ok: false, setup: true, error: 'Drafting needs the ANTHROPIC_API_KEY secret configured.' }, 503, cors)

    const { data: secs } = await admin.from('style_sections').select('section, content').eq('style_id', style_id)
    const existing: Record<string, unknown> = {}
    for (const r of secs || []) existing[r.section] = r.content

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system:
          'You draft garment tech-pack sections for a fashion brand. You receive a product description and any ' +
          'sections already filled. Return ONLY valid JSON: an object keyed by section (overview, fit, materials, ' +
          'colorways, construction, measurements, trims, artwork, labels, qc) where each value is an object of ' +
          'field->string suggestions matching typical tech-pack content. Rules: NEVER invent specific measurements, ' +
          'GSM values, tolerances or trim quantities as fact — where a number is required, propose a typical value ' +
          'explicitly marked like "e.g. 220gsm — confirm". Do not overwrite intent: leave fields the user already ' +
          'filled OUT of your response. Plain professional language a factory can price from.',
        messages: [{
          role: 'user',
          content: `Category: ${style.category || 'unknown'}\nProduct: ${style.name}\nDescription: ${style.description || '(none)'}\nAlready filled: ${JSON.stringify(existing)}`,
        }],
      }),
    })
    if (!resp.ok) return json({ ok: false, error: 'provider error' }, 502, cors)
    const out = await resp.json()
    let drafts = {}
    try { drafts = JSON.parse(out.content?.[0]?.text || '{}') } catch { /* non-JSON reply */ }
    return json({ ok: true, drafts }, 200, cors)
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 500, cors)
  }
})

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })
}
