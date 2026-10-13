-- Photos on reviews. Buyers add up to 3 images when they review a bot from their Orders page.
-- Object paths are always  <buyer_id>/<bot_id>/<random>-<file name>  in the public review-images bucket.

create function public.review_images_ok(p_buyer uuid, p_paths text[])
returns boolean language sql immutable as $$
  select cardinality(p_paths) <= 3
    and not exists (
      select 1 from unnest(p_paths) as p
      where p not like p_buyer::text || '/%' or char_length(p) > 300
    );
$$;

alter table public.reviews
  add column image_paths text[] not null default '{}',
  add constraint reviews_images_ok check (public.review_images_ok(buyer_id, image_paths));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-images', 'review-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy review_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'review-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy review_images_read_owner on storage.objects for select to authenticated
  using (bucket_id = 'review-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy review_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'review-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- The public view gets the photos as its last column.
create or replace view public.bot_reviews as
select r.id, r.bot_id, r.rating, r.comment, r.created_at,
       split_part(p.full_name, ' ', 1) as reviewer,
       r.image_paths
from public.reviews r
join public.profiles p on p.id = r.buyer_id
join public.bots b on b.id = r.bot_id and b.status = 'published';
grant select on public.bot_reviews to anon, authenticated;
