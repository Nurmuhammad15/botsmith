-- Richer seller profile: photo, headline, location, experience, skills and website. Sellers edit
-- these themselves; they are shown to buyers on the bot page through bots_public.

alter table public.profiles
  add column avatar_path text,
  add column headline text,
  add column location text,
  add column experience_years smallint,
  add column skills text[] not null default '{}',
  add column website text,
  add constraint profiles_avatar_path_own check (avatar_path is null or avatar_path like id::text || '/%'),
  add constraint profiles_headline_len check (headline is null or char_length(headline) <= 80),
  add constraint profiles_location_len check (location is null or char_length(location) <= 80),
  add constraint profiles_experience_range check (
    experience_years is null or experience_years between 0 and 60
  ),
  add constraint profiles_skills_len check (
    cardinality(skills) <= 10 and char_length(array_to_string(skills, ',')) <= 300
  ),
  add constraint profiles_website_url check (
    website is null or (char_length(website) <= 200 and website ~* '^https?://[^\s]+$')
  );

grant update (avatar_path, headline, location, experience_years, skills, website)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------- avatar storage (public)
-- Object paths are always  <user_id>/<random>-<file name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy avatars_read_owner on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- public bot view
-- New columns are appended at the end so CREATE OR REPLACE VIEW keeps the existing ones.
create or replace view public.bots_public as
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
  p.skills as seller_skills,
  p.bio as seller_bio,
  p.website as seller_website
from public.bots b
join public.profiles p on p.id = b.seller_id
where b.status = 'published'
  and b.price_7_days is not null and b.price_30_days is not null;
revoke select on public.bots_public from anon, authenticated;
grant select on public.bots_public to anon, authenticated;
