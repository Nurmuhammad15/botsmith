-- Lets an administrator set a new password for a regular user. The password is hashed with
-- bcrypt exactly like Supabase Auth does, and all of that user's sessions are ended.
create function public.admin_set_user_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_password is null or char_length(p_password) < 8 or char_length(p_password) > 72 then
    raise exception 'weak_password';
  end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and p_user <> auth.uid() then
    raise exception 'cannot_change_admin';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  delete from auth.sessions where user_id = p_user;
end $$;

revoke execute on function public.admin_set_user_password(uuid, text) from public, anon;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
