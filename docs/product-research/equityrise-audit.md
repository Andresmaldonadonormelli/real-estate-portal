# EquityRise product audit (read-only)

Reference notes from a logged-in walkthrough of [equityrise.app](https://equityrise.app). Observed account: 2 properties, 3 units, sparse monthly entry (2 of 14 property-months). Many figures were marked estimated. No app data or settings were changed beyond view toggles during navigation.

This file is reference material only — not a roadmap or implementation brief.

---

## Main features and problems solved

| Area | What it does | Problem it solves |
| --- | --- | --- |
| **Dashboard** | Portfolio equity hero, cash-flow chart, property table, coming-up leases, cash + paydown | “What is my portfolio worth and earning?” in one place |
| **Properties** | Cards / table / map list of holdings | Find and compare properties quickly |
| **Property Overview** | Equity chart, position rail, occupancy strip, last-month mini P&L, money-flow and equity composition | Property health without digging into tabs |
| **Property Money** | Yearly bills (tax, insurance, 1098), regular bills, monthly ledger + CSV | Track month-by-month cash and annual fixed costs |
| **Units & tenants** | Rent at a glance, unit tiles, lease docs, other income, self-managed flag | Occupancy and rent expectation per door |
| **Loan** | Balance, next payment split, LTV/rate, escrow, payoff-by-year | Mortgage position and payoff path |
| **Work & files** | Work log (repairs / upgrades / capital), documents, bills & receipts | Maintenance history and year-end paper trail |
| **Cash-flow calendar** | 12-month × property heatmap | Spot weak or missing months across the portfolio |
| **Property scorecard** | Returns, profit sources, ranked metrics | Investor-style performance comparison |
| **Taxes & statements** | Per-property readiness, accountant exports (ZIP/PDF), statement preview, filing deadlines | Year-end packaging for an accountant |
| **Reminders** | Lease-derived dates, email modes, Done / Not for me / Open | Stay ahead of lease ends and catch-up work |
| **Record / Catch up** | Badge + banner when earlier months are missing | Push incomplete monthly entry |
| **Settings** | Profile, theme, USD/CAD, reminder email, plan, glossary | Account and display preferences |

**Not found:** a dedicated activity / timeline feed. Recent history shows up as ledger rows, the work log, the bell popover, and dashboard “Coming up.”

---

## Useful patterns for a small personal real-estate dashboard

- **One hero number with a one-line “why”** — equity as the headline; chips decompose change (loan paydown, value change, bought).
- **Current-position rail** — this month’s cash flow, portfolio value, debt (with LTV), cash in the deal.
- **Data honesty** — entered / partly entered / estimated visual states; amber “Catch up” banner; plain status pills (“As expected”, “Partly recorded”).
- **Last-month mini P&L** — Rent → Bills → before mortgage → Mortgage → Cash flow, plus a short payment footnote.
- **“Where the rent went”** — stacked bar: stays yours / the bank / bills.
- **Month ledger with status tags** and CSV export.
- **Occupancy strip** — occupancy, next lease end + days remaining, months entered; per-unit rent tiles.
- **Reminders from existing data** — leases generate dates; Done / Not for me keeps the list personal.
- **Cash-flow heatmap** — properties × months so gaps and negatives stand out.
- **Tax readiness checklist** — score ring + missing items (property tax, insurance, purchase, months entered).
- **Plain-English labels** — “Cash in the deal”, “Your equity”, “Stays yours” instead of jargon-first copy.

---

## Features that feel heavy for a small personal use case

Observed against a 1–2 property landlord workflow:

- Investor scorecard tabs (cash/door, cash-on-cash, ROE, growth) and “Underused equity” insights
- Payoff-path charts and full year-by-year amortization with escrow tracking
- Equity composition / “known values” breakdowns beyond a simple equity number
- Accountant packaging depth: year-end ZIP, scope selector, leave-out vs estimate, Form 1098, depreciation framing, filing deadlines
- Multi-currency (USD/CAD) with live FX; company/partner statement scopes
- Map view and cross-portfolio “Compare all” when only a few properties exist
- Layered record types: capital vs repair vs small upgrade; other income; property management; three separate document buckets
- Estimated-vs-entered logic as a constant visual layer when most months are still empty

---

## Screens and patterns worth referencing later

### Property-level cash flow
- Dashboard monthly cash-flow chart + last-12 totals + collapsible month table
- Property Overview: last-month mini P&L and “Money flow” (stays yours / bank / bills)
- Reports → Cash-flow calendar heatmap (property rows × 12 months, portfolio total row)

### Expenses
- Money → Yearly bills cards (tax, insurance, mortgage statements) and Regular bills
- Money → Monthly ledger (Income / Expenses / Mortgage / Cash flow + status)
- Work & files → Work log with filter chips and repair/improvement entries

### Occupancy
- Overview strip: “Fully occupied · N units”, lease end + days, months entered
- Units & tenants: Rent at a glance, unit tiles (rent + Rented), Occupied dropdown

### Recent activity
- No feed. Closest surfaces: ledger status tags, Work log list, bell (“No items need attention”), dashboard Coming up

### Reminders
- Reminders page: grouped Coming up, category tags, lead time (“3 months before”), Done / Not for me / Open, month calendar
- Dashboard Coming up card for next lease endings
- Email modes and “nudge when last month isn’t entered” live in Settings

### Taxes
- Taxes & statements: per-property readiness rings and missing-item lists
- Send to accountant: Year-end package (ZIP), Statement only (PDF + preview), Monthly summary, Custom range
- Inline statement preview table (Rent, Other income, Bills, Yearly bills, Interest, Improvements, Net before depreciation)

### Reporting
- Dashboard equity hero + Equity / Value / Debt chart ranges
- Property scorecard: yearly/all-time return, profit sources, ranked property table
- Cash-flow calendar as a portfolio scan

---

## Information hierarchy and mobile behavior

### Hierarchy
1. Greeting / primary actions (Record, Add Property)
2. Catch-up banner when months are missing
3. Equity hero + chart with Current position rail
4. Properties table + Coming up
5. Monthly cash flow + Cash + paydown
6. Collapsed “how these numbers are calculated”

Primary story is equity and cash flow. Month detail and investor numbers stay collapsed or behind “Show.” Property pages lead with equity and position, then a quick-facts strip, then last month and money flow; Money / Units / Loan / Work sit in tabs.

Visual language: rounded white panels on warm grey; green = positive, red = negative, grey/hatched = estimated; mostly wide + narrow two-column layouts.

### Mobile / narrow (simulated ~427 CSS px via browser zoom)
- Left sidebar becomes a **bottom tab bar**: Dashboard, Properties, Reports, Taxes
- Reminders drop out of the bottom bar at that width
- Header compresses to portfolio title + icon actions + Record / Add Property
- Cards stack to a single column; equity hero stays large
- Properties table keeps multiple columns and can clip — dense on small screens

---

## Walkthrough gaps

Not opened during this pass: the **Record** month modal (orange badge), property **More** menu, and **Investor numbers: Show**. Findings above are from visible surfaces only.
