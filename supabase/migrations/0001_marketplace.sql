-- BotSmith marketplace schema: profiles, bots, orders, reviews, withdrawals, support chat.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Money is stored as whole UZS in bigint. All balance-changing operations go through
-- SECURITY DEFINER functions so clients can never write prices, statuses or balances directly.

create extension if not exists pgcrypto;

create type public.app_role as enum ('buyer', 'seller', 'admin');
create type public.bot_status as enum ('pending', 'published', 'rejected');
create type public.order_status as enum ('pending_payment', 'paid', 'delivering', 'done', 'cancelled');
create type public.withdrawal_status as enum ('pending', 'paid', 'rejected');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'buyer',
  full_name text not null default '',
  phone text not null default '',
  username text unique check (username is null or username ~ '^@[A-Za-z0-9_]{5,32}$'),
  bio text not null default '',
  created_at timestamptz not null default now()
);

-- The role comes from sign-up metadata but is limited to buyer/seller: admins are only
-- ever created by hand (see bottom of this file).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'seller' then 'seller'::public.app_role
         else 'buyer'::public.app_role end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Accounts registered before this migration get a profile too.
insert into public.profiles (id, role, full_name, phone)
select u.id,
       case when u.raw_user_meta_data ->> 'role' = 'seller' then 'seller'::public.app_role
            else 'buyer'::public.app_role end,
       coalesce(u.raw_user_meta_data ->> 'full_name', ''),
       coalesce(u.raw_user_meta_data ->> 'phone', '')
from auth.users u
on conflict (id) do nothing;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------- bots
create table public.bots (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null check (char_length(description) between 1 and 5000),
  price bigint not null check (price > 0),
  category text not null check (category in
    ('booking', 'shop', 'lead', 'education', 'support', 'payments', 'games')),
  languages text[] not null default '{uz}',
  delivery_hours integer not null default 24 check (delivery_hours between 1 and 720),
  views integer not null default 0,
  status public.bot_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index bots_seller_idx on public.bots (seller_id);
create index bots_status_idx on public.bots (status);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  bot_id uuid not null references public.bots (id) on delete restrict,
  bot_title text not null,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  amount bigint not null check (amount > 0),
  status public.order_status not null default 'pending_payment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer_idx on public.orders (buyer_id);
create index orders_seller_idx on public.orders (seller_id);
create index orders_bot_idx on public.orders (bot_id);

-- ---------------------------------------------------------------- reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  unique (bot_id, buyer_id)
);

-- ---------------------------------------------------------------- withdrawals
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,
  amount bigint not null check (amount > 0),
  fee bigint not null check (fee >= 0),
  payout bigint not null check (payout > 0),
  card_number text not null check (card_number ~ '^[0-9]{16}$'),
  card_holder text not null check (char_length(card_holder) between 2 and 80),
  status public.withdrawal_status not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index withdrawals_seller_idx on public.withdrawals (seller_id);

-- ---------------------------------------------------------------- support chat
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_user_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index support_thread_idx on public.support_messages (thread_user_id, created_at);

-- ---------------------------------------------------------------- privileges
-- Start from nothing and grant only what the app needs; RLS then narrows rows.
revoke all on public.profiles, public.bots, public.orders, public.reviews,
  public.withdrawals, public.support_messages from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, username, bio) on public.profiles to authenticated;

grant select on public.bots to authenticated;
grant insert (seller_id, title, description, price, category, languages, delivery_hours)
  on public.bots to authenticated;

grant select on public.orders to authenticated;
grant select, insert on public.reviews to authenticated;
grant select on public.withdrawals to authenticated;
grant select, insert on public.support_messages to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.bots enable row level security;
alter table public.orders enable row level security;
alter table public.reviews enable row level security;
alter table public.withdrawals enable row level security;
alter table public.support_messages enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy bots_select on public.bots for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());
create policy bots_insert on public.bots for insert to authenticated
  with check (
    seller_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'seller')
  );

create policy orders_select on public.orders for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create policy reviews_select on public.reviews for select to authenticated using (true);
create policy reviews_insert on public.reviews for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.bot_id = reviews.bot_id and o.buyer_id = auth.uid()
        and o.status in ('paid', 'delivering', 'done')
    )
  );

create policy withdrawals_select on public.withdrawals for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

create policy support_select on public.support_messages for select to authenticated
  using (thread_user_id = auth.uid() or public.is_admin());
create policy support_insert on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      (not from_staff and thread_user_id = auth.uid())
      or (from_staff and public.is_admin())
    )
  );

-- ---------------------------------------------------------------- public catalogue view
-- Readable by everyone (including signed-out visitors), but the price is hidden until the
-- visitor signs in. The view runs with its owner's rights on purpose: it exposes only these
-- columns of published bots.
create view public.bots_public as
select
  b.id,
  b.title,
  b.description,
  case when auth.uid() is not null then b.price end as price,
  b.category,
  b.languages,
  b.delivery_hours,
  b.created_at,
  coalesce(nullif(p.username, ''), p.full_name) as seller_name,
  coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.bot_id = b.id), 0)
    as rating,
  (select count(*) from public.reviews r where r.bot_id = b.id)::int as review_count,
  (select count(*) from public.orders o
     where o.bot_id = b.id and o.status in ('paid', 'delivering', 'done'))::int as sales
from public.bots b
join public.profiles p on p.id = b.seller_id
where b.status = 'published';

grant select on public.bots_public to anon, authenticated;

-- Reviews with reviewer first names, for the bot page.
create view public.bot_reviews as
select r.id, r.bot_id, r.rating, r.comment, r.created_at,
       split_part(p.full_name, ' ', 1) as reviewer
from public.reviews r
join public.profiles p on p.id = r.buyer_id
join public.bots b on b.id = r.bot_id and b.status = 'published';

grant select on public.bot_reviews to anon, authenticated;

-- ---------------------------------------------------------------- wallet
create function public.wallet_totals(p_seller uuid)
returns table (earned bigint, withdrawn bigint, balance bigint)
language sql stable security definer set search_path = public as $$
  with e as (
    select coalesce(sum(amount), 0)::bigint as v from public.orders
    where seller_id = p_seller and status in ('paid', 'delivering', 'done')
  ), w as (
    select coalesce(sum(amount), 0)::bigint as v from public.withdrawals
    where seller_id = p_seller and status <> 'rejected'
  )
  select e.v, w.v, e.v - w.v from e, w;
$$;
revoke all on function public.wallet_totals(uuid) from public, anon, authenticated;

create function public.my_wallet()
returns table (earned bigint, withdrawn bigint, balance bigint)
language sql stable security definer set search_path = public as $$
  select * from public.wallet_totals(auth.uid());
$$;

-- Platform rules (keep in sync with src/lib/wallet.ts).
create function public.request_withdrawal(p_amount bigint, p_card text, p_holder text)
returns public.withdrawals
language plpgsql security definer set search_path = public as $$
declare
  c_min constant bigint := 100000;
  c_retained constant bigint := 500000;
  v_card text := regexp_replace(coalesce(p_card, ''), '\s', '', 'g');
  v_balance bigint;
  v_fee bigint;
  v_row public.withdrawals;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- Serialise concurrent requests from the same seller.
  perform 1 from public.profiles where id = auth.uid() and role = 'seller' for update;
  if not found then raise exception 'not_a_seller'; end if;
  if v_card !~ '^[0-9]{16}$' then raise exception 'invalid_card'; end if;
  if p_amount is null or p_amount < c_min then raise exception 'amount_too_small'; end if;

  select t.balance into v_balance from public.wallet_totals(auth.uid()) t;
  if p_amount > greatest(0, v_balance - c_retained) then
    raise exception 'amount_exceeds_available';
  end if;

  v_fee := round(p_amount * 0.03);
  insert into public.withdrawals (seller_id, amount, fee, payout, card_number, card_holder)
  values (auth.uid(), p_amount, v_fee, p_amount - v_fee, v_card, btrim(p_holder))
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------- orders
create function public.create_order(p_bot_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_order public.orders;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_bot from public.bots where id = p_bot_id and status = 'published';
  if not found then raise exception 'bot_not_found'; end if;
  if v_bot.seller_id = auth.uid() then raise exception 'own_bot'; end if;

  select * into v_order from public.orders
  where bot_id = p_bot_id and buyer_id = auth.uid() and status = 'pending_payment';
  if found then return v_order; end if;

  insert into public.orders (bot_id, bot_title, buyer_id, seller_id, amount)
  values (v_bot.id, v_bot.title, auth.uid(), v_bot.seller_id, v_bot.price)
  returning * into v_order;
  return v_order;
end $$;

-- Sellers move a paid order through delivery.
create function public.seller_advance_order(p_order uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order and seller_id = auth.uid() for update;
  if not found then raise exception 'order_not_found'; end if;
  if not ((v_order.status = 'paid' and p_status = 'delivering')
       or (v_order.status in ('paid', 'delivering') and p_status = 'done')) then
    raise exception 'invalid_transition';
  end if;
  update public.orders set status = p_status, updated_at = now() where id = p_order
  returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------- views counter
create function public.increment_bot_views(p_bot uuid) returns void
language sql security definer set search_path = public as $$
  update public.bots set views = views + 1 where id = p_bot and status = 'published';
$$;

-- ---------------------------------------------------------------- seller dashboard
create function public.my_bots()
returns table (
  id uuid, title text, description text, price bigint, category text, status public.bot_status,
  views integer, sales integer, earned bigint, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.description, b.price, b.category, b.status, b.views,
         coalesce(s.sales, 0)::int, coalesce(s.earned, 0)::bigint, b.created_at
  from public.bots b
  left join lateral (
    select count(*) as sales, sum(o.amount) as earned from public.orders o
    where o.bot_id = b.id and o.status in ('paid', 'delivering', 'done')
  ) s on true
  where b.seller_id = auth.uid()
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------- admin actions
create function public.admin_set_bot_status(p_bot uuid, p_status public.bot_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.bots set status = p_status where id = p_bot;
end $$;

create function public.admin_set_order_status(p_order uuid, p_status public.order_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.orders set status = p_status, updated_at = now() where id = p_order;
end $$;

create function public.admin_set_withdrawal_status(p_id uuid, p_status public.withdrawal_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_status = 'pending' then raise exception 'invalid_status'; end if;
  update public.withdrawals set status = p_status, processed_at = now()
  where id = p_id and status = 'pending';
end $$;

-- Functions are executable by PUBLIC by default; restrict to signed-in users.
revoke execute on function
  public.my_wallet(), public.request_withdrawal(bigint, text, text), public.create_order(uuid),
  public.seller_advance_order(uuid, public.order_status), public.my_bots(),
  public.admin_set_bot_status(uuid, public.bot_status),
  public.admin_set_order_status(uuid, public.order_status),
  public.admin_set_withdrawal_status(uuid, public.withdrawal_status)
  from public, anon;
grant execute on function
  public.my_wallet(), public.request_withdrawal(bigint, text, text), public.create_order(uuid),
  public.seller_advance_order(uuid, public.order_status), public.my_bots(),
  public.admin_set_bot_status(uuid, public.bot_status),
  public.admin_set_order_status(uuid, public.order_status),
  public.admin_set_withdrawal_status(uuid, public.withdrawal_status)
  to authenticated;
grant execute on function public.increment_bot_views(uuid) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------- first admin
-- After registering normally, promote yourself once (SQL editor only):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
