import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://cxchrwccojvurqcxakyw.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6amZ7V2RrOF6sVjHYw_0DA_2cHTdS8o'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Order = {
  id: string
  owner: string
  name: string
  factory_name: string | null
  factory_country: string | null
  quantity: number | null
  unit_price: number | null
  currency: string
  stage: 'techpack' | 'quote' | 'po' | 'sampling' | 'production' | 'qc' | 'ship' | 'delivered' | 'closed'
  ship_by: string | null
  created_at: string
}

export type RecordLine = {
  id: string
  order_id: string
  owner: string
  category: 'spec' | 'price' | 'terms'
  content: string
  brand_signed_at: string | null
  factory_signed_at: string | null
  created_at: string
}

export const STAGES: Order['stage'][] = [
  'techpack', 'quote', 'po', 'sampling', 'production', 'qc', 'ship', 'delivered', 'closed',
]

export const STAGE_LABELS: Record<Order['stage'], string> = {
  techpack: 'Tech pack',
  quote: 'Quote',
  po: 'PO',
  sampling: 'Sampling',
  production: 'Production',
  qc: 'QC',
  ship: 'Shipping',
  delivered: 'Delivered',
  closed: 'Closed',
}
