-- A ban can carry a reason that the admin writes and the banned user sees.

alter table public.profiles
  add column ban_reason text check (ban_reason is null or char_length(ban_reason) <= 500);

-- p_hours = null bans for life (100 years). Ends all of the user's sessions.
drop function public.admin_ban_user(uuid, integer);
create function public.admin_ban_user(p_user uuid, p_hours integer, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_hours is not null and (p_hours < 1 or p_hours > 876000) then
    raise exception 'invalid_duration';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then raise exception 'reason_too_long'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    raise exception 'cannot_change_admin';
  end if;
  update auth.users
  set banned_until = now() + case when p_hours is null then interval '100 years'
                                  else make_interval(hours => p_hours) end
  where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  update public.profiles set ban_reason = nullif(btrim(p_reason), '') where id = p_user;
  delete from auth.sessions where user_id = p_user;
end $$;

create or replace function public.admin_unban_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update auth.users set banned_until = null where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  update public.profiles set ban_reason = null where id = p_user;
end $$;

-- What the banned user's browser shows: end of the ban and the admin's reason.
create function public.my_ban_info()
returns table (banned_until timestamptz, reason text)
language sql stable security definer set search_path = public as $$
  select u.banned_until, p.ban_reason
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.id = auth.uid() and u.banned_until > now();
$$;

revoke execute on function public.admin_ban_user(uuid, integer, text), public.my_ban_info()
  from public, anon;
grant execute on function public.admin_ban_user(uuid, integer, text), public.my_ban_info()
  to authenticated;

drop function public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, full_name text, role public.app_role,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  bots bigint, purchases bigint, sales bigint, banned_until timestamptz,
  phone text, username text, headline text, location text, experience_years smallint,
  bio text, website text, ban_reason text
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
         p.phone, p.username, p.headline, p.location, p.experience_years, p.bio, p.website,
         case when u.banned_until > now() then p.ban_reason end
  from public.profiles p
  join auth.users u on u.id = p.id
  where not u.is_anonymous
  order by u.created_at desc;
end $$;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
