drop table if exists public.user_profiles cascade;

drop policy if exists "app_members_update_own" on public.app_members;
create policy "app_members_update_own"
on public.app_members
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke update on table public.app_members from authenticated;
grant update (display_name) on table public.app_members to authenticated;
