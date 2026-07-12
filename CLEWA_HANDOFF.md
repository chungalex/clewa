# CLEWA — BUILD BRIEF FOR A FRESH THREAD
### Paste this whole file as the first message. Attach: CLEWA_BIBLE_v5.md (and optionally CLEWA_SESSION_SUMMARY.md). The bible is ground truth for the business; this brief is ground truth for the build.

---

## WHAT YOU ARE BUILDING

Three deliverables, in this order:
1. **A marketing site** — three pages: `index.html` (Home), plus Product and About pages, sharing one `styles.css`.
2. **A clickable product app prototype** — `app.html` + `app.css` + `app.js`, linked from the site ("Open the demo dashboard").
3. Keep the bible updated when new product decisions are made.

Clewa is the operating system for garment & apparel brands: it runs production orders (tech pack → costing → factory → quotes → terms → sampling → PO → production → QC → logistics → payment → close), and grows into the management layer a brand's whole operation lives in. Global, not Vietnam-specific. Two audiences: first-timers (guided, taught as they go) and established brands $1–10M+ (organization/management — this framing leads).

## THE BRAND SYSTEM (non-negotiable)

- **Aesthetic:** editorial luxury software — Celine/Aimé Leon Dore restraint × Linear/Cosmos software craft.
- **Color:** warm paper `#F7F4EE` / `#F1ECE2`, warm ink `#1A1714`, hairlines `#DAD3C6`. Dark sections `#16130F`. ONE accent: antique gold (thread `#A8812C` family, dim `#C5A86B`-ish). Green only for verified/paid states, sparingly.
- **Type:** Newsreader (300–400, editorial serif) for display + key numbers; Helvetica Neue for UI/body. Tracked-uppercase sans eyebrows with a gold dot.
- **The signature:** a single continuous golden SVG thread that weaves down the landing page, drawing itself on scroll, connecting sections via "knots." It is a fine clean filament — NO glow, NO drop-shadow (tried and rejected). "Follow the thread." is the hero line and closing CTA. The thread reappears as the app sidebar's spine.
- **Voice:** founder-to-founder, plain, specific, honest. NO invented customers, testimonials, or fake metrics. App mockups are "faithful product designs," which is legitimate. The myth: Clewa ← "clew," Ariadne's ball of thread through the Labyrinth.
- **Engineering rule (hard-won):** all content VISIBLE BY DEFAULT. Entrance animations only activate behind an `html.anim-ready` gate, armed by a head-script probe that confirms a real CSS transition interpolates (create a 1px div, transition opacity, check mid-values over ~8 rAF frames; on failure leave content visible). Never ship anything that starts at opacity:0 without this gate. Respect prefers-reduced-motion. No `scrollIntoView`.

## THE LANDING PAGE (section order)

1. **Hero** — "Follow the thread." (kinetic word-rise, rotating gold spool mark top-right, gold underline draws under *thread.*). Sub: holding money/designs/samples/factories/deadlines together across languages and time zones — one place you can actually follow. Trust row: Bring your own factory · Any country, any language · You keep custody of funds.
2. **Problem** — "You're trusting a factory with your money, designs and timeline — before you know what *normal* looks like." Three cards: *It lives in fifteen places · You find out too late · Nothing's on the record.* Then a jargon wall (Incoterms. AQL. FOB. MOQ…) that lights up word-by-word on scroll.
3. **Audience toggle** — "New to producing" ⇄ "Running a brand" (clickable segmented control swapping two panels: guidance/teaching/first-order-free vs one-source-of-truth/patterns/multi-factory).
4. **Guided journey** — 12 stations as knots on the thread (Product Definition → Costing → Confirm Factory (BYOF) → Inquiry & Quotes → Terms → Sampling → PO → Production → QC → Logistics → Payment → Close & Learn), each with an italic teaching hint + AI tag. Below: **interactive backward-planner** — drag the drop-date slider, the timeline recomputes in reverse, flips to a risk state: *"You'll miss the drop."*
5. **Dashboard mockup** (browser-chrome window, tabbed): Home / Calendar (timeline ⇄ month, production + campaign lanes, factory-closure striped bands incl. Tet, $ payment markers, reorder diamonds, collision alert) / Finances (KPIs, margin bars, payment schedule) / Costing / Contacts (factory rolodex with scorecards) / Inventory (Shopify-synced). Excel-export buttons everywhere.
6. **Shared surface** — brand and factory on one order, inline translation, animated bilingual conversation with typing indicator + replay.
7. **Email bridge** — forward factory email to `po-2491@in.clewa.com` → quote/terms/dates extracted into structured order fields (highlighted phrases → green-checked fields).
8. **The Record** — locked agreement (spec/price/terms each with both-party sign-off dates; price shows negotiated-down strikethrough) + dated change history. Payoff line: "If the bulk arrives at 300gsm, it's not a he-said-she-said. It's a breach of the record — and you have the receipts."
9. **Total Control / diligence features** — safe-to-pay gate, FX locked at PO, factory line-by-line acknowledgment, component inventory deduction, guided counting/QC. (These were added late — see §APP for full treatment.)
10. **Intelligence layer** (dark) — specialist AI per station; watches time not status ("You'll miss the September drop unless the sample is approved in 48 hours"); drafts hard conversations bilingually; compounds (factory scorecards).
11. **Capabilities grid** — 12 cards (incl. Negotiation support, Inspection & QC reports, Production calendar).
12. **Clewa Sourcing** (dark) — professional PAID sourcing service, never undersold: senior-led engagement, brief → audit → shortlist → negotiate → onboard. **From $7,500 retainer per category + 6–8% of production placed.** Transparent; never a markup or factory commission.
13. **Founder voice** — "I've sat on both sides of a production order… The hard part was not knowing what I didn't know until it got expensive. Clewa is what I wish I'd had."
14. **Myth** → **CTA** ("Follow the thread.", first order free) → footer with lowkey human "The people behind it" note.

## THE APP PROTOTYPE (app.html — the part investors/users click)

Shell: sidebar (brand, +New order, gold thread spine, nav with knot-dots and badges, account foot) + topbar (page title/crumb, search, bells) + toast system. Pages route by `data-go` attributes; sub-tabs within pages. All data is one coherent fictional brand: **Maison Ardent** (Mara), FW26 season, orders: Wool Overcoat 320u @ Atelier Norte (Porto 🇵🇹, Marco), Organic Tee 1,500u @ Lotus Knit (HCMC 🇻🇳, Lan), Canvas Tote 800u @ Ende Studio (Istanbul 🇹🇷, Deniz), + Seta Mills (Como 🇮🇹). Keep every number consistent across pages ($18,880 overcoat order, $8,400 deposit, $61.4k committed, 64% blended margin, Sep 1 drop, Atelier closes Aug 15–22).

**Pages:**
- **Home (the command center):** greeting + "2 things need you" + quick actions; 5-stat hairline pulse (committed, due-in-7-days gold, margin vs target, on-time %, days to ship); 7-day week strip (today highlighted, closure days striped); ranked **"Needs you" queue** ("ranked by what it blocks" — fit approval hot, safe-to-pay release, unconfirmed spec line with one-tap Nudge-in-their-language); active orders with thread-track progress; right rail: Money (paid vs committed bar + next payments), **"While you slept"** (factory-hours feed), Inventory signals.
- **Orders → Order detail:** sub-tabs Overview (backward timeline) / The Record / Samples (pinned-comment photo review, approve-gate) / Messages (translated) / Documents.
- **Calendar:** timeline ⇄ month grid; closure bands; collision alert ("Atelier closes Aug 15–22… you'd miss the Sep 1 drop"); Tet named.
- **Finances:** season KPIs, margin-by-order bars (one below target w/ AI suggestion), cash-out schedule (paid/scheduled/QC-gated), FX note.
- **Intelligence:** dark **morning briefing** (Urgent / This week / Running clean, each with reasoning + confidence note); **Readiness Gate** card — production can't book until: tech pack 22/22 ✓, BOM 9/9 no TBDs ✓, factory line-by-line confirmation (4/9, Nudge), components allocated, safe-to-pay. "This is how a BOM never goes missing."; **Anomaly watch** (invoice €5,950 ≠ record €5,664 — unagreed surcharge caught pre-payment); **Patterns** (give them the coat not the belt; early spec-lock saves ~11 days; you under-order size M by 8%).
- **Inventory (deep):** live **BOM consumption** — order shows recipe (1.9m wool · 4 buttons · 1 zipper · label · hangtag); factory reports 120/320 sewn → components auto-deduct; **wastage tracking** (buttons 4.2% vs 3% planned → "18 short around unit 290 — order 200 now and production never notices"); components & materials table (allocated vs free, multi-location: Lisbon warehouse, at-factory consignment); finished goods ⇄ Shopify (sell-through in, incoming production out, reorder pre-checked against components); guided count button (both sides see it).
- **Documents:** versioned vault, by-order/by-type tree.
- **Contacts:** rolodex cards — specialty tags, MOQ, certs, scorecards (on-time/orders/defect), key person with languages, Message.
- **PO Generator:** form left (PO#, product, factory, qty, unit price, deposit %, incoterm, ship-by) → formal PO document right, **live-recomputing** (line total, deposit math, balance-on-QC, terms, signature blocks). Export PDF / Send to factory.

## FEATURE CANON (the promises; weave everywhere)

Safe-to-pay gate (the anti-scam moment — conditions verified before money moves) · FX snapshot locked at PO · factory line-by-line acknowledgment ("nothing proceeds until it's been read") · the Record (versioned agreement) · backward planning from the drop · factory-holiday awareness (Tet) · BOM-linked component inventory with auto-deduction + wastage prediction · Shopify loop · email bridge · Excel-export everywhere ("your data is yours") · bilingual everything · Clewa never holds funds (sequences and gates; you pay directly) · rolodex with earned performance data · guided QC/counting shared brand+factory.

## STILL UNBUILT (natural next steps)
Pricing section/page (tiers in bible; first order free) · tech-pack builder demo (AI completeness as you type) · guided QC/counting flow UI · change-order flow · size-curve inventory · season-close report · community forum (deferred — "not yet").

## HOW TO WORK
Ask before adding sections/content. Keep files modest (split CSS/JS). Verify each build with the verifier. Never fabricate social proof. When the user says "make it pop," reach for craft (kinetics, interactivity, editorial detail) — never gradients/emoji/slop.
