-- Rebloom core schema (PLAN.md step 7). Mirrors src/lib/domain.ts; columns are snake_case.
--
-- Access model: every table has row level security on and no policies, so the anon and
-- authenticated roles can read and write nothing. The app talks to the database only from
-- the server, with the service role. Clients reach their own data through an unguessable
-- report token, checked in server routes (brief section 5). Staff policies arrive with
-- dashboard login in Week 3.
--
-- Enumerations are text plus a check constraint, so adding a value is a one-line migration.

-- ---------- Clinics and their menus (seeded from src/data) ----------

create table public.clinics (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  wordmark text not null,
  wordmark_style text not null check (wordmark_style in ('serif', 'sans')),
  monogram_url text,
  lockup_url text,
  accent_hex text not null check (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  city text not null,
  address text not null,
  phone text not null,
  timezone text not null,
  hours jsonb not null,
  deposit_cents integer not null check (deposit_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.treatments (
  id uuid primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  -- Null means an ongoing treatment, such as a monthly facial.
  sessions_typical integer check (sessions_typical > 0),
  interval_days_min integer not null check (interval_days_min > 0),
  interval_days_max integer not null,
  maintenance_interval_days integer check (maintenance_interval_days > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  downtime_days integer not null default 0 check (downtime_days >= 0),
  min_days_before_event integer not null default 0 check (min_days_before_event >= 0),
  concerns text[] not null default '{}',
  screening_flags text[] not null default '{}',
  active boolean not null default true,
  -- Menu order, as listed in src/data/menu.ts.
  position integer not null default 0,
  check (interval_days_max >= interval_days_min)
);
create index treatments_clinic_idx on public.treatments (clinic_id);

create table public.products (
  id uuid primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  concerns text[] not null default '{}',
  active boolean not null default true,
  position integer not null default 0
);
create index products_clinic_idx on public.products (clinic_id);

-- ---------- Per-browser sandboxes (DECISIONS D-013) ----------
-- Deleting a sandbox removes its clients, scans, reports and events. Photos in storage are
-- removed by the keep-alive job before it deletes the rows (src/app/api/cron/keep-alive).

create table public.sandboxes (
  id uuid primary key,
  created_at timestamptz not null default now(),
  clock_offset_days integer not null default 0 check (clock_offset_days >= 0)
);
create index sandboxes_created_idx on public.sandboxes (created_at);

-- ---------- Clients and their answers ----------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  -- Null for shared seed templates (DECISIONS D-014).
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  first_name text,
  email text,
  phone text,
  age_range text check (age_range in ('under_25', '25_34', '35_44', '45_54', '55_64', '65_plus')),
  status text not null default 'started'
    check (status in ('started', 'lead', 'booked', 'in_course', 'course_complete', 'at_risk', 'lapsed')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index clients_clinic_sandbox_idx on public.clients (clinic_id, sandbox_id);
create index clients_sandbox_idx on public.clients (sandbox_id);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  type text not null check (type in ('biometric', 'reminders')),
  granted_at timestamptz not null,
  text_version text not null,
  -- Salted hash, never the raw address (DECISIONS D-015).
  ip_hash text,
  user_agent text
);
create index consents_client_idx on public.consents (client_id);

create table public.intakes (
  client_id uuid primary key references public.clients (id) on delete cascade,
  concerns text[] not null default '{}',
  concerns_other text,
  goal_text text,
  has_event boolean,
  event_type text check (event_type in ('wedding', 'holiday', 'reunion', 'other')),
  event_date date,
  past_treatments text[] not null default '{}',
  budget_band text check (budget_band in ('under_500', '500_1000', '1000_2000', '2000_plus')),
  screening jsonb not null default '{}',
  sensitivities_note text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- Scans and reports ----------

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  scan_number integer not null check (scan_number > 0),
  status text not null
    check (status in ('uploading', 'uploaded', 'analyzing', 'finalizing', 'complete', 'failed')),
  source text not null check (source in ('live', 'fixture')),
  image_path text not null,
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  capture_quality jsonb,
  landmarks jsonb,
  concerns_requested text[] not null default '{}',
  provider_task_id text,
  analysis_started_at timestamptz,
  error_code text,
  -- The provider's response as received, kept because YouCam deletes results after 24 hours.
  youcam_raw jsonb,
  -- Our normalised scores (ScanResult). Progress maths reads raw scores from here (D-009).
  result jsonb,
  comparison_confidence text check (comparison_confidence in ('high', 'lower')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index scans_client_idx on public.scans (client_id, created_at);
create index scans_sandbox_idx on public.scans (sandbox_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients (id) on delete cascade,
  -- The only key to a report (192 random bits, src/lib/ids.ts).
  token text not null unique check (length(token) >= 20),
  content jsonb,
  practitioner_note text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- ---------- Usage and events ----------

-- No foreign keys on purpose: unit spend must outlive deleted clients and sandboxes,
-- or the reserve check would hand spent units back.
create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('youcam', 'anthropic')),
  feature text not null,
  units integer not null check (units >= 0),
  task_id text,
  sandbox_id uuid,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index api_usage_provider_created_idx on public.api_usage (provider, created_at);

-- Unit totals for the safety valves (src/lib/limits). Summed in the database because the
-- Data API returns at most 1,000 rows, which would quietly undercount all-time spend.
create function public.usage_totals(
  p_provider text,
  p_since timestamptz,
  p_sandbox_id uuid default null,
  p_ip_hash text default null
)
returns table (units bigint, count bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(u.units), 0)::bigint, count(*)::bigint
  from public.api_usage u
  where u.provider = p_provider
    and u.created_at >= p_since
    and (p_sandbox_id is null or u.sandbox_id = p_sandbox_id)
    and (p_ip_hash is null or u.ip_hash = p_ip_hash);
$$;
revoke execute on function public.usage_totals(text, timestamptz, uuid, text) from public, anon, authenticated;

-- Audit trail and rebook-engine input. A deleted client leaves one anonymous event (D-029).
create table public.events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_clinic_created_idx on public.events (clinic_id, created_at);

-- ---------- Row level security: on everywhere, no policies yet ----------

alter table public.clinics enable row level security;
alter table public.treatments enable row level security;
alter table public.products enable row level security;
alter table public.sandboxes enable row level security;
alter table public.clients enable row level security;
alter table public.consents enable row level security;
alter table public.intakes enable row level security;
alter table public.scans enable row level security;
alter table public.reports enable row level security;
alter table public.api_usage enable row level security;
alter table public.events enable row level security;

-- ---------- Private photo storage ----------
-- Face photos and masks. Not public, and no storage policies, so only the service role can
-- read or write. Browsers upload through one-time signed URLs and view photos through our
-- own routes, which check the report token first.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 8388608, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
