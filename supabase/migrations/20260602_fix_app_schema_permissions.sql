-- Fix permissions for app schema/functions used by RLS policies.
-- Symptom fixed: "permission denied for schema app"

create schema if not exists app;

grant usage on schema app to authenticated;
grant usage on schema app to service_role;

grant execute on function app.jwt_role() to authenticated;
grant execute on function app.is_staff() to authenticated;

grant execute on function app.jwt_role() to service_role;
grant execute on function app.is_staff() to service_role;
