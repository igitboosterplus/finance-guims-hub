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
do $$
declare
  t text;
  p text;
begin
  for t in
    select unnest(array[
      'transactions',
      'users',
      'employees',
      'stock_items',
      'stock_movements',
      'trainings',
      'audit_log',
      'super_audit',
      'formations_catalog',
      'payment_plans',
      'stock_kits',
      'enrollments',
      'deleted_ids'
    ])
  loop
    if to_regclass(t) is null then
      continue;
    end if;

    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format('drop policy if exists "Allow all" on %I', t);
    execute format('drop policy if exists %I on %I', 'staff_all_' || t, t);

    execute format('revoke all on table %I from anon', t);
    execute format('grant select, insert, update, delete on table %I to authenticated', t);

    p := format('staff_all_%s', t);
    execute format(
      'create policy %I on %I for all to authenticated using (app.is_staff()) with check (app.is_staff())',
      p,
      t
    );
  end loop;
end
$$;
