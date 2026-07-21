# Clewa — Product Roadmap & Scope Commitment
*Updated 2026-07-18. This is the durable scope decision: full platform, built as vertical slices through one lifecycle.*

## The canonical lifecycle (everything connects to this spine)

Style → Tech pack → Sourcing / existing factory → Inquiry & quote → Record → Sampling → PO → Production → QC → Payment readiness → Shipment → Inventory arrival → Sell-through → Reorder → Factory performance history

## Committed product areas (all 19 — sequencing ≠ removal)

AI concept & tech-pack builder · Sourcing intake & internal ops · Factory profiles & relationships · Quotes, costing, negotiation history · Orders & POs · Versioned Record & change orders · Mobile factory workspace · Samples & approvals · Messages, translation, communication capture · Documents & asset versioning · Calendar, milestones, lead times, closures · QC & inspections · Payment readiness & financial planning · BOM, components, inventory · Shopify demand & reorder intelligence · Integrations · Factory performance data & network · Ask Clewa & operational intelligence · Team roles, permissions, activity history

**Building principle:** vertical slices. Each area gets a genuinely working minimum version — connected to the shared data model, with permissions, audit history, honest labels for incomplete depth — before any area gets deep. No decorative features in the production app, ever. A slice ships only after a live browser walkthrough + adversarial probing.

**Not building now (recorded decisions):** brand scorecards/symmetric ratings (operational events stay timestamped; never scored or exposed — revisit when private factory scorecards launch) · public factory rankings · Clewa holding funds (never).

## Sequencing

**Status 2026-07-19 — SHIPPED and live:** design system · Record versioning & change orders · invite hardening/revocation · translation infra (function deployed; executes on key) · sourcing intake + internal pipeline · tech-pack builder (Milestone A.1: guided sections, 4-category completeness engine, PDF, convert to sourcing/order) · quotes (two-sided, accept→Record) · samples w/ conditional approval · dual-verdict QC · payment readiness · documents · PO export · CSV export · inventory (BOM auto-deduction from factory production reports, cover/stockout math) · contacts rolodex w/ earned stats · intelligence briefing + anomaly watch (computed, cited, AI-off) · Ask Clewa (deployed, key-gated) · planning/line plan + season close report · per-order activity trail · while-you-were-away feed · factory nudge · settings + in-app guide · full demo account (demo@clewa.io).

**Blocked only on credentials:** translation/Ask-Clewa execution + all email (ANTHROPIC_API_KEY, RESEND_API_KEY in Supabase secrets) · clewa.io DNS · Shopify OAuth (Milestone E) · image generation provider.

- **Milestone A — Concept → Tech pack:** styles, versions, documents (see spec below)
- **Milestone B — Factory inquiry, quotes, PO, full sampling workflow**
- **Milestone C — Production calendar depth, QC checklists, payment readiness**
- **Milestone D — Products, SKUs, BOM, inventory foundation**
- **Milestone E — Shopify + reorder intelligence**
- **Milestone F — Communication/file/calendar/accounting/Canva integrations** (connector framework; Shopify OAuth may pull earlier into D/E)
- **Milestone G — Private factory performance foundation**

**Early-beta bar:** the complete 16-step path (style → tech pack → sourcing/factory → quote → Record → invite → translated comms → samples → PO → calendar → QC → payment readiness → shipment → Shopify demand → reorder recommendation → performance history preserved).

---

# Milestone A proposal: Concept-to-Production v1 (for review before coding)

**The magic moment to optimize:** *arrive with an idea, leave with a structured, factory-ready brief and a sourcing request.* Everything in v1 serves that; everything else waits.

## UX (guided, not spreadsheet)

1. **New Style** → choose start: describe it / upload references / upload existing tech pack / template. (Sketch-to-render and on-model ship later; upload works day one.)
2. **Concept canvas** — reference images + (when a provider is configured) generated front/back/detail/colorway views, each labeled **"Concept visualization — not a manufacturing drawing."** Regeneration never overwrites an approved image; approving pins a version.
3. **Suggested attributes** — category, silhouette, fabric family, colorway, construction notes extracted as *suggestions*, each with source + AI flag + confirm/edit/reject. Nothing auto-confirms. Clewa never invents measurements/GSM/composition/tolerances — it asks.
4. **Guided sections** (v1 set): Overview · Visuals · Fit & silhouette · Materials & BOM · Colorways · Construction · Measurements/POM · Trims · Artwork placement · Labels & packaging · QC tolerances. Remaining sections (grading, wash, factory questions) land in A.2.
5. **Completeness rail** — category-aware issues classified as *Required before quote / before sampling / before bulk / Recommendation / Contradiction*, each with a plain-language "why the factory needs this." v1 covers 4 categories deeply: jersey/knit tops, woven tops, outerwear, canvas bags.
6. **Actions:** Export PDF · **Find a factory for this style** (pre-filled sourcing request) · Attach to existing factory/order (creates order + seeds the Record from confirmed attributes only).

## Schema (additive; nothing existing changes)

`styles` (id, owner, name, category, status, current_version) · `style_versions` (immutable snapshots) · `style_images` (kind: reference|generated|sketch; approved flag; caption; storage path) · `style_attributes` (key, value, source: user|ai|import, ai_generated, confidence, confirmed_at, version) · `style_sections` (section key, content jsonb, status) · `style_issues` (severity class, message, why, resolved_at) · `generation_jobs` (provider, model, prompt, status, cost meta) — provider-agnostic via a `generate-image` edge function mirroring the translate-message pattern (secrets server-side; graceful "setup required" state without keys). BOM/measurement_points/size_specs tables land with their sections; `sourcing_requests.style_id` links the funnel. Every AI/extracted value carries source, AI flag, confidence, confirmation status, timestamps, provider/model — already the house pattern.

## Boundaries

- **A.1 (build first):** styles + versions + reference uploads (Supabase Storage, signed URLs) + guided sections + 4-category completeness + PDF export + convert-to-sourcing/order + generation interface with setup state.
- **A.2:** generation live (provider key via secrets), colorway variations, remaining sections, factory section-level comments/questions on shared styles.
- **Cost gate:** generation requires an account; per-user daily limits; costs logged per job.
