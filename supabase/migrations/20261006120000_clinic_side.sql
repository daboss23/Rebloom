-- The clinic side (brief section 5, Week 3): staff, confirmed plans, appointments and the outbox,
-- plus what each sandbox needs to hold its own copy of the demo clients (DECISIONS D-014, D-049).
-- Mirrors src/lib/domain.ts; columns are snake_case. Access model unchanged: RLS on, no policies,
-- server-only access with the service role.

-- ---------- Staff (seeded from src/data/staff.ts, shared by every sandbox) ----------

create table public.staff (
  id uuid primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  -- Supabase Auth user, once dashboard login exists. "Enter demo as Dana" needs none.
  user_id uuid unique,
  name text not null,
  title text not null,
  role text not null check (role in ('owner', 'practitioner')),
  created_at timestamptz not null default now()
);
create index staff_clinic_idx on public.staff (clinic_id);

-- ---------- Demo clients: one copy per sandbox and clinic ----------

alter table public.clients
  add column last_name text,
  -- Which demo client this row was copied from ("amelia"). Null for real clients.
  add column demo_key text;
-- A sandbox holds each demo client at most once, however many requests race to copy them.
create unique index clients_demo_copy_idx on public.clients (clinic_id, sandbox_id, demo_key);

-- ---------- Plans: what the practitioner confirmed with the client ----------
-- The report's suggested plan is computed from the scan and menu (src/lib/plan/build.ts) and never
-- stored. A row here is a plan someone proposed or confirmed, with prices fixed at that moment.

create table public.plans (
  id uuid primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The scan the plan was built from.
  scan_id uuid references public.scans (id) on delete set null,
  status text not null check (status in ('proposed', 'confirmed', 'completed', 'cancelled')),
  confirmed_by uuid references public.staff (id) on delete set null,
  confirmed_at timestamptz,
  -- Every item, home care included. Sum of plan_items, computed in code.
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  check (status not in ('confirmed', 'completed') or confirmed_at is not null)
);
-- At most one live plan per client, so two "Confirm plan" clicks can't make two.
create unique index plans_one_live_idx on public.plans (client_id) where status in ('proposed', 'confirmed');

create table public.plan_items (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  treatment_id uuid references public.treatments (id),
  product_id uuid references public.products (id),
  -- Sessions for a treatment, units for a product.
  quantity integer not null check (quantity > 0),
  -- Menu price when the plan was made, so a later price change doesn't rewrite it.
  unit_price_cents integer not null check (unit_price_cents >= 0),
  position integer not null,
  -- When the first session is planned. Null for products.
  target_date date,
  check ((treatment_id is null) <> (product_id is null))
);
create index plan_items_plan_idx on public.plan_items (plan_id, position);

-- ---------- Appointments ----------
-- One treatment room per clinic for now (DECISIONS D-049): no two booked appointments in the same
-- sandbox may overlap. The exclusion constraint makes that hold even when two bookings race.

create extension if not exists btree_gist with schema extensions;

create table public.appointments (
  id uuid primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  kind text not null check (kind in ('consult', 'treatment')),
  treatment_id uuid references public.treatments (id),
  plan_item_id uuid references public.plan_items (id) on delete set null,
  staff_id uuid references public.staff (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  deposit_status text not null default 'none' check (deposit_status in ('none', 'pending', 'paid', 'refunded')),
  -- Stripe's reference for the deposit (Week 2 booking).
  deposit_payment_intent text unique,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((kind = 'treatment') = (treatment_id is not null)),
  constraint appointments_no_overlap exclude using gist (
    clinic_id with =,
    (coalesce(sandbox_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked')
);
create index appointments_clinic_sandbox_idx on public.appointments (clinic_id, sandbox_id, starts_at);
create index appointments_client_idx on public.appointments (client_id, starts_at);

-- ---------- Messages: the outbox (brief section 5) ----------
-- Demo emails go to a visible log, never a real inbox, unless the address is a verified test address.

create table public.messages (
  id uuid primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  -- What prompted it: "report_link", "booking_confirmation", or a rebook trigger such as "next_session_due".
  type text not null,
  channel text not null check (channel in ('email', 'sms')),
  subject text,
  body text not null,
  status text not null check (status in ('draft', 'queued', 'sent', 'failed', 'skipped')),
  -- The rebook engine's idempotency key, e.g. "next_session_due:2026-11-03". It never queues a message twice.
  dedupe_key text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index messages_dedupe_idx on public.messages (client_id, dedupe_key);
create index messages_clinic_sandbox_idx on public.messages (clinic_id, sandbox_id, created_at);

-- ---------- Copying the demo clients into a sandbox, all or nothing ----------
-- The bundle is built in code (src/lib/demo/seed.ts) with dates relative to the sandbox's "today".
-- Returns false when this sandbox already has its copy, including when another request just made it.

create function public.seed_demo_clients(p_clinic_id uuid, p_sandbox_id uuid, p_bundle jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.clients
    where clinic_id = p_clinic_id and sandbox_id = p_sandbox_id and demo_key is not null
  ) then
    return false;
  end if;

  insert into public.clients select * from jsonb_populate_recordset(null::public.clients, p_bundle -> 'clients');
  insert into public.consents select * from jsonb_populate_recordset(null::public.consents, p_bundle -> 'consents');
  insert into public.intakes select * from jsonb_populate_recordset(null::public.intakes, p_bundle -> 'intakes');
  insert into public.scans select * from jsonb_populate_recordset(null::public.scans, p_bundle -> 'scans');
  insert into public.reports select * from jsonb_populate_recordset(null::public.reports, p_bundle -> 'reports');
  insert into public.plans select * from jsonb_populate_recordset(null::public.plans, p_bundle -> 'plans');
  insert into public.plan_items select * from jsonb_populate_recordset(null::public.plan_items, p_bundle -> 'plan_items');
  insert into public.appointments select * from jsonb_populate_recordset(null::public.appointments, p_bundle -> 'appointments');
  insert into public.messages select * from jsonb_populate_recordset(null::public.messages, p_bundle -> 'messages');
  return true;
exception
  -- Everything above is rolled back. If a racing request copied them first, that's an answer;
  -- any other duplicate is a bug in the bundle and is raised.
  when unique_violation then
    if exists (
      select 1 from public.clients
      where clinic_id = p_clinic_id and sandbox_id = p_sandbox_id and demo_key is not null
    ) then
      return false;
    end if;
    raise;
end;
$$;
revoke execute on function public.seed_demo_clients(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seed_demo_clients(uuid, uuid, jsonb) to service_role;

-- ---------- Row level security and privileges, as in 20261005130000_grants ----------

alter table public.staff enable row level security;
alter table public.plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.appointments enable row level security;
alter table public.messages enable row level security;

grant select, insert, update, delete on all tables in schema public to service_role;
-- Supabase's default privileges hand new tables to the API roles. Take them back.
revoke all on all tables in schema public from anon, authenticated;
