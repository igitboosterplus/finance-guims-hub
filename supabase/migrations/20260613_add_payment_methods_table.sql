create table if not exists public.payment_methods (
  id text primary key,
  data jsonb,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;