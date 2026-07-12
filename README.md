# Handoff: Clewa — Production OS for Fashion Brands

## Overview
Clewa is a system of record + coordination tool for fashion brands running garment production with factories (any country, any language). This handoff covers the complete design: a 13-page marketing site and a full product demo (brand-side app + factory phone view). The product's core concepts: **the Record** (dual-signed agreement with change history), **safe-to-pay gating** (Clewa never holds funds — it verifies conditions; the brand pays factories directly), **the shared surface** (brand and factory see the same order, auto-translated), **AI as a switchable layer** (system of record works with AI off), and **BOM-linked inventory** with a Shopify sell-through loop.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, NOT production code to copy directly. The task is to **recreate these designs in a real codebase** using an appropriate stack (no environment exists yet — recommend a modern web stack, e.g. Next.js/React + Postgres, chosen at your discretion). The vanilla-JS patterns in the prototypes (data-go routing, data-toast, localStorage persistence) are demo conveniences — replace them with real routing, state management, APIs and auth.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copywriting and interactions are final design intent. Recreate pixel-faithfully. All copy is deliberate (calm, plain-language, no fake proof/testimonials — keep this voice).

## Structure

### Marketing site (static pages, shared design system)
| File | Purpose |
|---|---|
| index.html | Homepage: hero + orders card, problem, before/after toggle, Record/safe-to-pay/shared-surface rows, intelligence, inventory, guided/pro, capability grid, sourcing, security, 4-tier pricing, FAQ, founder/myth |
| features.html | Feature catalog grouped by Make/Track/Communicate/Intelligence/Library |
| tour.html | Interactive feature walkthroughs (backward planner, FX lock, safe-to-pay, BOM deduction, translation) |
| factory-view.html | TWO synced iPhone frames (React): Marco's Portuguese phone + brand's English phone; tapping "Confirmar" on his updates hers live. Phones scale to viewport (see fitPhones()) |
| security.html | Security & trust posture (no fund custody, encryption, export rights) |
| pricing.html | Free first order → Atelier $59 → Maison $199 (featured) → House custom; monthly/annual toggle (annual = 2 months free); honest comparison table (protections in every tier) |
| about.html | The clew/Ariadne name story, beliefs, "how we make money and how we refuse to" |
| sourcing.html | Clewa Sourcing service: 3-stage engagement, $7,500+ retainer + 6–8% terms |
| contact.html | mailto-based contact (hello@clewa.com), no backend |
| start.html | Email-capture start page (currently localStorage only — NEEDS a real waitlist/auth backend) |
| changelog.html, privacy.html, terms.html, 404.html | Support pages. Terms governing law = Delaware placeholder, confirm with counsel |

### Product demo (app.html + app.css + app-v2.css + app.js + inv-grid.js)
Single-page shell, sidebar routing via [data-go] → section[data-page]. Pages: Home dashboard (guided 12-step walkthrough, focus band, whose-move turn tracker, KPIs, bento), Orders + Order detail, Calendar (backward planner), Finances, Inventory (Shopify loop card, intelligent grid, components/allocation, size curve), Samples (ladder, POM measure-vs-spec, conditional approval), Quality, Shared workspace, Inbox, Messages (translated), Tech pack builder (guided gap-fixing with suggestions, completeness ring, persists to localStorage 'clewa-tp-fixed'), Ask Clewa, Intelligence, Planning, Season close, Team & roles (factory guests), Documents, Contacts, PO generator (live-mirrored form).

Key demo behaviors to productionize:
- **Guided vs Pro mode** toggle; per-page coach strips + glossary (see coach/terms maps in app.js)
- **AI-off mode**: body.ai-off hides AI surfaces (persisted 'clewa-ai' key) — the system of record must remain fully functional
- **Tech pack gap-fixing**: .tpv.miss fields open inline helpers with suggested fills; fixing updates ring 82→91→100%, flips dashboard/pipeline hooks live (see applyFix/updateMeter in app.js)
- **Sample approval with condition**: approval writes the condition to the record (both-party sign-off)
- **Whose-move tracker**: items split "waiting on you" vs "waiting on them", each deep-linking

## Design Tokens (both surfaces share this palette)
- Paper: #FFFFFF, #F7F5F1, #F0EDE6 · Ink: #141311, #3E3C37, #5F5D56
- Hairlines: #E6E3DD, #D9D5CC
- Gold (brand accent): #9A7B22, light #C9A24E, bg rgba(154,123,34,0.08); app uses --thread #8C6A1B family
- Dark sections: #16130D / #262019; on-dark text #F4F1EA / #A8A092
- Sage (success): #4A6B52, bg #ECF1EA, line #C2D1BD · Error: #9c3b2f · Shopify green: #5E8E3E
- Type: Newsreader (300/400/500 + italics) for display; Helvetica Neue/system sans for UI. Marketing h1 clamp(36px,5.6vw,66px), letter-spacing -0.03em; section h2 clamp(26px,3.6vw,40px); app UI 11–14px range
- Radius: cards 14–16px, inputs 8–10px, pills 999px. Buttons: 13px 22px padding, 10px radius
- Reveal animation: .rv → opacity/translateY(16px), 0.6s cubic-bezier(.2,.7,.2,1), IntersectionObserver, respects prefers-reduced-motion

## Interactions & Behavior (selected)
- Marketing nav: sticky, blur backdrop, mobile burger menu <900px
- Pricing billing toggle swaps data-m/data-a values on .amt/.bn nodes
- factory-view sync: tiny pub/sub store (window.__fvListeners) shared by two React roots — in production this is a realtime channel (websocket) between two sessions
- Deck of demo toasts: [data-toast] shows transient toast — replace with real actions
- PO generator: form inputs mirror live into the document preview (bindPO in app.js)

## State Management (production)
Entities: Brand, Order (stages: techpack→quote→PO→sampling→production→QC→ship→delivered), Record lines (dual sign-off + change history), Payments (milestone conditions, FX locked at PO), Samples (type/round/POMs/decisions), Tech packs (sections/fields/completeness), Inventory (finished + components, BOM consumption, allocations, size curves), Factory guests (order-scoped permissions, language pref), Messages (auto-translation both ways), Shopify connection (read-only scopes; sell-through in, incoming/restock out).
Hard invariants: Clewa NEVER holds/moves funds; factory guests never see costs/margins/other factories; every record change is logged and dual-signed; all data exportable (Excel/PDF); AI features degrade gracefully when disabled.

## Assets
- Favicon: inline SVG data-URI (dark rounded square, gold "C") — in every page head
- og-image.png (1200×630, generated) — referenced as https://clewa.io/og-image.png
- ios-frame.jsx — iPhone device frame component (design scaffold; replace with your own device mock or screenshots in production marketing)
- No stock photos; all product visuals are hand-built HTML/CSS mockups
- Fonts via Google Fonts (Newsreader)

## Files in this bundle
All marketing pages, app demo files (app.html/app.css/app-v2.css/app.js/inv-grid.js), ios-frame.jsx, og-image.png, sitemap.xml, robots.txt. Source-of-truth product spec docs from the project root are included: CLEWA_HANDOFF.md, CLEWA_MARKETING_PLAN.md, CLEWA_CHANGELOG.md.
