/**
 * The category-aware brain of the tech-pack builder.
 * Every issue explains WHY the factory needs it — plain language, no jargon walls.
 * Clewa never invents values; it only points at what's missing or contradictory.
 */

export const CATEGORIES = [
  'Jersey & knit tops',
  'Woven tops & shirts',
  'Outerwear & coats',
  'Bags & accessories',
  'Other',
] as const
export type Category = (typeof CATEGORIES)[number]

export type Field = { key: string; label: string; placeholder: string; multiline?: boolean }
export type Section = { key: string; title: string; hint: string; fields: Field[] }

const base = (category: Category): Section[] => [
  {
    key: 'overview',
    title: 'Product overview',
    hint: 'What is it, in one factory-readable paragraph.',
    fields: [
      { key: 'summary', label: 'Summary', placeholder: 'Boxy heavyweight tee with dropped shoulder, garment-dyed…', multiline: true },
      { key: 'season', label: 'Season / drop', placeholder: 'FW27' },
      { key: 'quantity', label: 'Target quantity', placeholder: '500' },
      { key: 'target_price', label: 'Target unit cost', placeholder: 'USD 12.50' },
    ],
  },
  {
    key: 'fit',
    title: 'Fit & silhouette',
    hint: 'How it should sit on the body — the factory patterns from this.',
    fields: [
      { key: 'silhouette', label: 'Silhouette', placeholder: 'Boxy / relaxed / tailored / oversized…' },
      { key: 'fit_notes', label: 'Fit notes', placeholder: 'Dropped shoulder ~4cm, cropped at high hip…', multiline: true },
      { key: 'size_range', label: 'Size range', placeholder: 'XS–XL' },
    ],
  },
  {
    key: 'materials',
    title: 'Materials & fabric',
    hint: 'Composition and weight are the first two things any factory prices.',
    fields: [
      { key: 'main_fabric', label: 'Main fabric', placeholder: '100% organic cotton jersey' },
      { key: 'weight', label: 'Fabric weight', placeholder: '220gsm' },
      { key: 'secondary', label: 'Secondary materials', placeholder: 'Rib: 2x2 cotton/elastane…', multiline: true },
      { key: 'wash_finish', label: 'Wash / finish', placeholder: 'Enzyme wash, garment-dyed…' },
    ],
  },
  {
    key: 'colorways',
    title: 'Colorways',
    hint: 'Name + reference code per color. Pantone TCX travels best.',
    fields: [
      { key: 'colors', label: 'Colorways', placeholder: 'Washed black (19-4008 TCX), Ecru (11-0105 TCX)', multiline: true },
    ],
  },
  {
    key: 'construction',
    title: 'Construction details',
    hint: 'Seams, stitching, hems — what makes it yours.',
    fields: [
      { key: 'details', label: 'Construction notes', placeholder: 'Flatlock seams, 2cm blind hem, bartack at pocket corners…', multiline: true },
    ],
  },
  {
    key: 'measurements',
    title: 'Measurements / POM',
    hint: 'Points of measure for the base size. The factory grades from these.',
    fields: [
      { key: 'pom', label: 'Key measurements (base size)', placeholder: 'Chest 58cm · Length 68cm · Sleeve 22cm · Shoulder 52cm', multiline: true },
      { key: 'tolerance', label: 'Tolerances', placeholder: '±1cm body, ±0.5cm collar' },
    ],
  },
  {
    key: 'trims',
    title: 'Trims & hardware',
    hint: 'Everything sewn on or attached — with quantities per unit.',
    fields: [
      { key: 'trims', label: 'Trims list', placeholder: '1× woven neck label, 1× care label, 4× corozo buttons 15mm…', multiline: true },
    ],
  },
  {
    key: 'artwork',
    title: 'Artwork & placement',
    hint: 'What prints/embroiders where, at what size.',
    fields: [
      { key: 'artwork', label: 'Artwork & placements', placeholder: 'Chest print 28×8cm, 1-color puff; upload files as references', multiline: true },
    ],
  },
  {
    key: 'labels',
    title: 'Labels & packaging',
    hint: 'Legal + brand: care, origin, folding, polybag, hangtag.',
    fields: [
      { key: 'labels', label: 'Labels & packaging', placeholder: 'Care label with fiber content + origin, single fold, recycled polybag…', multiline: true },
    ],
  },
  {
    key: 'qc',
    title: 'QC requirements',
    hint: 'What you will inspect on delivery — agreed before production starts.',
    fields: [
      { key: 'qc_notes', label: 'QC requirements', placeholder: 'AQL 2.5, no untrimmed threads, measurement spot-check 10%…', multiline: true },
    ],
  },
]

export function sectionsFor(category: Category | string | null): Section[] {
  const s = base((category as Category) || 'Other')
  if (category === 'Outerwear & coats') {
    s[2].fields.push(
      { key: 'lining', label: 'Lining', placeholder: 'Cupro twill, matched to shell color' },
      { key: 'insulation', label: 'Insulation / interlining', placeholder: '100g recycled poly fill; fusible at collar & placket' },
    )
    s[6].fields.push({ key: 'zippers', label: 'Zippers & closures', placeholder: 'YKK Excella two-way #5, matte black' })
  }
  if (category === 'Jersey & knit tops') {
    s[2].fields.push({ key: 'shrinkage', label: 'Shrinkage allowance', placeholder: 'Max 5% after 3 washes' })
  }
  if (category === 'Woven tops & shirts') {
    s[6].fields.push({ key: 'buttons', label: 'Buttons', placeholder: '11× mother-of-pearl 10mm incl. spare' })
    s[4].fields.push({ key: 'interlining', label: 'Collar & cuff interlining', placeholder: 'Medium fusible, crisp finish' })
  }
  if (category === 'Bags & accessories') {
    s[1].hint = 'Dimensions and carry — the factory patterns from this.'
    s[1].fields = [
      { key: 'dimensions', label: 'Dimensions', placeholder: 'W40 × H32 × D12 cm' },
      { key: 'carry', label: 'Handles / straps', placeholder: '2× 60cm self-fabric handles + detachable webbing strap' },
    ]
    s[6].fields.push({ key: 'hardware', label: 'Hardware', placeholder: 'Antique brass D-rings ×2, magnetic snap ×1' })
    s[5].fields[0].placeholder = 'Base W40 × H32 × D12 · handle drop 24cm'
  }
  return s
}

export type Issue = {
  level: 'quote' | 'sampling' | 'bulk' | 'recommend'
  message: string
  why: string
}

export const LEVEL_LABELS: Record<Issue['level'], string> = {
  quote: 'Needed before a quote',
  sampling: 'Needed before sampling',
  bulk: 'Needed before bulk production',
  recommend: 'Recommended',
}

type Content = Record<string, Record<string, string>>
const get = (c: Content, s: string, f: string) => (c[s]?.[f] || '').trim()

export function completeness(category: Category | string | null, c: Content): Issue[] {
  const issues: Issue[] = []
  const need = (cond: boolean, level: Issue['level'], message: string, why: string) => {
    if (cond) issues.push({ level, message, why })
  }

  // Before a quote: what any factory needs to price at all.
  need(!get(c, 'overview', 'summary'), 'quote', 'Describe the product',
    'A factory cannot price what it cannot picture. Two sentences is enough to start.')
  need(!get(c, 'overview', 'quantity'), 'quote', 'Target quantity missing',
    'Unit price moves heavily with volume — no quantity, no meaningful quote.')
  need(!get(c, 'materials', 'main_fabric'), 'quote', 'Main fabric not specified',
    'Fabric is usually 50–70% of the cost. Composition first, supplier later.')
  if (category !== 'Bags & accessories') {
    need(!get(c, 'materials', 'weight'), 'quote', 'Fabric weight not specified',
      'A 160gsm and a 240gsm tee are different products with different prices.')
  }

  // Before sampling: what the pattern room needs.
  need(!get(c, 'fit', 'silhouette') && !get(c, 'fit', 'dimensions'), 'sampling', 'Fit / silhouette not described',
    'The first sample is cut from this. Vague in, vague out — and a wasted round.')
  need(!get(c, 'measurements', 'pom'), 'sampling', 'No measurements provided',
    'Without points of measure the factory guesses your fit — and the sample round is spent discovering that.')
  need(!get(c, 'colorways', 'colors'), 'sampling', 'No colorways listed',
    'Lab dips and fabric sourcing start from these; late colors delay everything.')

  // Before bulk: what protects you at delivery.
  need(!get(c, 'measurements', 'tolerance'), 'bulk', 'No tolerances set',
    "Without tolerances you can't reject an off-spec delivery — this is your QC leverage.")
  need(!get(c, 'trims', 'trims'), 'bulk', 'Trims not listed with quantities',
    'Factories order trims early; missing quantities cause mid-production stoppages.')
  need(!get(c, 'labels', 'labels'), 'bulk', 'Labels & packaging unspecified',
    'Care/origin labels are legally required in most markets; packaging affects landed cost.')
  need(!get(c, 'qc', 'qc_notes'), 'bulk', 'QC requirements not agreed',
    'Inspection criteria agreed after production is a negotiation; agreed before is a standard.')

  // Category-specific.
  if (category === 'Outerwear & coats') {
    need(!get(c, 'materials', 'lining'), 'quote', 'Lining not specified',
      'On outerwear the lining is a major cost line — quotes without it are fiction.')
    need(!get(c, 'trims', 'zippers'), 'sampling', 'Zipper spec missing',
      'Zipper quality defines how the piece feels; cheap substitutions happen when unspecified.')
  }
  if (category === 'Jersey & knit tops') {
    need(!get(c, 'materials', 'shrinkage'), 'bulk', 'No shrinkage allowance',
      'Jersey shrinks. Without an agreed max, post-wash sizing disputes are unwinnable.')
  }
  if (category === 'Woven tops & shirts') {
    need(!get(c, 'trims', 'buttons'), 'sampling', 'Button spec missing',
      'Button count and size affect both cost and the placket pattern.')
  }
  if (category === 'Bags & accessories') {
    need(!get(c, 'trims', 'hardware'), 'quote', 'Hardware not specified',
      'On bags, hardware often costs more than fabric — a quote without it is meaningless.')
    need(!get(c, 'fit', 'dimensions'), 'quote', 'Dimensions missing',
      'Bag pricing starts from material consumption, which starts from dimensions.')
  }

  // Recommendations.
  need(!get(c, 'overview', 'target_price'), 'recommend', 'Add a target unit cost',
    'Factories negotiate more honestly against a stated target than an open question.')
  need(!get(c, 'materials', 'wash_finish') && category !== 'Bags & accessories', 'recommend', 'Consider specifying wash/finish',
    'Finish changes hand-feel and shade — unspecified means factory default.')
  need(!get(c, 'artwork', 'artwork'), 'recommend', 'No artwork/placement noted',
    'If there is any print or embroidery, placement and size belong on the record.')

  return issues
}

/** Ready-to-share score: how far through the gates this style is. */
export function gateStatus(issues: Issue[]) {
  const quote = issues.filter(i => i.level === 'quote').length
  const sampling = issues.filter(i => i.level === 'sampling').length
  const bulk = issues.filter(i => i.level === 'bulk').length
  return {
    quoteReady: quote === 0,
    samplingReady: quote === 0 && sampling === 0,
    bulkReady: quote === 0 && sampling === 0 && bulk === 0,
    counts: { quote, sampling, bulk, recommend: issues.filter(i => i.level === 'recommend').length },
  }
}
