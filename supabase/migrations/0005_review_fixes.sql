-- BotSmith 0005: fixes from a security review of migrations 0001-0004.
--
--  1. A refund can no longer push a seller's balance below zero (money already withdrawn).
--  2. Private bot files unlock when the seller starts delivery, the same moment refunds close;
--     before, a buyer could download everything and still get refunded.
--  3. Image moderation could be bypassed (NULL array elements, delete-and-reinsert of an approved
--     cover, unlimited objects per bot).
--  4. The anonymous view counter no longer keys on the client-chosen User-Agent.
--  5. Reviews: the raw table is no longer readable by every signed-in user (it exposes buyer ids
--     and reviews of unpublished bots); clients read the anonymised `bot_reviews` view instead.
--  6. Size limits on free-text profile fields, bots per seller, languages; rate limit on support
--     messages; clients can no longer choose `created_at` on reviews/support messages.

-- ---------------------------------------------------------------- 1. refunds vs. withdrawals
create or replace function public.payme_cancel_transaction(p_id text, p_reason integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions;
  v_order public.orders;
  v_balance bigint;
begin
  select * into v_tx from public.payment_transactions
  where provider = 'payme' and provider_tx_id = p_id for update;
  if not found then return jsonb_build_object('error', 'tx_not_found'); end if;

  if v_tx.state = 1 then
    update public.payment_transactions
      set state = -1, reason = p_reason, cancelled_at = now()
    where id = v_tx.id returning * into v_tx;
    return jsonb_build_object('tx', to_jsonb(v_tx));
  end if;

  if v_tx.state = 2 then
    select * into v_order from public.orders where id = v_tx.order_id for update;
    -- Once delivery has started the sale is final for the platform.
    if v_order.status in ('delivering', 'done') then
      return jsonb_build_object('error', 'cannot_cancel');
    end if;
    -- Serialise with withdrawals, and refuse a refund that the seller's remaining balance cannot
    -- absorb: the money was already paid out, so this case needs a human decision.
    perform 1 from public.profiles where id = v_order.seller_id for update;
    select t.balance into v_balance from public.wallet_totals(v_order.seller_id) t;
    if v_balance - v_order.amount < 0 then
      return jsonb_build_object('error', 'cannot_cancel');
    end if;
    update public.orders set status = 'cancelled', updated_at = now() where id = v_order.id;
    update public.payment_transactions
      set state = -2, reason = p_reason, cancelled_at = now()
    where id = v_tx.id returning * into v_tx;
  end if;
  return jsonb_build_object('tx', to_jsonb(v_tx));
end $$;

revoke execute on function public.payme_cancel_transaction(text, integer)
  from public, anon, authenticated;
grant execute on function public.payme_cancel_transaction(text, integer) to service_role;

-- ---------------------------------------------------------------- 2. file access follows delivery
drop policy bot_files_select on public.bot_files;
create policy bot_files_select on public.bot_files for select to authenticated
  using (
    exists (select 1 from public.bots b where b.id = bot_files.bot_id and b.seller_id = auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.bot_id = bot_files.bot_id and o.buyer_id = auth.uid()
        and o.status in ('delivering', 'done')
    )
  );

drop policy bot_files_read_buyer on storage.objects;
create policy bot_files_read_buyer on storage.objects for select to authenticated
  using (
    bucket_id = 'bot-files'
    and exists (
      select 1 from public.orders o
      where o.bot_id::text = (storage.foldername(name))[2]
        and o.buyer_id = auth.uid()
        and o.status in ('delivering', 'done')
    )
  );

-- ---------------------------------------------------------------- 3. media moderation
create or replace function public.set_bot_images(p_bot uuid, p_paths text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_paths text[] := coalesce(p_paths, '{}');
  v_prefix text;
begin
  select * into v_bot from public.bots where id = p_bot and seller_id = auth.uid() for update;
  if not found then raise exception 'bot_not_found'; end if;
  if cardinality(v_paths) > 5 then raise exception 'too_many_images'; end if;
  v_prefix := auth.uid()::text || '/' || p_bot::text || '/';
  -- NULL elements would make the "is this path new?" test below inconclusive.
  if exists (
    select 1 from unnest(v_paths) as p
    where p is null or left(p, length(v_prefix)) <> v_prefix or p like '%..%'
  ) then
    raise exception 'invalid_path';
  end if;

  update public.bots
  set image_paths = v_paths,
      status = case
        when status in ('published', 'rejected')
          and exists (
            select 1 from unnest(v_paths) as p
            where not exists (
              select 1 from unnest(v_bot.image_paths) as o where o is not distinct from p
            )
          )
        then 'pending'::public.bot_status
        else status
      end
  where id = p_bot;
end $$;

-- A cover object name that is already part of a bot's gallery cannot be uploaded again (that
-- would swap approved content after deleting the old object), and a bot may hold only a bounded
-- number of objects per bucket.
create function public.can_upload_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_own_bot_object_path(p_name)
    and (
      select count(*) from storage.objects o
      where o.bucket_id = p_bucket
        and (storage.foldername(o.name))[1] = (storage.foldername(p_name))[1]
        and (storage.foldername(o.name))[2] = (storage.foldername(p_name))[2]
    ) < case when p_bucket = 'bot-covers' then 10 else 15 end
    and (
      p_bucket <> 'bot-covers'
      or not exists (select 1 from public.bots b where p_name = any (b.image_paths))
    );
$$;
revoke execute on function public.can_upload_object(text, text) from public, anon;
grant execute on function public.can_upload_object(text, text) to authenticated;

drop policy bot_covers_insert on storage.objects;
create policy bot_covers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bot-covers' and public.can_upload_object('bot-covers', name));
drop policy bot_files_insert on storage.objects;
create policy bot_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bot-files' and public.can_upload_object('bot-files', name));

-- ---------------------------------------------------------------- 4. view counter
create or replace function public.record_bot_view(p_bot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_seller uuid;
  v_viewer text;
  v_inserted integer;
begin
  select seller_id into v_seller from public.bots where id = p_bot and status = 'published';
  if not found then return; end if;

  if auth.uid() is not null then
    if auth.uid() = v_seller then return; end if;
    v_viewer := 'u:' || auth.uid()::text;
  else
    -- Keyed on the network address only: the User-Agent is chosen by the client, so including
    -- it would let one address count many times.
    v_viewer := 'a:' || encode(
      sha256(convert_to(
        coalesce(
          v_headers ->> 'cf-connecting-ip',
          v_headers ->> 'x-real-ip',
          split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)
        ),
        'UTF8'
      )),
      'hex'
    );
  end if;

  insert into public.bot_views (bot_id, viewer) values (p_bot, v_viewer)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.bots set views = views + 1 where id = p_bot;
  end if;
end $$;

-- ---------------------------------------------------------------- 5. reviews
drop policy reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- 6. limits
-- NOT VALID: new and changed rows are checked, existing rows are left alone.
alter table public.profiles
  add constraint profiles_full_name_len check (char_length(full_name) <= 80) not valid,
  add constraint profiles_phone_len check (char_length(phone) <= 30) not valid,
  add constraint profiles_bio_len check (char_length(bio) <= 1000) not valid;
alter table public.bots
  add constraint bots_languages_len check (cardinality(languages) <= 5) not valid;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'seller' then 'seller'::public.app_role
         else 'buyer'::public.app_role end,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 30)
  );
  return new;
end $$;

-- At most 100 bots per seller.
drop policy bots_insert on public.bots;
create policy bots_insert on public.bots for insert to authenticated
  with check (
    seller_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'seller')
    and (select count(*) from public.bots b where b.seller_id = auth.uid()) < 100
  );

-- Clients may not choose created_at on reviews and support messages.
revoke insert on public.reviews, public.support_messages from authenticated;
grant insert (bot_id, buyer_id, rating, comment) on public.reviews to authenticated;
grant insert (thread_user_id, sender_id, from_staff, body) on public.support_messages to authenticated;

create function public.before_support_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.support_messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
create trigger support_messages_before_insert before insert on public.support_messages
  for each row execute function public.before_support_message_insert();
revoke execute on function public.before_support_message_insert() from public, anon, authenticated;
