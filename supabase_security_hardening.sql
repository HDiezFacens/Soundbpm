-- SoundBPM production hardening for profile moderation and avatar storage.
-- Safe to rerun. Public avatar URLs remain readable because the avatars
-- bucket stays public; this removes public object listing and direct client
-- writes, which the app does through the moderate-profile-content Edge Function.

begin;

-- Trigger execution does not require clients to have direct EXECUTE access.
alter function public.enforce_moderated_profile_content()
    set search_path = pg_catalog, public;
revoke all on function public.enforce_moderated_profile_content()
    from public, anon, authenticated;

-- The Edge Function uploads with the service role, so these client policies
-- are unnecessary. In particular, the SELECT policy allowed listing all
-- objects in the public avatars bucket.
drop policy if exists "Avatar público para leitura" on storage.objects;
drop policy if exists "Upload de avatar pelo próprio usuário" on storage.objects;
drop policy if exists "Atualizar avatar pelo próprio usuário" on storage.objects;

-- Keep public image URLs, but enforce the same accepted formats and size at
-- Storage in addition to validation in the Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    true,
    6291456,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
