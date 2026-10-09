-- Replies from clients (DECISIONS D-081): a client's email or text back to the clinic lands in the same messages
-- table as what the clinic sent, so a client's conversation reads in one order. A reply is status 'received', with
-- the address or number it came from in `sender`. Null for everything the clinic sends.
-- Access model unchanged: RLS on, no policies, server only. The sandbox copy (jsonb_populate_recordset) picks it up.

alter table public.messages drop constraint messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('draft', 'queued', 'sent', 'failed', 'skipped', 'received'));
alter table public.messages add column sender text;
-- One client's conversation, in order (the brief, and the safety valve on replies).
create index messages_client_idx on public.messages (client_id, created_at);
