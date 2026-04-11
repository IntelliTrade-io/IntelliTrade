create table if not exists public.conflict_cache (
  cache_key text primary key,
  window text not null,
  query text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists conflict_cache_expires_at_idx
  on public.conflict_cache (expires_at);

alter table public.conflict_cache enable row level security;

create or replace function public.purge_expired_conflict_cache()
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  delete from public.conflict_cache
  where expires_at <= now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
