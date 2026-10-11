-- BotSmith 0004: keep full card numbers out of ordinary reads.
--
-- A withdrawal needs the seller's full card number so an administrator can make the transfer,
-- but nothing else does. From now on:
--   * clients can no longer SELECT withdrawals.card_number (column privilege), so a compromised
--     seller account, a careless `select *` or an admin dashboard bug cannot leak it;
--   * sellers and admins read `card_last4` for display;
--   * an administrator obtains the full number only through admin_reveal_withdrawal_card(),
--     which records who looked at which withdrawal and when.
--
-- Clients must list columns explicitly (`select *` on withdrawals is now denied).

alter table public.withdrawals
  add column card_last4 text generated always as (right(card_number, 4)) stored;

revoke select on public.withdrawals from anon, authenticated;
grant select (
  id, seller_id, amount, fee, payout, card_last4, card_holder, status, created_at, processed_at
) on public.withdrawals to authenticated;

create table public.withdrawal_card_reveals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.withdrawals (id) on delete cascade,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  revealed_at timestamptz not null default now()
);
create index withdrawal_card_reveals_withdrawal_idx
  on public.withdrawal_card_reveals (withdrawal_id);

revoke all on public.withdrawal_card_reveals from anon, authenticated;
grant select on public.withdrawal_card_reveals to authenticated;
alter table public.withdrawal_card_reveals enable row level security;
create policy withdrawal_card_reveals_admin_select on public.withdrawal_card_reveals
  for select to authenticated using (public.is_admin());

create function public.admin_reveal_withdrawal_card(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_card text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select card_number into v_card from public.withdrawals where id = p_id;
  if v_card is null then raise exception 'withdrawal_not_found'; end if;
  insert into public.withdrawal_card_reveals (withdrawal_id, admin_id) values (p_id, auth.uid());
  return v_card;
end $$;

revoke execute on function public.admin_reveal_withdrawal_card(uuid) from public, anon;
grant execute on function public.admin_reveal_withdrawal_card(uuid) to authenticated;
