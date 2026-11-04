-- Draft migration; DO NOT APPLY until current remote schema and roles are audited.
create table if not exists public.masters_players (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (length(trim(display_name)) between 1 and 120),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.masters_trainings (
 id uuid primary key default gen_random_uuid(),
 training_date date not null unique check (extract(isodow from training_date)=3 and training_date >= date '2026-10-21'),
 status text not null default 'open' check(status in ('open','closed','cancelled')),
 lead_foot_player_id uuid references public.masters_players(id),
 lead_foot_image_path text,
 created_at timestamptz not null default now()
);
create table if not exists public.masters_attendance (
 training_id uuid not null references public.masters_trainings(id) on delete cascade,
 player_id uuid not null references public.masters_players(id),
 status text not null default 'pending' check(status in ('pending','present','absent','excused')),
 primary key(training_id,player_id)
);
create table if not exists public.masters_payments (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.masters_players(id),
 amount_cents integer not null check(amount_cents>0),
 paid_at timestamptz not null default now(),
 note text,
 created_by uuid references auth.users(id)
);
create table if not exists public.masters_payment_allocations (
 payment_id uuid not null references public.masters_payments(id) on delete cascade,
 training_id uuid not null,
 player_id uuid not null,
 amount_cents integer not null check(amount_cents>0),
 primary key(payment_id,training_id,player_id),
 foreign key(training_id,player_id) references public.masters_attendance(training_id,player_id)
);
create table if not exists public.masters_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 event_type text not null,
 record_id text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists masters_attendance_player on public.masters_attendance(player_id);
create index if not exists masters_payments_player on public.masters_payments(player_id);
alter table public.masters_players enable row level security;
alter table public.masters_trainings enable row level security;
alter table public.masters_attendance enable row level security;
alter table public.masters_payments enable row level security;
alter table public.masters_payment_allocations enable row level security;
alter table public.masters_audit enable row level security;
-- No policies or grants yet: fail-closed until verified authorization and payment RPCs are designed.
