create table if not exists ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed')),
  source_url text,
  canonical_url text,
  staged_gcs_uris jsonb not null default '[]'::jsonb,
  upload_title text,
  reel_id uuid references reels(id) on delete set null,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingest_jobs_user_id_created_at_idx
  on ingest_jobs (user_id, created_at desc);

-- At most one in-flight job per URL per user, so repeated saves don't double-ingest.
create unique index if not exists ingest_jobs_active_url_idx
  on ingest_jobs (user_id, canonical_url)
  where canonical_url is not null and status in ('queued', 'processing');

alter table ingest_jobs enable row level security;
