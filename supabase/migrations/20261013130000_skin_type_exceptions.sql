-- Dana's exceptions to the skin type rule (DECISIONS D-095): a treatment the clinic doesn't usually offer to a client's
-- Fitzpatrick type, offered to this client anyway, with her reason, her name and when. A record of the call.
-- [{ "treatmentId": "...", "reason": "Patch test clear, Oct 14", "by": "Dana", "at": "...", "type": "V" }]
-- Access model unchanged: RLS on, no policies, server only.

alter table public.clients add column skin_type_exceptions jsonb not null default '[]';
