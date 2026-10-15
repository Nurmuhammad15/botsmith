-- An admin can edit a user's profile details (name, phone, Telegram username, ...).
-- Other admins' profiles are off limits; an admin edits their own in the normal profile page.
create function public.admin_update_user_profile(
  p_user uuid, p_full_name text, p_phone text, p_username text, p_headline text,
  p_location text, p_experience_years smallint, p_website text, p_bio text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and p_user <> auth.uid() then
    raise exception 'cannot_change_admin';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) < 2 then raise exception 'invalid_name'; end if;
  update public.profiles
  set full_name = btrim(p_full_name),
      phone = btrim(coalesce(p_phone, '')),
      username = nullif(btrim(p_username), ''),
      headline = nullif(btrim(p_headline), ''),
      location = nullif(btrim(p_location), ''),
      experience_years = p_experience_years,
      website = nullif(btrim(p_website), ''),
      bio = btrim(coalesce(p_bio, ''))
  where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
end $$;

revoke execute on function public.admin_update_user_profile(
  uuid, text, text, text, text, text, smallint, text, text) from public, anon;
grant execute on function public.admin_update_user_profile(
  uuid, text, text, text, text, text, smallint, text, text) to authenticated;
