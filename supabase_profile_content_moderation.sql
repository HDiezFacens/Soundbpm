-- Aprovações de uso único criadas somente pela Edge Function moderadora.
create table if not exists public.profile_content_approvals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    field_name text not null check (field_name in ('username', 'avatar_url', 'banner_url')),
    content_value text not null,
    created_at timestamptz not null default now()
);

alter table public.profile_content_approvals enable row level security;
revoke all on public.profile_content_approvals from anon, authenticated;
grant all on public.profile_content_approvals to service_role;
create index if not exists profile_content_approvals_lookup_idx
    on public.profile_content_approvals (user_id, field_name, content_value);

create or replace function public.enforce_moderated_profile_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    is_approved boolean;
    username_changed boolean;
    avatar_changed boolean;
    banner_changed boolean;
begin
    if TG_OP = 'INSERT' then
        username_changed := true;
        avatar_changed := true;
        banner_changed := true;
    else
        username_changed := NEW.username is distinct from OLD.username;
        avatar_changed := NEW.avatar_url is distinct from OLD.avatar_url;
        banner_changed := NEW.banner_url is distinct from OLD.banner_url;
    end if;

    if username_changed then
        is_approved := false;
        delete from public.profile_content_approvals
         where id = (
             select id from public.profile_content_approvals
              where user_id = NEW.id and field_name = 'username' and content_value = NEW.username
              order by created_at desc limit 1
         )
         returning true into is_approved;
        if not coalesce(is_approved, false) then
            if TG_OP = 'INSERT' then
                NEW.username := 'Membro-' || substr(NEW.id::text, 1, 6);
            else
                raise exception 'PROFILE_CONTENT_NOT_MODERATED: username';
            end if;
        end if;
    end if;

    if NEW.avatar_url is not null and avatar_changed then
        is_approved := false;
        delete from public.profile_content_approvals
         where id = (
             select id from public.profile_content_approvals
              where user_id = NEW.id and field_name = 'avatar_url' and content_value = NEW.avatar_url
              order by created_at desc limit 1
         )
         returning true into is_approved;
        if not coalesce(is_approved, false) then
            if TG_OP = 'INSERT' then
                NEW.avatar_url := null;
            else
                raise exception 'PROFILE_CONTENT_NOT_MODERATED: avatar';
            end if;
        end if;
    end if;

    if NEW.banner_url is not null and banner_changed then
        is_approved := false;
        delete from public.profile_content_approvals
         where id = (
             select id from public.profile_content_approvals
              where user_id = NEW.id and field_name = 'banner_url' and content_value = NEW.banner_url
              order by created_at desc limit 1
         )
         returning true into is_approved;
        if not coalesce(is_approved, false) then
            if TG_OP = 'INSERT' then
                NEW.banner_url := null;
            else
                raise exception 'PROFILE_CONTENT_NOT_MODERATED: banner';
            end if;
        end if;
    end if;

    return NEW;
end;
$$;

drop trigger if exists profiles_require_moderated_content on public.profiles;
create trigger profiles_require_moderated_content
before insert or update of username, avatar_url, banner_url on public.profiles
for each row execute function public.enforce_moderated_profile_content();
