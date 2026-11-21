-- Allows profiles to display the friends of any user.
-- Only accepted friendships are visible; pending requests remain private.

drop policy if exists "Accepted friendships are publicly readable"
    on public.friendships;

create policy "Accepted friendships are publicly readable"
    on public.friendships
    for select
    to anon, authenticated
    using (status = 'accepted');
