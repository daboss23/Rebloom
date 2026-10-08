-- Texts (DECISIONS D-080): consent to texts is its own record, separate from email reminders.
-- Messages already allow the 'sms' channel (20261006120000_clinic_side). Access model unchanged.

alter table public.consents drop constraint consents_type_check;
alter table public.consents add constraint consents_type_check check (type in ('biometric', 'reminders', 'texts'));
