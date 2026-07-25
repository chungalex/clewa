# Clewa

**The shared production workspace for clothing brands and factories.** Brands run orders on a
dual-signed Record; factories join through one link — no account, any phone, their language.
Clewa never holds or moves money.

Live: [clewa site](https://chungalex.github.io/clewa/) · [platform](https://chungalex.github.io/clewa/platform/) · target domain **clewa.io**

## What's in this repo

| Path | What it is |
|---|---|
| `*.html`, `styles.css` | The marketing site (16 pages) — served as-is from the repo root |
| `app.html`, `app.css`, `app.js` | The interactive product demo (Maison Ardent) — a design showcase, clearly bridged to the real product |
| `platform-src/` | **The real product** — React + TypeScript + Vite SPA |
| `platform/` | Built output of platform-src, committed so GitHub Pages serves it at `/platform/` |
| `supabase/functions/` | Edge functions: `translate-message`, `ask-clewa` (deployed; execute when `ANTHROPIC_API_KEY` secret exists) |
| `supabase/migrations-log-*.sql` | Every schema change, in order, as applied to production |
| `ops/` | `backup.sh` (nightly full-data dump, token lives outside the repo) · parked GitHub Actions keep-alive |
| `ROADMAP.md` | The scope commitment, milestones, and shipped-state log |
| `CLEWA_DESIGN_HANDOFF.md` | The original design brief this product was built from |

## Architecture

- **Hosting**: GitHub Pages from `main` (static site + built SPA). No server of our own.
- **Backend**: Supabase — Postgres with row-level security on every table, Auth (email+password),
  Storage (private buckets, owner-scoped paths), Edge Functions.
- **The trust boundary**: brands act through authenticated RLS-scoped queries. Factories act ONLY
  through `security definer` RPCs keyed by an invite token (`factory_*` functions) — they never touch
  tables or storage directly, revoked tokens get nothing, and they can never see costs, margins, or
  other orders.
- **Timestamps are the product**: every cross-party event (signatures, confirmations, submissions,
  reports) is dated — the raw material of the future factory-performance layer.

## Develop

```bash
cd platform-src
npm install
npx vite            # dev server (auth against production Supabase)
npx tsc -b && npx vite build --outDir ../platform   # build for deploy
```

Deploy = merge to `main`, GitHub Pages picks it up (~1 min). Working branch: `dev`.

## Operations

- **Backups**: `ops/backup.sh` nightly via scheduled task → `~/clewa-backups/`, 14-day retention.
- **Keep-alive**: daily scheduled-task ping; durable GitHub Actions version parked in `ops/`
  (needs a `workflow`-scoped token to activate).
- **Secrets**: `ANTHROPIC_API_KEY` and `RESEND_API_KEY` go in Supabase → Edge Functions → Secrets.
  Nothing secret lives in this repo; the publishable Supabase key in the frontend is public by design.

## Status

v1.0.0 — every screen and feature from the design handoff that can exist without external
credentials is live and verified. See `ROADMAP.md` for the shipped log and what's gated.
