-- RE Portal V2.4.5: expose notifications to authenticated PostgREST clients.
-- Run once after V244_NOTIFICATIONS.sql.

grant usage on schema public to authenticated;
grant select, insert, update on table public.notifications to authenticated;
revoke delete on table public.notifications from authenticated;

-- The V244 table can exist in Postgres before PostgREST's schema cache sees it.
-- Reloading makes the table available to the signed-in browser immediately.
notify pgrst, 'reload schema';
