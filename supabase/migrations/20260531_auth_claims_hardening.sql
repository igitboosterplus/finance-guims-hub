-- Auth claims hardening: trust role only from app_metadata (and optional custom top-level app_role).
-- Removes fallback to user_metadata role to avoid client-mutable authorization sources.

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
