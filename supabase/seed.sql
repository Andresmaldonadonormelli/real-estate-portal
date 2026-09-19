-- Local development seed data.
-- Creates a confirmed demo login and a small but realistic portfolio so every
-- dashboard, ledger, property, document and utility surface has content.
-- Login:  demo@reportal.test  /  password123

do $$
declare
  demo_user uuid := '11111111-1111-1111-1111-111111111111';
  prop_a uuid := '22222222-2222-2222-2222-222222222201';
  prop_b uuid := '22222222-2222-2222-2222-222222222202';
  unit_a1 uuid := '33333333-3333-3333-3333-333333333301';
  unit_a2 uuid := '33333333-3333-3333-3333-333333333302';
  unit_b1 uuid := '33333333-3333-3333-3333-333333333303';
  doc_a uuid := '44444444-4444-4444-4444-444444444401';
  m0 date := date_trunc('month', current_date)::date;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  m2 date := (date_trunc('month', current_date) - interval '2 month')::date;
  m3 date := (date_trunc('month', current_date) - interval '3 month')::date;
begin
  -- Confirmed auth user (email + password login)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', demo_user, 'authenticated', 'authenticated',
    'demo@reportal.test', crypt('password123', gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    demo_user::text, demo_user,
    jsonb_build_object('sub', demo_user::text, 'email', 'demo@reportal.test', 'email_verified', true),
    'email', now(), now(), now()
  ) on conflict (provider_id, provider) do nothing;

  -- Properties
  insert into public.properties (id, user_id, address, city, state, zip, property_type,
    estimated_value, mortgage_balance, purchase_price, purchase_date,
    monthly_mortgage_payment, management_fee_percent, mortgage_interest_rate,
    mortgage_term_years, mortgage_principal_interest_payment, mortgage_escrow_amount,
    mortgage_start_date, mortgage_recurring_enabled)
  values
    (prop_a, demo_user, '15334 Triskett Rd', 'Cleveland', 'OH', '44111', 'multi_unit',
      196000, 142000, 175000, (current_date - interval '2 year')::date,
      912, 8, 6.5, 30, 712, 200, (current_date - interval '2 year')::date, true),
    (prop_b, demo_user, '2841 Berkshire Dr', 'Columbus', 'OH', '43209', 'single_family',
      241000, 168000, 210000, (current_date - interval '1 year')::date,
      1180, 8, 6.75, 30, 980, 200, (current_date - interval '1 year')::date, true)
  on conflict (id) do nothing;

  -- Units
  insert into public.units (id, user_id, property_id, unit_number, bedroom_count,
    bathroom_count, sqft, current_rent, tenant_name, occupied, recurring_rent_enabled,
    lease_start_date, lease_end_date)
  values
    (unit_a1, demo_user, prop_a, 'Unit #1', 3, 1.5, 1500, 1425, 'Kenyetta Frazier', true, true,
      (current_date - interval '8 month')::date, (current_date + interval '4 month')::date),
    (unit_a2, demo_user, prop_a, 'Unit #2', 3, 1.5, 1500, 1425, 'Janet M Perez', true, true,
      (current_date - interval '6 month')::date, (current_date + interval '6 month')::date),
    (unit_b1, demo_user, prop_b, 'Main home', 4, 2.5, 2100, 1875, 'Marcus Webb', true, true,
      (current_date - interval '10 month')::date, (current_date + interval '2 month')::date)
  on conflict (id) do nothing;

  -- Posted transactions for the previous three months (current month left open so the
  -- app generates fresh pending-rent suggestions and posts the recurring mortgage on load).
  insert into public.transactions (user_id, property_id, unit_id, transaction_date, type,
    category, description, payee_source, amount, status, confirmed_at, source, import_key)
  select demo_user, t.property_id, t.unit_id, t.d, t.type, t.category, t.description,
    t.payee, t.amount, 'posted', t.d + time '12:00', 'seed',
    'seed:' || t.property_id || ':' || t.tag || ':' || to_char(t.d, 'YYYYMM')
  from (
    values
      (prop_a, unit_a1, m1, 'income',  'Rent',           'Rent - Unit #1',        'Kenyetta Frazier', 1425, 'rent-a1'),
      (prop_a, unit_a2, m1, 'income',  'Rent',           'Rent - Unit #2',        'Janet M Perez',    1425, 'rent-a2'),
      (prop_b, unit_b1, m1, 'income',  'Rent',           'Rent - Main home',      'Marcus Webb',      1875, 'rent-b1'),
      (prop_a, null,    m1, 'expense', 'Management Fee', 'Management fee (8%)',   'Property manager',  -228, 'fee-a'),
      (prop_b, null,    m1, 'expense', 'Management Fee', 'Management fee (8%)',   'Property manager',  -150, 'fee-b'),
      (prop_a, null,    m1, 'expense', 'Maintenance',    'In-house maintenance',  'DVC Maintenance',   -512, 'maint-a'),
      (prop_a, unit_a1, m2, 'income',  'Rent',           'Rent - Unit #1',        'Kenyetta Frazier', 1425, 'rent-a1'),
      (prop_a, unit_a2, m2, 'income',  'Rent',           'Rent - Unit #2',        'Janet M Perez',    1425, 'rent-a2'),
      (prop_b, unit_b1, m2, 'income',  'Rent',           'Rent - Main home',      'Marcus Webb',      1875, 'rent-b1'),
      (prop_a, null,    m2, 'expense', 'Management Fee', 'Management fee (8%)',   'Property manager',  -228, 'fee-a'),
      (prop_b, null,    m2, 'expense', 'Management Fee', 'Management fee (8%)',   'Property manager',  -150, 'fee-b'),
      (prop_b, null,    m2, 'expense', 'Utilities',      'Water & sewer',         'City of Columbus',   -96, 'util-b'),
      (prop_a, unit_a1, m3, 'income',  'Rent',           'Rent - Unit #1',        'Kenyetta Frazier', 1425, 'rent-a1'),
      (prop_a, unit_a2, m3, 'income',  'Rent',           'Rent - Unit #2',        'Janet M Perez',    1425, 'rent-a2'),
      (prop_b, unit_b1, m3, 'income',  'Rent',           'Rent - Main home',      'Marcus Webb',      1875, 'rent-b1'),
      (prop_a, null,    m3, 'expense', 'Management Fee', 'Management fee (8%)',   'Property manager',  -228, 'fee-a'),
      (prop_b, null,    m3, 'expense', 'Insurance',      'Landlord policy',       'Foremost',          -142, 'ins-b')
  ) as t(property_id, unit_id, d, type, category, description, payee, amount, tag)
  on conflict (user_id, import_key) do nothing;

  -- A document with an upcoming expiry so the Action Center has a real reminder.
  insert into public.documents (id, user_id, property_id, unit_id, category, title,
    file_name, storage_path, mime_type, file_size, document_date, expires_at, reminder_days)
  values (doc_a, demo_user, prop_a, unit_a1, 'Insurance', 'Landlord policy 2026',
    'policy-2026.pdf', demo_user::text || '/' || prop_a::text || '/policy-2026.pdf',
    'application/pdf', 184320, (current_date - interval '11 month')::date,
    (current_date + interval '25 day')::date, 60)
  on conflict (id) do nothing;

  -- Utility directory entries (no passwords stored).
  insert into public.utility_accounts (user_id, property_id, utility_type, provider,
    account_number, username_email, login_url, autopay, responsibility, billing_cycle)
  values
    (demo_user, prop_a, 'Electric', 'Cleveland Public Power', '4021-88', 'owner@reportal.test',
      'https://www.cpp.org', true, 'Owner', 'Monthly'),
    (demo_user, prop_b, 'Water', 'City of Columbus', '77-2213', 'owner@reportal.test',
      'https://columbus.gov/utilities', false, 'Tenant', 'Monthly')
  on conflict do nothing;
end $$;
