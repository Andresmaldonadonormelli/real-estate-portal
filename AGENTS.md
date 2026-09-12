# Real Estate Portal

## Product goal
Give independent rental-property owners a fast, calm view of portfolio performance, property health, rent, expenses, documents, and actions that need attention.

## Architecture map
- `app/page.tsx`: portfolio dashboard
- `app/properties/page.tsx`: property list and property/unit setup
- `app/properties/[id]/page.tsx`: property workspace and tabs
- `app/ledger/page.tsx`: Ledger, Statements, and Documents workspace
- `components/dashboard`: shared dashboard modules, including Actions
- `components/property`: property overview, units, improve, and documents
- `components/ledger`: ledger, statements, and document workflows
- `components/charts`: shared chart rendering and interaction
- `lib`: Supabase access, accounting rules, formatting, and financial calculations
- `app/globals.css`: legacy/base rules
- `app/product-system.css`: current product-system layer loaded last

## Design rules
- Use Inter and existing typography, spacing, radius, surface, semantic, and chart tokens.
- Do not add arbitrary colors or one-off text sizes.
- Use green for positive performance, red for negative performance, orange for warnings, and neutral text for normal conditions.
- Currency shown in the product uses whole dollars with no cents.
- Dark and light themes must remain equally legible.
- Mobile interactions must not depend on hover. Preserve 44px touch targets where practical.
- Reuse shared controls, document rows, Actions, and chart components before adding variants.

## Data rules
- Preserve posted ledger history when changing or deleting recurring configurations.
- Archive user records instead of hard-deleting them unless a migration explicitly requires otherwise.
- Cache shared Supabase property and unit queries. Avoid repeating storage URL requests.
- Property ordering should remain consistent across navigation surfaces.

## Patch workflow
- Start from the latest user-provided baseline only.
- Inspect targeted files, make grouped edits, run one production build, and package only changed files.
- Do not add patch-note files or override stylesheets.
- Fix the owning rule or component instead of adding escalating CSS overrides.
