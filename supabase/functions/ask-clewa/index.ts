// ask-clewa — answers questions grounded ONLY in the caller's own production data.
// Secrets: ANTHROPIC_API_KEY in Supabase Edge Function secrets. Without it,
// returns a clear setup state — never a fake answer.
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-5'

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
    const { question } = await req.json()
    if (!question || String(question).length > 500) {
      return json({ ok: false, error: 'question required (max 500 chars)' }, 400, cors)
    }
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u.user) return json({ ok: false, error: 'unauthorized' }, 403, cors)
    const uid = u.user.id

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ ok: false, setup: true, error: 'Ask Clewa needs the ANTHROPIC_API_KEY secret configured.' }, 503, cors)

    // Ground the answer in this user's data only.
    const [orders, lines, samples, quotes, qc, reports, products, components] = await Promise.all([
      admin.from('orders').select('id,name,factory_name,factory_country,quantity,unit_price,currency,stage,ship_by').eq('owner', uid),
      admin.from('record_lines').select('order_id,category,content,brand_signed_at,factory_signed_at,superseded_by').eq('owner', uid),
      admin.from('samples').select('order_id,round,kind,status,brand_note,factory_note').eq('owner', uid),
      admin.from('quotes').select('order_id,source,quantity,unit_price,currency,lead_time_days,status').eq('owner', uid),
      admin.from('qc_checks').select('order_id,item,brand_status,factory_status,factory_note').eq('owner', uid),
      admin.from('production_reports').select('order_id,units,source,created_at').eq('owner', uid),
      admin.from('products').select('name,sku,on_hand,weekly_sales,safety_stock').eq('owner', uid),
      admin.from('components').select('name,unit,on_hand,on_order,location').eq('owner', uid),
    ])
    const context = {
      today: new Date().toISOString().slice(0, 10),
      orders: orders.data, record_lines: lines.data, samples: samples.data,
      quotes: quotes.data, qc_checks: qc.data, production_reports: reports.data,
      products: products.data, components: components.data,
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system:
          'You are Ask Clewa, a production copilot for a fashion brand. Answer ONLY from the JSON data provided — ' +
          'it is the brand\'s real orders, records, samples, quotes, QC and inventory. Cite the specific order/record/number ' +
          'behind every claim. If the data cannot answer the question, say exactly that. Never invent orders, prices, dates or ' +
          'factory behavior. Never agree to commercial terms on the user\'s behalf. Be concise and concrete.',
        messages: [{
          role: 'user',
          content: `My production data:\n${JSON.stringify(context)}\n\nQuestion: ${question}`,
        }],
      }),
    })
    if (!resp.ok) return json({ ok: false, error: 'provider error' }, 502, cors)
    const out = await resp.json()
    return json({ ok: true, answer: out.content?.[0]?.text || '' }, 200, cors)
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 500, cors)
  }
})

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })
}
