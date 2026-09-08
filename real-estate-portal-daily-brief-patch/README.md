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
Before deploying this version, run `SUPABASE_V2_UPDATE.sql` in the Supabase SQL Editor.

V2.1.2: Lucide navigation icons, Doorvest-inspired mint active states, reliable rent-check test preview.
