-- Ensure payment_methods is covered by strict RLS policy set.
-- This migration is idempotent and safe on existing projects.

create schema if not exists app;

create or replace function app.jwt_role()
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      auth.jwt() ->> 'app_role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    )
  );
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
as $$
  select app.jwt_role() in ('superadmin', 'admin');
$$;

alter table if exists payment_methods enable row level security;
alter table if exists payment_methods force row level security;

drop policy if exists "Allow all" on payment_methods;
drop policy if exists staff_all_payment_methods on payment_methods;

revoke all on table payment_methods from anon;
grant select, insert, update, delete on table payment_methods to authenticated;

create policy staff_all_payment_methods
on payment_methods
for all
to authenticated
using (app.is_staff())
with check (app.is_staff());
