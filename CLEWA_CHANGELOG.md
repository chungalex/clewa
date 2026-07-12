# CLEWA — FULL CHANGELOG & STATE OF BUILD
### Hand this to a fresh chat: "Read CLEWA_CHANGELOG.md and CLEWA_HANDOFF.md, then continue." Everything below reflects the project as of this session.

---

## 0. THE ONE-LINE SCOPE (important — this was reset this session)
Clewa is a **production AND inventory operating system for product brands** — garments, apparel, accessories, footwear, soft goods. It works for **local OR overseas** production, with **your own factory or one Clewa sources**. "Don't get burned wiring money abroad" is the sharpest *wedge*, NOT the ceiling. Equal pillars: operational control, inventory intelligence, financial clarity, and trust/safety. Geography is a setting, never a gate.

**Non-negotiable truths (from the bible):**
- Clewa **NEVER holds or moves money.** It verifies a milestone's conditions are met and tells you it's *safe to pay*; you pay the factory **directly**. Never use "release/process payment" language.
- Global: any country, any language. Bring your own factory. You keep custody of funds.
- No fake customers, testimonials, logos, or metrics. Mockups are honest product designs.
- Aesthetic: editorial-luxury (Celine/Aimé Leon Dore × Linear/Stripe). White/black/gold only. Newsreader serif + Helvetica. No gradients, no emoji, no AI-slop. The golden thread is the signature motif.

---

## 1. FILE MAP (what each file is)
**Marketing site (canonical):**
- `index.html` — main landing page (self-contained CSS/JS). THE primary marketing page. (Formerly `Clewa - Home.html`.)
- `features.html` — every feature/tab explained in depth. (Formerly `Clewa - Features.html`.)
- `tour.html` — interactive demos (backward planner, FX lock, BOM deduction, live translation). (Formerly `Clewa - Tour.html`.)
- `security.html` — Security & trust page (5 commitments, safe-to-pay mini demo, who-sees-what table, practices grid, straight-answers FAQ). NEW.

**Retired (moved to `archive/legacy/`, still openable — support CSS/JS copied alongside):**
- Old marketing set: `index.html`, `product.html`, `about.html`, `thread.js`, `interactions.js`.
- Explorations: `Home v2.html`, `Clewa MVP.html` + `mvp.js`, `Dashboard v2/v3/v4.html`, `palette-study.html`, `app-v3.css`, `app-v4.css`.

**The product (clickable demo app):**
- `app.html` — the full navigable app (the live demo). ~18+ pages/tabs. Sidebar brand now links back to `index.html`.
- `app.css` — app styles (inherits white/black/gold tokens from `styles.css`). `app.js` — routing, toggles, coach, PO/planner logic.
- `styles.css` and `app-v2.css` are still live dependencies of `app.html` — do not archive them.

**Docs:** `CLEWA_HANDOFF.md` (build brief), `CLEWA_SESSION_SUMMARY.md`, `CLEWA_MARKETING_PLAN.md`, this file.
**Bible:** `uploads/CLEWA_BIBLE_v6.md` (source of truth; scope updated to v6.1 this session).

---

## 2. THE APP (app.html) — EVERY PAGE/TAB THAT EXISTS
Sidebar grouped into: **Make & plan · Track · Intelligence · Library**, with the golden thread running down the core nav. Topbar has: **Customize** panel button, **Guided/Pro** toggle, **AI assist** on/off toggle.

1. **Home** — greeting, "today's focus" black banner, KPI pulse, shared-with-factory card, bento (orders, money, this week, while-you-slept, inventory signals).
2. **Tech packs (builder)** — garment/BOM/measurements/labels sections, 82% completeness ring, AI gap-flagging, **artwork/sketch upload slots**.
3. **Orders** → **Order detail** sub-tabs: Overview · Record · **Contract** (NEW) · Samples (pinned-comment fit review) · Messages · Documents. Also includes **change-order flow** (dual re-sign) in the Record area.
4. **Inbox** — factory emails parsed onto orders; **3 connection options** (paste / forward address / optional inbox connect).
5. **Messages** — live translated chat (type EN, factory reads their language), thread list, translation toggle.
6. **Calendar** — **backward planner** (set launch date → computes order-by date), timeline ⇄ month grid, factory-closure bands, collision alerts.
7. **Finances** — KPIs, margin-by-order bars, cash-out schedule, **multi-currency / FX-locked-at-PO** table.
8. **Intelligence** — morning briefing, readiness gate, anomaly watch, patterns.
9. **Ask Clewa** — AI assistant scoped to your data with cited sources, suggested prompts.
10. **Inventory** — BOM consumption, **WIP tracker** (cut→sewn→finished→QC→packed), **size-curve matrix**, **allocation guardrails**, **deadstock/aging**, **guided dual-accountability count**, Shopify-synced finished goods + reorder alerts.
11. **Quality** — shared AQL inspection (both sides), photo checklist, **returns/RMA loop** feeding factory scorecards.
12. **Shared view** — same order on both screens + "who sees what" privacy boundary table.
13. **Planning** — open-to-buy budget, line plan (carryover vs newness), design pipeline (concept→ready), projected spend.
14. **Season close** — auto-compiled season report (KPIs, went-well/slipped, factory scorecards, carry-forward).
15. **Team & roles** — staff seats with role-scoped views, factory guests, **avatars** (monogram + curated colors / photo upload).
16. **Documents** — versioned vault, by-order/by-type tree.
17. **Contacts** — factory rolodex with performance scorecards.
18. **PO generator** — form → live formal PO document, export/send.

**App-wide systems:**
- **AI assist toggle** — turning off hides all AI surfaces (Intelligence, Ask Clewa, predictions); app remains a full system of record. Persisted.
- **Guided / Pro toggle** — Guided shows a per-page **coach strip** (what this page is / why it helps) + a **jargon glossary** per page; declutters home. Persisted.
- **Customize panel** — show/hide nav sections and home tiles, persisted to localStorage.

---

## 3. WHAT CHANGED THIS SESSION (chronological-ish)
- **Scope reset** in the bible (v6.1): from "overseas-factory safety net" → "production + inventory OS, local or overseas." Updated CLEWA IN 60 SECONDS, the problem framing, and the one-paragraph explanation.
- **Payment-language fix** across app.html + index.html + marketing plan: removed all "release/process payment" wording; now "safe to pay / you pay the factory directly / Clewa never holds or moves money."
- **Built the Contract feature** into the order detail (draft a clear factory agreement; new "Contract" sub-tab). Added `--sage` tokens to `body.app` to fix badge colors.
- **Three NEW marketing pages** built ground-up, self-contained, white/black/gold: `Clewa - Home.html`, `Clewa - Features.html`, `Clewa - Tour.html`. Unified nav across them + to `app.html`. Robust reveal-animation script (never renders blank).
- **Home page sections** (current state): nav · hero (golden thread motif, fixed button wrapping, scope chips) · proof ribbon · problem (3 scenes) · **"Without/With Clewa" interactive section** (rebuilt: anchored to one "Week 6 thin fabric" moment, toggle, outcome strips with time/money/leverage stats) · trust feature rows (Record, Safe-to-pay, Shared surface) · intelligence/Ask Clewa · inventory depth · guided/pro · capabilities · sourcing · security · pricing (first order free) · **FAQ (rebuilt: 13 Qs grouped into 4 themes)** · founder + clew myth · CTA · footer.
- **Tour page** interactive demos: backward planner (pick launch → order-by date), FX-lock slider (drag to see the gap you'd have eaten), BOM slider (slide production → buttons run short at unit 290), live translation input.
- **Features page**: every tab explained + an "essentials" strip (Shopify, reorder warnings, etc.); factory-invite ease section.
- **Many UI/UX fixes**: text contrast darkened (`--ink-3` → #5F5D56), nav thread line stops correctly, page-scroll min-height fix, removed flag emojis, fixed several overlap bugs.

---

## 4. TOP BUILD IDEAS QUEUED FOR THE NEXT CHAT
1. ~~**Inventory grid view ("spreadsheet, but intelligent")**~~ — ✅ BUILT (`inv-grid.js` + grid styles in `app.css`). Inventory page now has a **The grid ⇄ Overview** view switch. The grid is a keyboard-navigable, Excel-feel editable spreadsheet (arrow keys, Enter/F2 to edit, type-to-replace, ⌘D + toolbar Fill-down, click-header sort, formula bar with plain-language explanation, precedent-tracing that highlights the cells a computed value depends on, totals row, Export to Excel). Two datasets via tabs: **Finished goods** (On hand · /wk · Incoming[linked] · Lead wks · Cover[calc] · Reorder-at[calc] · Order qty · Status) and **Components & trims** (On hand · Allocated[linked] · Free[calc] · Per-unit · Covers[calc] · Lead · Order · Status). Editing any white cell live-recomputes every dependent cell + the AI insight strip. Cell colour legend: white=editable, gold=linked from orders, tint=computed.
2. Carry the "moment + stakes" treatment from Home's Without/With section onto Features/Tour.
3. Decide fate of the OLD marketing set (index/product/about) — retire or redirect to the new pages.
4. Security & trust page (the buyer-question content exists in FAQ; could expand to its own page).
5. Sample-review visual + worked-example "sandbox" order for first-timers.
6. Mobile/offline (PWA) consideration — flagged as v2-platform, not now.

---

## 5. HOW TO RESUME
In the new chat: **"Read CLEWA_CHANGELOG.md, CLEWA_HANDOFF.md, and uploads/CLEWA_BIBLE_v6.md, then continue. The canonical marketing page is `index.html`; the product demo is `app.html`."** Then give your next instruction.

---

## 6. JULY 2026 CLEANUP SESSION
- **Restructured the project**: retired the old marketing set + all dashboard explorations to `archive/legacy/` (with copies of their CSS/JS so they still open); promoted the canonical set to clean names — `index.html`, `features.html`, `tour.html`; fixed all cross-links.
- **Built `security.html`** (queued item): five commitments (never hold money / on the record / read-receipts / factory sees only what you share / your data is yours), inline safe-to-pay gate demo, who-sees-what boundary table, practical-layer grid, 5-question security FAQ. Linked from all page navs + index footer.
- App sidebar brand links back to the site.

## 7. GO-LIVE PASS (final)
- **Tour gained its flagship demo**: Safe-to-pay gate (`tour.html#pay`) — click three conditions (QC / invoice-matches-record / packing list) and watch the seal flip from "Holding — don't send anything yet" to "Safe to pay — wire the factory directly." Sits between FX and BOM demos. Meta descriptions updated (5 demos now).
- **security.html brought to parity**: favicon + theme-color + OG meta, mobile burger nav + mnav, full 4-column footer (matching index), burger JS.
- **index.html footer** Product column now: Features / Interactive tour / Security & trust / Live demo.
- **404.html** added — branded "You've lost the thread." page with animated thread, links home + demo, noindex.
