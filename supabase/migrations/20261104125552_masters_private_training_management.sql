-- Reviewed local candidate. NOT APPLIED remotely. Human approval required before hosted execution.
create table public.masters_players (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (length(trim(display_name)) between 1 and 120),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 active boolean not null default true,
 sports_role text not null default 'player' check (sports_role in ('player','coach','president')),
 playing_position text check (length(playing_position)<=80),
 attendance_eligible boolean default null,
 created_at timestamptz not null default now()
);
create table public.masters_trainings (
 id uuid primary key default gen_random_uuid(),
 training_date date not null unique check (extract(isodow from training_date)=3 and training_date >= date '2026-10-21'),
 status text not null default 'open' check(status in ('open','closed','cancelled')),
 lead_foot_player_id uuid references public.masters_players(id),
 lead_foot_image_path text check (lead_foot_image_path is null or (lead_foot_player_id is not null and lead_foot_image_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'))),
 created_at timestamptz not null default now()
);
create table public.masters_attendance (
 training_id uuid not null references public.masters_trainings(id) on delete cascade,
 player_id uuid not null references public.masters_players(id),
 status text not null default 'pending' check(status in ('pending','present','absent','excused')),
 primary key(training_id,player_id)
);
create table public.masters_payments (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.masters_players(id),
 amount_cents integer not null check(amount_cents>0),
 paid_at timestamptz not null default now(),
 note text,
 created_by uuid references auth.users(id)
);
create table public.masters_payment_allocations (
 payment_id uuid not null references public.masters_payments(id) on delete cascade,
 training_id uuid not null,
 player_id uuid not null,
 amount_cents integer not null check(amount_cents>0),
 primary key(payment_id,training_id,player_id),
 foreign key(training_id,player_id) references public.masters_attendance(training_id,player_id)
);
create table public.masters_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 event_type text not null,
 record_id text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists masters_attendance_player on public.masters_attendance(player_id);
create unique index masters_players_distinct_name on public.masters_players(lower(normalize(btrim(display_name), NFC)));
create index if not exists masters_payments_player on public.masters_payments(player_id);
alter table public.masters_players enable row level security;
alter table public.masters_trainings enable row level security;
alter table public.masters_attendance enable row level security;
alter table public.masters_payments enable row level security;
alter table public.masters_payment_allocations enable row level security;
alter table public.masters_audit enable row level security;
-- Access is configured below, in the same migration.

-- LOCAL REVIEW CANDIDATE. Never apply to a hosted project without human approval.
-- Self-contained additive module; existing public Masters tables remain untouched.
create schema if not exists masters_private;
revoke all on schema masters_private from public, anon;
grant usage on schema masters_private to authenticated;

-- Server-owned membership lookup avoids recursive RLS. No editable JWT metadata.
create function masters_private.can_read() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and (auth.jwt()->'app_metadata'->>'role' = 'admin' or exists (
 select 1 from public.masters_players where auth_user_id=auth.uid() and active));
$$;
create function masters_private.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and coalesce(auth.jwt()->'app_metadata'->>'role'='admin',false);
$$;
revoke all on function masters_private.can_read(), masters_private.is_admin() from public,anon;
grant execute on function masters_private.can_read(), masters_private.is_admin() to authenticated;

do $$ declare t text; begin
 foreach t in array array['masters_players','masters_trainings','masters_attendance','masters_payments','masters_payment_allocations','masters_audit'] loop
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy masters_read on public.%I for select to authenticated using ((select masters_private.can_read()))',t);
 if t <> 'masters_audit' then
 execute format('grant insert, update, delete on public.%I to authenticated',t);
 execute format('create policy masters_write on public.%I for all to authenticated using ((select masters_private.is_admin())) with check ((select masters_private.is_admin()))',t);
 end if;
 end loop;
end $$;

-- Serialize all financial and attendance changes for the same player, including
-- direct Data API writes. Constraints must hold outside the UI and RPC too.
create function masters_private.guard_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare p uuid; tr uuid; due integer; used bigint; payment public.masters_payments; begin
 if tg_table_name='masters_players' then
   if tg_op='UPDATE' and new.id<>old.id then raise exception 'Player identity is immutable'; end if;
   if tg_op='UPDATE' and new.attendance_eligible is distinct from old.attendance_eligible and exists(
     select 1 from public.masters_attendance a join public.masters_trainings t on t.id=a.training_id
     where a.player_id=old.id and t.status='closed' and a.status<>'pending') then
     raise exception 'Reopen marked trainings before changing eligibility';
   end if;
   if tg_op='DELETE' then return old; end if; return new;
 end if;
 if tg_table_name='masters_trainings' then
   if tg_op='DELETE' then raise exception 'Cancel trainings instead of deleting them'; end if;
   if tg_op='UPDATE' and (new.id<>old.id or new.training_date<>old.training_date) then raise exception 'Training identity is immutable'; end if;
   if new.status='closed' then
    if new.training_date>(now() at time zone 'Europe/Lisbon')::date then raise exception 'Future training cannot close'; end if;
    if exists(select 1 from public.masters_players p where p.active and p.attendance_eligible is true and not exists(
      select 1 from public.masters_attendance a where a.player_id=p.id and a.training_id=new.id and a.status<>'pending'))
    or exists(select 1 from public.masters_attendance a join public.masters_players p on p.id=a.player_id where training_id=new.id and a.status='pending' and p.attendance_eligible is true) then
     raise exception 'Mark every player before closing'; end if;
   end if;
   if new.status<>'closed' and exists(select 1 from public.masters_payment_allocations where training_id=new.id) then
    raise exception 'Reverse allocated payments before reopening or cancelling'; end if;
   return new;
 end if;
 p:=case when tg_op='DELETE' then old.player_id else new.player_id end;
 if tg_op='UPDATE' and new.player_id<>old.player_id then raise exception 'Player identity is immutable'; end if;
 perform 1 from public.masters_players where id=p for update;
 if tg_table_name='masters_attendance' then
   tr:=case when tg_op='DELETE' then old.training_id else new.training_id end;
   perform 1 from public.masters_trainings where id=tr for update;
   if tg_op<>'DELETE' then
    if new.status<>'pending' and not exists(select 1 from public.masters_players where id=p and attendance_eligible is true) then
     raise exception 'Attendance eligibility must be confirmed'; end if;
    if new.status='pending' and exists(select 1 from public.masters_trainings where id=tr and status='closed') then
     raise exception 'Reopen the training before marking pending'; end if;
   end if;
   if tg_op='UPDATE' and new.training_id<>old.training_id then raise exception 'Training identity is immutable'; end if;
   if tg_op='DELETE' or new.status<>'absent' then
    if exists(select 1 from public.masters_payment_allocations where player_id=p and training_id=tr) then
     raise exception 'Reverse allocated payments before changing this absence'; end if;
   end if;
 elsif tg_table_name='masters_payments' then
   if tg_op='UPDATE' and new.id<>old.id then raise exception 'Payment identity is immutable'; end if;
   if tg_op<>'DELETE' then
    if new.created_by is distinct from auth.uid() then raise exception 'Invalid payment author'; end if;
    select coalesce(sum(amount_cents),0) into used from public.masters_payment_allocations where payment_id=new.id;
    if used>new.amount_cents then raise exception 'Payment below allocated amount'; end if;
   end if;
 elsif tg_table_name='masters_payment_allocations' then
   if tg_op='UPDATE' then raise exception 'Reverse allocations instead of updating'; end if;
   if tg_op<>'DELETE' then
    select * into payment from public.masters_payments where id=new.payment_id;
    if payment.player_id is distinct from p then raise exception 'Payment belongs to another player'; end if;
    perform 1 from public.masters_trainings where id=new.training_id for update;
    select 100 into due from public.masters_attendance a join public.masters_trainings t on t.id=a.training_id
      where a.training_id=new.training_id and a.player_id=p and a.status='absent' and t.status='closed'
      and exists(select 1 from public.masters_players where id=p and attendance_eligible is true);
    if due is null then raise exception 'Only closed unexcused absences can be paid'; end if;
    select coalesce(sum(amount_cents),0) into used from public.masters_payment_allocations where payment_id=new.payment_id;
    if used+new.amount_cents>payment.amount_cents then raise exception 'Payment over-allocation'; end if;
    select coalesce(sum(amount_cents),0) into used from public.masters_payment_allocations where player_id=p and training_id=new.training_id;
    if used+new.amount_cents>due then raise exception 'Absence over-allocation'; end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function masters_private.guard_row() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['masters_players','masters_trainings','masters_attendance','masters_payments','masters_payment_allocations'] loop
 execute format('create trigger masters_guard before insert or update or delete on public.%I for each row execute function masters_private.guard_row()',t);
 end loop;
end $$;

-- Audit is append-only to clients; privileged trigger is isolated from the API.
create function masters_private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'An authenticated actor is required'; end if;
 insert into public.masters_audit(actor_id,event_type,record_id,details)
 values(auth.uid(),tg_table_name||'.'||lower(tg_op),coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'training_id',to_jsonb(old)->>'training_id'),
 jsonb_build_object('before',case when tg_op<>'INSERT' then to_jsonb(old) end,'after',case when tg_op<>'DELETE' then to_jsonb(new) end));
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function masters_private.audit_row() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['masters_players','masters_trainings','masters_attendance','masters_payments','masters_payment_allocations'] loop
 execute format('create trigger masters_audit after insert or update or delete on public.%I for each row execute function masters_private.audit_row()',t);
 end loop;
end $$;

create function public.masters_create_training(day date) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid; begin
 if not masters_private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.masters_trainings(training_date) values(day) returning id into result;
 insert into public.masters_attendance(training_id,player_id) select result,id from public.masters_players where active;
 return result;
end $$;

-- A single transaction creates a payment and its exact per-absence allocations.
-- Client-generated UUID makes a retry safe: duplicates fail without double charging.
create function public.masters_record_payment(payment_uuid uuid, target_player uuid, cents integer, allocations jsonb, memo text default '') returns uuid
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; total bigint:=0; begin
 if not masters_private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 if allocations is null or jsonb_typeof(allocations)<>'array' or jsonb_array_length(allocations)=0 or memo is null or length(memo)>500 then raise exception 'Invalid payment'; end if;
 perform 1 from public.masters_players where id=target_player for update;
 insert into public.masters_payments(id,player_id,amount_cents,note,created_by) values(payment_uuid,target_player,cents,memo,auth.uid());
 for item in select value from jsonb_array_elements(allocations) loop
 insert into public.masters_payment_allocations(payment_id,training_id,player_id,amount_cents)
 values(payment_uuid,(item->>'training_id')::uuid,target_player,(item->>'amount_cents')::integer);
 total:=total+(item->>'amount_cents')::integer;
 end loop;
 if total<>cents then raise exception 'Allocate the full payment'; end if;
 return payment_uuid;
end $$;
create function public.masters_reverse_payment(payment_uuid uuid, reason text) returns void
language plpgsql security invoker set search_path = '' as $$
declare p uuid; begin
 if not masters_private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 if reason is null or length(trim(reason)) not between 3 and 500 then raise exception 'A correction reason is required'; end if;
 select player_id into p from public.masters_payments where id=payment_uuid;
 if p is null then raise exception 'Payment not found'; end if;
 perform 1 from public.masters_players where id=p for update;
 update public.masters_payments set note=reason,created_by=auth.uid() where id=payment_uuid;
 delete from public.masters_payment_allocations where payment_id=payment_uuid;
 delete from public.masters_payments where id=payment_uuid;
end $$;
revoke all on function public.masters_create_training(date),public.masters_record_payment(uuid,uuid,integer,jsonb,text),public.masters_reverse_payment(uuid,text) from public,anon;
grant execute on function public.masters_create_training(date),public.masters_record_payment(uuid,uuid,integer,jsonb,text),public.masters_reverse_payment(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('masters-lead-foot','masters-lead-foot',false,5242880,array['image/jpeg']);
create policy masters_images_read on storage.objects for select to authenticated
 using(bucket_id='masters-lead-foot' and (select masters_private.can_read()));
create policy masters_images_write on storage.objects for all to authenticated
 using(bucket_id='masters-lead-foot' and (select masters_private.is_admin()))
 with check(bucket_id='masters-lead-foot' and (select masters_private.is_admin()) and lower(storage.extension(name))='jpg');
