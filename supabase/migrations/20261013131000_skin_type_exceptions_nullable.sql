-- Follows 20261013130000_skin_type_exceptions. The demo seed inserts clients in bulk and sends
-- null for columns it doesn't name, which the not-null constraint refused. Null now reads as "no exceptions";
-- the app treats null and [] alike.
alter table public.clients alter column skin_type_exceptions drop not null;
