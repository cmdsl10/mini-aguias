create table if not exists public.membership_regularizations (
 id bigint generated always as identity primary key,
 member_id uuid not null references public.members(id) on delete cascade,
 paid_through_year integer not null check (paid_through_year between 1900 and 2100),
 reason text not null check (char_length(btrim(reason)) between 5 and 500),
 actor_id uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists membership_regularizations_member_latest_idx on public.membership_regularizations(member_id, id desc);
alter table public.membership_regularizations enable row level security;
revoke all on public.membership_regularizations from anon;
grant select,insert on public.membership_regularizations to authenticated;
create policy membership_regularizations_admin_read on public.membership_regularizations for select to authenticated
 using ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy membership_regularizations_admin_insert on public.membership_regularizations for insert to authenticated
 with check ((select auth.jwt()->'app_metadata'->>'role')='admin' and actor_id=(select auth.uid()));
comment on table public.membership_regularizations is 'Append-only administrative membership coverage corrections. No financial receipt is implied.';