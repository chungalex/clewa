// translate-message — translates one order message, preserving the original.
// Secrets: ANTHROPIC_API_KEY must be set in Supabase Edge Function secrets.
// Never alters numbers, dates, SKUs, measurements or prices; logs provider/model.
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-haiku-4-5-20251001'

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { message_id, invite_token } = await req.json()
    if (!message_id) return json({ ok: false, error: 'message_id required' }, 400, cors)

    const { data: msg } = await admin.from('order_messages').select('*').eq('id', message_id).single()
    if (!msg) return json({ ok: false, error: 'not found' }, 404, cors)

    // Access check: either a valid invite token for this order, or the brand's own JWT.
    let authorized = false
    if (invite_token) {
      const { data: inv } = await admin.from('order_invites')
        .select('order_id, language').eq('token', invite_token).single()
      authorized = !!inv && inv.order_id === msg.order_id
    } else {
      const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
      if (jwt) {
        const { data: u } = await admin.auth.getUser(jwt)
        authorized = !!u.user && u.user.id === msg.owner
      }
    }
    if (!authorized) return json({ ok: false, error: 'unauthorized' }, 403, cors)

    // Direction: factory messages → English; brand messages → factory's language.
    let target = 'English'
    if (msg.sender === 'brand') {
      const { data: inv } = await admin.from('order_invites')
        .select('language').eq('order_id', msg.order_id).limit(1).maybeSingle()
      target = inv?.language || ''
      if (!target) return json({ ok: true, skipped: 'no factory language set' }, 200, cors)
    }

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) {
      await admin.from('order_messages').update({
        translation_status: 'failed',
        translation_meta: { error: 'ANTHROPIC_API_KEY not configured' },
      }).eq('id', message_id)
      return json({ ok: false, error: 'translation not configured' }, 503, cors)
    }

    await admin.from('order_messages').update({ translation_status: 'pending' }).eq('id', message_id)

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system:
          'You translate garment-production messages between a fashion brand and a factory. ' +
          'Translate faithfully and plainly. NEVER alter numbers, dates, SKUs, measurements, quantities or prices — copy them exactly. ' +
          'Keep garment terminology precise (e.g. GSM, POM, AQL, tech pack, grading, colourway stay as standard trade terms). ' +
          'Return ONLY the translation, no preamble.',
        messages: [{ role: 'user', content: `Translate into ${target}:\n\n${msg.body}` }],
      }),
    })
    if (!resp.ok) {
      const detail = await resp.text()
      await admin.from('order_messages').update({
        translation_status: 'failed',
        translation_meta: { provider: 'anthropic', model: MODEL, error: detail.slice(0, 300) },
      }).eq('id', message_id)
      return json({ ok: false, error: 'provider error' }, 502, cors)
    }
    const out = await resp.json()
    const translated = out.content?.[0]?.text?.trim()
    await admin.from('order_messages').update({
      translated_body: translated || null,
      translated_lang: target,
      translation_status: translated ? 'done' : 'failed',
      translation_meta: { provider: 'anthropic', model: MODEL, version: 1 },
    }).eq('id', message_id)

    return json({ ok: true, translated_lang: target }, 200, cors)
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 500, cors)
  }
})

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}
