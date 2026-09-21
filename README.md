# Real Estate Portal

Private owner portal built with Next.js, Supabase, and Vercel.

## Current version
- Supabase authentication
- Dashboard with live portfolio activity
- Editable properties and units
- Monthly rent suggestions for occupied units, pending until confirmed
- Automatic management-fee expense when rent is confirmed, using the fee % saved on each property
- Automatic monthly mortgage ledger entry using the monthly payment saved on each property
- Ledger with manual CRUD, Doorvest CSV bulk import, duplicate protection, filters, and export
- Ledger / Statements / Documents tabs with shared property filter
- Private property document storage in Supabase
- Utilities directory by property, without storing actual passwords

## Database update
Before deploying this version, run these in the Supabase SQL Editor (in order, skipping any already applied):
- `SUPABASE_V2_UPDATE.sql`
- later `V220` / `V226` / `V228` / `V229` / `V230` / `V240` / `V241` / `V242` scripts as needed
- **`V243_PLAID_BANK_SYNC.sql`** for bank linking (Plaid tables + unseen-import columns)

## Bank linking (Plaid)
Set these on the host (Vercel or similar). Do not commit secret values:
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (`sandbox` for testing, `production` for live Chase)
- `PLAID_TOKEN_ENCRYPTION_KEY` (long random string; keep stable across deploys)
- `PLAID_WEBHOOK_URL` (`https://your-domain/api/plaid/webhook`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)

Flow: Account → Link bank → assign each account to a property → new imports appear in Ledger and on the Ledger badge.
