-- Sellers give their Telegram username when they register, and the admin panel can show a user's
-- contact and profile details.

-- profiles.username is the seller's Telegram @username (unique, '@' + 5-32 letters/digits/_).
-- It is taken from the sign-up metadata when valid and still free.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_username text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
begin
  if v_username is null
     or v_username !~ '^@[A-Za-z0-9_]{5,32}$'
     or exists (select 1 from public.profiles where username = v_username) then
    v_username := null;
  end if;
  insert into public.profiles (id, role, full_name, phone, username)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'seller' then 'seller'::public.app_role
         else 'buyer'::public.app_role end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    v_username
  );
  return new;
end $$;

-- Lets the sign-up form tell a visitor that a Telegram username is already taken.
create function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = p_username);
$$;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

drop function public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, full_name text, role public.app_role,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  bots bigint, purchases bigint, sales bigint, banned_until timestamptz,
  phone text, username text, headline text, location text, experience_years smallint,
  bio text, website text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, u.email::text, p.full_name, p.role, u.created_at, u.last_sign_in_at,
         u.email_confirmed_at is not null,
         (select count(*) from public.bots b where b.seller_id = p.id),
         (select count(*) from public.orders o
           where o.buyer_id = p.id and o.status in ('paid', 'delivering', 'done')),
         (select count(*) from public.orders o
           where o.seller_id = p.id and o.status in ('paid', 'delivering', 'done')),
         case when u.banned_until > now() then u.banned_until end,
         p.phone, p.username, p.headline, p.location, p.experience_years, p.bio, p.website
  from public.profiles p
  join auth.users u on u.id = p.id
  where not u.is_anonymous
  order by u.created_at desc;
end $$;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
