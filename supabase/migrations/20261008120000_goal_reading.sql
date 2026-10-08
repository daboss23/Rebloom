-- Claude's reading of the client's own words (DECISIONS D-079): which measurements they meant, and the phrase to say
-- back to them, keyed to the exact words read. Null until read; the app falls back to its word list meanwhile.
-- Access model unchanged: RLS on, no policies, server only. The sandbox copy (jsonb_populate_recordset) picks it up.

alter table public.intakes add column goal_reading jsonb;
