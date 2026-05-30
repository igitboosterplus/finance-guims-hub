-- Strict RLS hardening for Guims Finance Hub
-- WARNING: this migration intentionally removes permissive "Allow all" policies.
-- It expects authenticated users (JWT) with role claim in app_metadata/user_metadata.

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

-- Harden all business tables.
alter table if exists transactions enable row level security;
alter table if exists users enable row level security;
alter table if exists employees enable row level security;
alter table if exists stock_items enable row level security;
alter table if exists stock_movements enable row level security;
alter table if exists trainings enable row level security;
alter table if exists audit_log enable row level security;
alter table if exists super_audit enable row level security;
alter table if exists formations_catalog enable row level security;
alter table if exists payment_plans enable row level security;
alter table if exists stock_kits enable row level security;
alter table if exists enrollments enable row level security;
alter table if exists deleted_ids enable row level security;

alter table if exists transactions force row level security;
alter table if exists users force row level security;
alter table if exists employees force row level security;
alter table if exists stock_items force row level security;
alter table if exists stock_movements force row level security;
alter table if exists trainings force row level security;
alter table if exists audit_log force row level security;
alter table if exists super_audit force row level security;
alter table if exists formations_catalog force row level security;
alter table if exists payment_plans force row level security;
alter table if exists stock_kits force row level security;
alter table if exists enrollments force row level security;
alter table if exists deleted_ids force row level security;

-- Remove old permissive policies if they exist.
drop policy if exists "Allow all" on transactions;
drop policy if exists "Allow all" on users;
drop policy if exists "Allow all" on employees;
drop policy if exists "Allow all" on stock_items;
drop policy if exists "Allow all" on stock_movements;
drop policy if exists "Allow all" on trainings;
drop policy if exists "Allow all" on audit_log;
drop policy if exists "Allow all" on super_audit;
drop policy if exists "Allow all" on formations_catalog;
drop policy if exists "Allow all" on payment_plans;
drop policy if exists "Allow all" on stock_kits;
drop policy if exists "Allow all" on enrollments;
drop policy if exists "Allow all" on deleted_ids;

-- Drop previously created strict policies to keep migration idempotent.
drop policy if exists staff_all_transactions on transactions;
drop policy if exists staff_all_users on users;
drop policy if exists staff_all_employees on employees;
drop policy if exists staff_all_stock_items on stock_items;
drop policy if exists staff_all_stock_movements on stock_movements;
drop policy if exists staff_all_trainings on trainings;
drop policy if exists staff_all_audit_log on audit_log;
drop policy if exists staff_all_super_audit on super_audit;
drop policy if exists staff_all_formations_catalog on formations_catalog;
drop policy if exists staff_all_payment_plans on payment_plans;
drop policy if exists staff_all_stock_kits on stock_kits;
drop policy if exists staff_all_enrollments on enrollments;
drop policy if exists staff_all_deleted_ids on deleted_ids;

-- Deny anonymous usage by default.
revoke all on table transactions from anon;
revoke all on table users from anon;
revoke all on table employees from anon;
revoke all on table stock_items from anon;
revoke all on table stock_movements from anon;
revoke all on table trainings from anon;
revoke all on table audit_log from anon;
revoke all on table super_audit from anon;
revoke all on table formations_catalog from anon;
revoke all on table payment_plans from anon;
revoke all on table stock_kits from anon;
revoke all on table enrollments from anon;
revoke all on table deleted_ids from anon;

-- Allow authenticated staff only.
grant select, insert, update, delete on table transactions to authenticated;
grant select, insert, update, delete on table users to authenticated;
grant select, insert, update, delete on table employees to authenticated;
grant select, insert, update, delete on table stock_items to authenticated;
grant select, insert, update, delete on table stock_movements to authenticated;
grant select, insert, update, delete on table trainings to authenticated;
grant select, insert, update, delete on table audit_log to authenticated;
grant select, insert, update, delete on table super_audit to authenticated;
grant select, insert, update, delete on table formations_catalog to authenticated;
grant select, insert, update, delete on table payment_plans to authenticated;
grant select, insert, update, delete on table stock_kits to authenticated;
grant select, insert, update, delete on table enrollments to authenticated;
grant select, insert, update, delete on table deleted_ids to authenticated;

create policy staff_all_transactions on transactions
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_users on users
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_employees on employees
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_stock_items on stock_items
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_stock_movements on stock_movements
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_trainings on trainings
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_audit_log on audit_log
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_super_audit on super_audit
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_formations_catalog on formations_catalog
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_payment_plans on payment_plans
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_stock_kits on stock_kits
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_enrollments on enrollments
for all to authenticated
using (app.is_staff())
with check (app.is_staff());

create policy staff_all_deleted_ids on deleted_ids
for all to authenticated
using (app.is_staff())
with check (app.is_staff());
