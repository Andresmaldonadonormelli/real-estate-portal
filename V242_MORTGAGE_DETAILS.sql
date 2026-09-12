alter table public.properties
  add column if not exists mortgage_interest_rate numeric(6,3),
  add column if not exists mortgage_term_years integer,
  add column if not exists mortgage_principal_interest_payment numeric(12,2),
  add column if not exists mortgage_escrow_amount numeric(12,2);
