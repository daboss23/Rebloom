-- Table privileges, stated outright. Fixes "permission denied for table clinics" on deploys.
--
-- A Supabase project can be set not to expose new tables to the Data API automatically. Tables made in
-- SQL then carry no privileges for the API roles, service_role included, which the server uses. Granting
-- here makes the schema behave the same however a project is set up.
--
-- service_role (the server): read and write. It bypasses row level security but still needs privileges.
-- anon and authenticated (the public key; signed-in staff from Week 3): nothing. RLS with no policies
-- already shows them no rows; revoking means even a policy added by mistake can't open a table.
-- Staff get exactly what they need when dashboard login arrives.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.usage_totals(text, timestamptz, uuid, text) to service_role;

revoke all on all tables in schema public from anon, authenticated;

-- Tables created by later migrations get the server's privileges too.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
