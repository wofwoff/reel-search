create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists reels (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  canonical_url text unique,
  title text,
  caption text,
  creator text,
  thumbnail_url text,
  embedding vector(1536) not null,
  embedding_model text not null default 'gemini-embedding-2',
  ingest_status text not null,
  created_at timestamptz not null default now(),
  gcs_uri text,
  summary text,
  actionable_items text,
  resources text
);

create index if not exists reels_embedding_cosine_idx
  on reels using hnsw (embedding vector_cosine_ops);

create index if not exists reels_created_at_idx on reels (created_at desc);

create or replace function match_reels(
  query_text text,
  query_embedding vector(1536),
  match_count int default 10
)
returns table (
  id uuid,
  source_url text,
  canonical_url text,
  title text,
  caption text,
  creator text,
  thumbnail_url text,
  ingest_status text,
  created_at timestamptz,
  gcs_uri text,
  summary text,
  actionable_items text,
  resources text,
  score double precision
)
language plpgsql
stable
as $$
declare
  has_text boolean;
  and_query tsquery;
  or_query tsquery;
begin
  has_text := (query_text is not null and trim(query_text) <> '');
  if has_text then
    and_query := plainto_tsquery('english', query_text);
    -- Replace '&' with '|' to allow softer matching for ranking
    or_query := to_tsquery('english', replace(and_query::text, '&', '|'));
  end if;

  return query
  select
    reels.id,
    reels.source_url,
    reels.canonical_url,
    reels.title,
    reels.caption,
    reels.creator,
    reels.thumbnail_url,
    reels.ingest_status,
    reels.created_at,
    reels.gcs_uri,
    reels.summary,
    reels.actionable_items,
    reels.resources,
    case
      when not has_text then
        -- Default to vector cosine similarity if query_text is empty
        1 - (reels.embedding <=> query_embedding)
      else
        coalesce(
          (1 - (reels.embedding <=> query_embedding)) +
          (1 - (1 - (reels.embedding <=> query_embedding))) *
          (
            0.3 * (1.0 - exp(-coalesce(
              ts_rank_cd(
                to_tsvector('english', coalesce(reels.title, '') || ' ' || coalesce(reels.caption, '') || ' ' || coalesce(reels.creator, '') || ' ' || coalesce(reels.summary, '') || ' ' || coalesce(reels.actionable_items, '') || ' ' || coalesce(reels.resources, '')),
                and_query
              ) * 1.5 +
              ts_rank_cd(
                to_tsvector('english', coalesce(reels.title, '') || ' ' || coalesce(reels.caption, '') || ' ' || coalesce(reels.creator, '') || ' ' || coalesce(reels.summary, '') || ' ' || coalesce(reels.actionable_items, '') || ' ' || coalesce(reels.resources, '')),
                or_query
              ) * 0.5,
              0.0
            ))) +
            0.7 * (
              case
                -- Exact contiguous phrase matches
                when reels.title ilike '%' || query_text || '%' then 1.0
                when reels.creator ilike '%' || query_text || '%' then 0.9
                when reels.caption ilike '%' || query_text || '%' then 0.8
                when reels.summary ilike '%' || query_text || '%' then 0.7
                -- FTS field matches (all words matched somewhere in that field)
                when (to_tsvector('english', coalesce(reels.title, '')) @@ and_query) then 0.8
                when (to_tsvector('english', coalesce(reels.creator, '')) @@ and_query) then 0.7
                when (to_tsvector('english', coalesce(reels.caption, '')) @@ and_query) then 0.6
                when (to_tsvector('english', coalesce(reels.summary, '')) @@ and_query) then 0.5
                else 0.0
              end
            )
          ) * 0.95,
          1 - (reels.embedding <=> query_embedding)
        )
    end as score
  from reels
  order by score desc, reels.created_at desc
  limit match_count;
end;
$$;
