-- The demo clock's jump to the next opening (DECISIONS D-091): minutes beyond the whole days it already runs ahead,
-- so the clock can land on the clinic's opening time. Reads select every column, so the app runs before this is
-- applied; only that jump needs it.

alter table public.sandboxes
  add column clock_offset_minutes integer not null default 0
  check (clock_offset_minutes >= 0 and clock_offset_minutes < 1440);
