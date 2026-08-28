# Real Estate Owner Portal - Interactive V1

This version connects the existing Dashboard, Properties and Ledger UI to Supabase.

## Working in this version

- Supabase email/password authentication
- Persistent Properties
- Persistent Units
- Persistent Transactions
- Add/edit/delete properties
- Add units
- Add/edit/delete transactions
- Property/unit transaction tagging
- Dashboard totals calculated from saved data
- Monthly ledger groups, table view, filtering and CSV export
- Light/Dark/System theme

## Required Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The second value should be the Supabase browser-safe publishable key (`sb_publishable_...`). Never put a secret/service-role key in a `NEXT_PUBLIC_` variable.

## Supabase database

Run `SUPABASE_SETUP.sql` once in Supabase SQL Editor. It creates/adds the V1 fields and Row Level Security policies used by the app.

## Deploy

The Next.js app lives in this `real-estate-portal` folder. In Vercel, keep the Root Directory set to `real-estate-portal` if the GitHub repository contains this folder one level down.
