-- Reply alerts (DECISIONS D-087): where the clinic is told the moment a client writes back. An email address and a
-- US mobile, both optional, kept with the clinic's other settings (per sandbox in the demo, D-013). Null: no alert.
-- Access model unchanged: RLS on, no policies, server only. Reads select every column, so the app runs before this
-- is applied; saving an alert address needs it.

alter table public.clinic_settings add column alert_email text;
alter table public.clinic_settings add column alert_phone text;
