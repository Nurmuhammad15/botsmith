-- Admin can ban a user (for N hours or permanently), unban, and delete an account.
-- Supabase Auth refuses sign-in and token refresh while auth.users.banned_until is in the future.

drop function public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, full_name text, role public.app_role,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  bots bigint, purchases bigint, sales bigint, banned_until timestamptz
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
         case when u.banned_until > now() then u.banned_until end
  from public.profiles p
  join auth.users u on u.id = p.id
  order by u.created_at desc;
end $$;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- p_hours = null bans for life (100 years). Ends all of the user's sessions.
create function public.admin_ban_user(p_user uuid, p_hours integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_hours is not null and (p_hours < 1 or p_hours > 876000) then
    raise exception 'invalid_duration';
  end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    raise exception 'cannot_change_admin';
  end if;
  update auth.users
  set banned_until = now() + case when p_hours is null then interval '100 years'
                                  else make_interval(hours => p_hours) end
  where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  delete from auth.sessions where user_id = p_user;
end $$;

create function public.admin_unban_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update auth.users set banned_until = null where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
end $$;

-- Deletes the account with its bots, reviews, chats and favourites. Refused when the user has
-- orders or withdrawals (financial history must stay), so ban those users instead.
create function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    raise exception 'cannot_change_admin';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'user_not_found';
  end if;
  if exists (select 1 from public.orders where buyer_id = p_user or seller_id = p_user)
     or exists (select 1 from public.withdrawals where seller_id = p_user) then
    raise exception 'user_has_history';
  end if;
  delete from auth.users where id = p_user;
end $$;

revoke execute on function public.admin_ban_user(uuid, integer), public.admin_unban_user(uuid),
  public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_ban_user(uuid, integer), public.admin_unban_user(uuid),
  public.admin_delete_user(uuid) to authenticated;
