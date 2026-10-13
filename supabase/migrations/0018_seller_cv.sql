-- Replaces the skills list on seller profiles with an optional CV (PDF) that buyers can open from
-- the bot page. CVs live in a public bucket under  <user_id>/<random>-<file name>.

drop view public.bots_public;

alter table public.profiles
  drop column skills,
  add column cv_path text,
  add column cv_name text,
  add constraint profiles_cv_path_own check (cv_path is null or cv_path like id::text || '/%'),
  add constraint profiles_cv_name_len check (cv_name is null or char_length(cv_name) <= 120);

grant update (cv_path, cv_name) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', true, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy cvs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cvs'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy cvs_read_owner on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy cvs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create view public.bots_public as
select
  b.id,
  b.title,
  b.description,
  b.price,
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
  (select count(*)::int from public.bot_files f where f.bot_id = b.id) as file_count,
  b.seller_id,
  b.price_7_days,
  b.price_30_days,
  p.avatar_path as seller_avatar,
  p.headline as seller_headline,
  p.location as seller_location,
  p.experience_years as seller_experience,
  p.bio as seller_bio,
  p.website as seller_website,
  p.cv_path as seller_cv,
  p.cv_name as seller_cv_name
from public.bots b
join public.profiles p on p.id = b.seller_id
where b.status = 'published'
  and b.price_7_days is not null and b.price_30_days is not null;
revoke select on public.bots_public from anon, authenticated;
grant select on public.bots_public to anon, authenticated;
