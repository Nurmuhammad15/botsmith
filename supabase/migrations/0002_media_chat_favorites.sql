-- BotSmith 0002: bot media (covers + deliverable files), buyer-seller chat, favorites,
-- and de-duplicated view counting. Run after 0001_marketplace.sql.

-- =============================================================== storage
-- Covers are public marketing images. Deliverable files are private: only the seller and
-- buyers with a paid order can read them (policies below).
-- Object paths are always  <seller_id>/<bot_id>/<random>-<file name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('bot-covers', 'bot-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('bot-files', 'bot-files', false, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A seller may only write to <own id>/<own bot id>/<file>.
create function public.is_own_bot_object_path(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and array_length(storage.foldername(p_name), 1) = 2
    and (storage.foldername(p_name))[1] = auth.uid()::text
    and exists (
      select 1 from public.bots b
      where b.id::text = (storage.foldername(p_name))[2] and b.seller_id = auth.uid()
    );
$$;
revoke execute on function public.is_own_bot_object_path(text) from public, anon;
grant execute on function public.is_own_bot_object_path(text) to authenticated;

create policy bot_covers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bot-covers' and public.is_own_bot_object_path(name));
-- Storage deletes run as DELETE ... WHERE/RETURNING, which also needs a SELECT policy;
-- without it removing a cover would silently delete nothing. (Public reads need no policy.)
create policy bot_covers_read_owner on storage.objects for select to authenticated
  using (bucket_id = 'bot-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bot_covers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bot-covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy bot_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bot-files' and public.is_own_bot_object_path(name));
create policy bot_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bot-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bot_files_read_owner on storage.objects for select to authenticated
  using (bucket_id = 'bot-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bot_files_read_buyer on storage.objects for select to authenticated
  using (
    bucket_id = 'bot-files'
    and exists (
      select 1 from public.orders o
      where o.bot_id::text = (storage.foldername(name))[2]
        and o.buyer_id = auth.uid()
        and o.status in ('paid', 'delivering', 'done')
    )
  );

-- =============================================================== bot media
alter table public.bots
  add column image_paths text[] not null default '{}'
  check (cardinality(image_paths) <= 5);

create table public.bot_files (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index bot_files_bot_idx on public.bot_files (bot_id);

revoke all on public.bot_files from anon, authenticated;
grant select on public.bot_files to authenticated;
alter table public.bot_files enable row level security;

create policy bot_files_select on public.bot_files for select to authenticated
  using (
    exists (select 1 from public.bots b where b.id = bot_files.bot_id and b.seller_id = auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.bot_id = bot_files.bot_id and o.buyer_id = auth.uid()
        and o.status in ('paid', 'delivering', 'done')
    )
  );

-- Replaces the cover gallery (first image is the cover). Images are public, so adding a new
-- one to a published or rejected bot sends it back to moderation.
create function public.set_bot_images(p_bot uuid, p_paths text[])
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
  if exists (
    select 1 from unnest(v_paths) as p where left(p, length(v_prefix)) <> v_prefix or p like '%..%'
  ) then
    raise exception 'invalid_path';
  end if;

  update public.bots
  set image_paths = v_paths,
      status = case
        when status in ('published', 'rejected')
          and exists (select 1 from unnest(v_paths) as p where p <> all (v_bot.image_paths))
        then 'pending'::public.bot_status
        else status
      end
  where id = p_bot;
end $$;

create function public.add_bot_file(p_bot uuid, p_path text, p_name text, p_size bigint)
returns public.bot_files language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := auth.uid()::text || '/' || p_bot::text || '/';
  v_row public.bot_files;
begin
  perform 1 from public.bots where id = p_bot and seller_id = auth.uid() for update;
  if not found then raise exception 'bot_not_found'; end if;
  if left(p_path, length(v_prefix)) <> v_prefix or p_path like '%..%' then
    raise exception 'invalid_path';
  end if;
  if (select count(*) from public.bot_files where bot_id = p_bot) >= 10 then
    raise exception 'too_many_files';
  end if;
  insert into public.bot_files (bot_id, path, file_name, size_bytes)
  values (p_bot, p_path, left(btrim(p_name), 200), greatest(coalesce(p_size, 0), 0))
  returning * into v_row;
  return v_row;
end $$;

-- Returns the storage path so the client can delete the object afterwards.
create function public.remove_bot_file(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  delete from public.bot_files f
  using public.bots b
  where f.id = p_id and b.id = f.bot_id and b.seller_id = auth.uid()
  returning f.path into v_path;
  if v_path is null then raise exception 'file_not_found'; end if;
  return v_path;
end $$;

-- Public catalogue: new columns are appended so CREATE OR REPLACE VIEW stays valid.
create or replace view public.bots_public as
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
     where o.bot_id = b.id and o.status in ('paid', 'delivering', 'done'))::int as sales,
  b.image_paths,
  (select count(*) from public.bot_files f where f.bot_id = b.id)::int as file_count,
  b.seller_id
from public.bots b
join public.profiles p on p.id = b.seller_id
where b.status = 'published';

-- The seller dashboard now also needs media information, so the return type changes.
drop function public.my_bots();
create function public.my_bots()
returns table (
  id uuid, title text, description text, price bigint, category text, status public.bot_status,
  views integer, sales integer, earned bigint, created_at timestamptz,
  image_paths text[], file_count integer
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.description, b.price, b.category, b.status, b.views,
         coalesce(s.sales, 0)::int, coalesce(s.earned, 0)::bigint, b.created_at,
         b.image_paths,
         (select count(*) from public.bot_files f where f.bot_id = b.id)::int
  from public.bots b
  left join lateral (
    select count(*) as sales, sum(o.amount) as earned from public.orders o
    where o.bot_id = b.id and o.status in ('paid', 'delivering', 'done')
  ) s on true
  where b.seller_id = auth.uid()
  order by b.created_at desc;
$$;

-- =============================================================== chat
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (bot_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id, created_at);

revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_select on public.conversations for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

create policy messages_select on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  ));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- Spam guard + keeps the conversation list ordered by the latest message.
create function public.before_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.before_message_insert();

create function public.after_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.after_message_insert();

-- A buyer opens a chat from a published bot page. A seller may open one with someone who
-- has ordered that bot (p_buyer).
create function public.open_conversation(p_bot uuid, p_buyer uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bot public.bots;
  v_buyer uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_bot from public.bots where id = p_bot;
  if not found then raise exception 'bot_not_found'; end if;

  if p_buyer is null then
    if v_bot.status <> 'published' then raise exception 'bot_not_found'; end if;
    if v_bot.seller_id = auth.uid() then raise exception 'own_bot'; end if;
    v_buyer := auth.uid();
  else
    if v_bot.seller_id <> auth.uid() then raise exception 'forbidden'; end if;
    if not exists (select 1 from public.orders o where o.bot_id = p_bot and o.buyer_id = p_buyer) then
      raise exception 'forbidden';
    end if;
    v_buyer := p_buyer;
  end if;

  insert into public.conversations (bot_id, buyer_id, seller_id)
  values (p_bot, v_buyer, v_bot.seller_id)
  on conflict (bot_id, buyer_id) do nothing;
  select id into v_id from public.conversations where bot_id = p_bot and buyer_id = v_buyer;
  return v_id;
end $$;

create function public.my_conversations()
returns table (
  id uuid, bot_id uuid, bot_title text, other_name text, as_seller boolean,
  last_body text, last_at timestamptz, unread integer
)
language sql stable security definer set search_path = public as $$
  select c.id, c.bot_id, b.title,
         coalesce(nullif(op.username, ''), nullif(op.full_name, ''), 'Foydalanuvchi'),
         (c.seller_id = auth.uid()),
         lm.body,
         coalesce(lm.created_at, c.created_at),
         (select count(*) from public.messages m
            where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)::int
  from public.conversations c
  join public.bots b on b.id = c.bot_id
  join public.profiles op on op.id = case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end
  left join lateral (
    select m.body, m.created_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    -- a seller only sees chats where the buyer actually wrote something
    and (c.buyer_id = auth.uid() or lm.body is not null)
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

create function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = public as $$
  update public.messages m set read_at = now()
  where m.conversation_id = p_conversation
    and m.sender_id <> auth.uid()
    and m.read_at is null
    and exists (
      select 1 from public.conversations c
      where c.id = p_conversation and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    );
$$;

create function public.my_unread_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    and m.sender_id <> auth.uid() and m.read_at is null;
$$;

-- Live updates for open chats (Supabase Realtime respects the select policy above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- =============================================================== favorites
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  bot_id uuid not null references public.bots (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bot_id)
);
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
alter table public.favorites enable row level security;
create policy favorites_select on public.favorites for select to authenticated
  using (user_id = auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated
  with check (user_id = auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated
  using (user_id = auth.uid());

-- =============================================================== view counting
-- One view per visitor per bot per day. Signed-in visitors are keyed by user id, anonymous
-- ones by a hash of IP + user agent (no raw IPs are stored). The seller's own visits never
-- count. A determined attacker with many IPs can still inflate the number; this stops
-- refresh-spam and trivial scripts.
create table public.bot_views (
  bot_id uuid not null references public.bots (id) on delete cascade,
  viewer text not null,
  day date not null default ((now() at time zone 'utc')::date),
  primary key (bot_id, viewer, day)
);
revoke all on public.bot_views from anon, authenticated;
alter table public.bot_views enable row level security;

drop function public.increment_bot_views(uuid);
create function public.record_bot_view(p_bot uuid) returns void
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
    v_viewer := 'a:' || encode(
      sha256(convert_to(
        coalesce(
          v_headers ->> 'cf-connecting-ip',
          v_headers ->> 'x-real-ip',
          split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)
        ) || '|' || coalesce(v_headers ->> 'user-agent', ''),
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

-- Old rows are never read again (the key includes the day); schedule this daily with pg_cron:
--   select cron.schedule('prune-bot-views', '15 0 * * *', 'select public.prune_bot_views()');
create function public.prune_bot_views() returns void
language sql security definer set search_path = public as $$
  delete from public.bot_views where day < ((now() at time zone 'utc')::date);
$$;
revoke execute on function public.prune_bot_views() from public, anon, authenticated;

-- =============================================================== function privileges
revoke execute on function
  public.set_bot_images(uuid, text[]), public.add_bot_file(uuid, text, text, bigint),
  public.remove_bot_file(uuid), public.my_bots(),
  public.open_conversation(uuid, uuid), public.my_conversations(),
  public.mark_conversation_read(uuid), public.my_unread_count()
  from public, anon;
grant execute on function
  public.set_bot_images(uuid, text[]), public.add_bot_file(uuid, text, text, bigint),
  public.remove_bot_file(uuid), public.my_bots(),
  public.open_conversation(uuid, uuid), public.my_conversations(),
  public.mark_conversation_read(uuid), public.my_unread_count()
  to authenticated;
revoke execute on function public.record_bot_view(uuid) from public;
grant execute on function public.record_bot_view(uuid) to anon, authenticated;
-- Trigger functions are never meant to be called directly.
revoke execute on function public.before_message_insert(), public.after_message_insert()
  from public, anon, authenticated;
