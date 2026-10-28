-- The morning run (DECISIONS D-097): the agent also writes Dana's own version of each message the rebook queue would
-- send, kept as an agent draft of kind 'outreach', keyed by the queue item's dedupe key like a second look.
-- The app runs before this is applied: starting an outreach draft is refused, the queue keeps its standard messages,
-- and answers and second looks carry on.

alter table public.agent_drafts drop constraint if exists agent_drafts_kind_check;
alter table public.agent_drafts add constraint agent_drafts_kind_check check (kind in ('answer', 'plan_review', 'outreach'));
