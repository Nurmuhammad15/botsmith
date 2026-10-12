-- Admin overview: platform totals and a per-user activity list. Admin-only, read-only.
-- Platform income is the 3% fee taken from seller withdrawals (see request_withdrawal).

create function public.admin_stats()
returns table (
  users bigint, sellers bigint, bots_total bigint, bots_published bigint,
  orders_paid bigint, sales_total bigint, fee_paid bigint, fee_pending bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where role = 'seller'),
    (select count(*) from public.bots),
    (select count(*) from public.bots where status = 'published'),
    (select count(*) from public.orders where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(amount), 0)::bigint from public.orders
      where status in ('paid', 'delivering', 'done')),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'paid'),
    (select coalesce(sum(fee), 0)::bigint from public.withdrawals where status = 'pending');
end $$;

create function public.admin_users()
returns table (
  id uuid, email text, full_name text, role public.app_role,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  bots bigint, purchases bigint, sales bigint
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
           where o.seller_id = p.id and o.status in ('paid', 'delivering', 'done'))
  from public.profiles p
  join auth.users u on u.id = p.id
  order by u.created_at desc;
end $$;

revoke execute on function public.admin_stats(), public.admin_users() from public, anon;
grant execute on function public.admin_stats(), public.admin_users() to authenticated;
