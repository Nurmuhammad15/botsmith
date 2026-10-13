-- Lets the signed-in user's browser find out that an admin banned the account, so the app can sign
-- out immediately and tell the user (Supabase Auth only blocks new sign-ins and token refreshes).
-- Returns the end of an active ban, or NULL when the account is not banned.
create or replace function public.my_ban_status()
returns timestamptz
language sql stable security definer set search_path = public as $$
  select u.banned_until from auth.users u where u.id = auth.uid() and u.banned_until > now();
$$;

revoke execute on function public.my_ban_status() from public, anon;
grant execute on function public.my_ban_status() to authenticated;
