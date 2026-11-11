-- SoundBPM: curtidas, comentários e vídeos da comunidade
-- Execute no SQL Editor do projeto Supabase.

begin;

create table if not exists public.review_likes (
    review_id uuid not null references public.reviews(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (review_id, user_id)
);

create table if not exists public.review_comments (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references public.reviews(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    body text not null check (char_length(body) between 1 and 500),
    created_at timestamptz not null default now()
);

-- Compatibilidade com a tabela antiga, que chamava o texto de comment_text.
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'review_comments'
          and column_name = 'comment_text'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'review_comments'
          and column_name = 'body'
    ) then
        alter table public.review_comments rename column comment_text to body;
    end if;
end
$$;

create table if not exists public.videos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    video_url text not null,
    storage_path text not null unique,
    duration numeric(5,1) not null check (duration >= 0 and duration <= 60.5),
    caption varchar(300),
    tag varchar(80),
    created_at timestamptz not null default now()
);

alter table public.review_likes enable row level security;
alter table public.review_comments enable row level security;
alter table public.videos enable row level security;

grant select on public.review_likes, public.review_comments, public.videos to anon, authenticated;
grant insert, delete on public.review_likes to authenticated;
grant insert, delete on public.review_comments to authenticated;
grant insert, delete on public.videos to authenticated;

drop policy if exists "Community likes are publicly readable" on public.review_likes;
create policy "Community likes are publicly readable"
    on public.review_likes for select to anon, authenticated
    using (true);

drop policy if exists "Users can like as themselves" on public.review_likes;
create policy "Users can like as themselves"
    on public.review_likes for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own likes" on public.review_likes;
create policy "Users can remove their own likes"
    on public.review_likes for delete to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Community comments are publicly readable" on public.review_comments;
create policy "Community comments are publicly readable"
    on public.review_comments for select to anon, authenticated
    using (true);

drop policy if exists "Users can comment as themselves" on public.review_comments;
create policy "Users can comment as themselves"
    on public.review_comments for insert to authenticated
    with check (
        auth.uid() = user_id
        and char_length(trim(body)) between 1 and 500
    );

drop policy if exists "Authors or review owners can delete comments" on public.review_comments;
create policy "Authors or review owners can delete comments"
    on public.review_comments for delete to authenticated
    using (
        auth.uid() = user_id
        or exists (
            select 1
            from public.reviews r
            where r.id = review_comments.review_id
              and r.user_id = auth.uid()
        )
    );

drop policy if exists "Community videos are publicly readable" on public.videos;
create policy "Community videos are publicly readable"
    on public.videos for select to anon, authenticated
    using (true);

drop policy if exists "Users can publish their own videos" on public.videos;
create policy "Users can publish their own videos"
    on public.videos for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own videos" on public.videos;
create policy "Users can delete their own videos"
    on public.videos for delete to authenticated
    using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'videos',
    'videos',
    true,
    41943040,
    array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload videos to their own folder" on storage.objects;
create policy "Users can upload videos to their own folder"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'videos'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete videos from their own folder" on storage.objects;
create policy "Users can delete videos from their own folder"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'videos'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

commit;
