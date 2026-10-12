-- The agent's drafts (DECISIONS D-093): an answer to a client's reply, or a second look at a stalled plan, written
-- for Dana to read, change and send herself. Nothing here reaches a client on its own. What Dana sent is kept beside
-- what the agent wrote, so later drafts can learn her voice.
-- Access model unchanged: RLS on, no policies, server only. Goes with its client and sandbox (on delete cascade).
-- The app runs before this is applied: reading drafts fails quietly and the agent stays off.

create table public.agent_drafts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sandbox_id uuid references public.sandboxes (id) on delete cascade,
  kind text not null check (kind in ('answer', 'plan_review')),
  -- The reply's message id, or the queue item's dedupe key.
  for_key text not null,
  status text not null check (status in ('working', 'ready', 'failed', 'used', 'dismissed')),
  channel text check (channel in ('email', 'sms')),
  subject text,
  body text,
  note text,
  steps jsonb not null default '[]',
  suggestion jsonb,
  offered_times text[] not null default '{}',
  model text,
  tokens integer not null default 0 check (tokens >= 0),
  sent_body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One draft per client for each reply or queue item, so two page loads can't start the same work twice.
create unique index agent_drafts_for_idx on public.agent_drafts (client_id, for_key);
create index agent_drafts_book_idx on public.agent_drafts (clinic_id, sandbox_id, created_at);

alter table public.agent_drafts enable row level security;
grant select, insert, update, delete on public.agent_drafts to service_role;
revoke all on public.agent_drafts from anon, authenticated;
