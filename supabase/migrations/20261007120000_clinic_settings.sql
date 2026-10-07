-- Settings a clinic owner changes from the dashboard (DECISIONS D-066). First: whether booking takes a deposit.
-- One row per clinic and sandbox, so in the demo each browser's switch is its own (D-013). No row means the
-- defaults: a deposit is taken. Access model unchanged: RLS on, no policies, server only.

create table public.clinic_settings (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  deposit_required boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint clinic_settings_scope unique nulls not distinct (clinic_id, sandbox_id)
);

alter table public.clinic_settings enable row level security;
grant select, insert, update, delete on public.clinic_settings to service_role;
revoke all on public.clinic_settings from anon, authenticated;
