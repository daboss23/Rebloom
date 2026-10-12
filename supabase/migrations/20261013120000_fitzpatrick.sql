-- Fitzpatrick skin type (DECISIONS D-094). YouCam's estimate from a client's first live scan, or the clinic's own
-- call, kept on the client; and, per treatment, the highest type the clinic offers it to. A safety prompt for the
-- practitioner: the plan leaves out treatments that don't suit the client's type. Never shown to the client.
-- Access model unchanged: RLS on, no policies, server only.

-- { "type": "IV", "source": "scan" | "practitioner", "at": "...", "scanId": "..." }
alter table public.clients add column fitzpatrick jsonb;

-- The Fitzpatrick task started beside the analysis, read when the scan finalises.
alter table public.scans add column fitzpatrick_task_id text;

-- 1 to 6: the highest type this treatment is offered to. Null: every type.
alter table public.treatments add column fitzpatrick_max smallint check (fitzpatrick_max between 1 and 6);

-- The demo menu's light-based treatment: types I to III, as the seed now says (src/data/menu.ts).
update public.treatments set fitzpatrick_max = 3 where name = 'IPL Photofacial' and fitzpatrick_max is null;
