-- 1. Add user_id column to reels table referencing auth.users
alter table reels add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Clean up: Delete non-sample reels (keep only the first 4 chronologically)
delete from reels where id not in (
  'f9156ea9-02e5-4b19-9e68-d1d9cca834e8',
  '8e26a5dd-a6ba-4f11-818f-5787866cb721',
  'a73a8fdd-acfa-4ca8-98fa-d58a8c7b4f70',
  '9163feb4-e66d-4037-be9e-bfebde582731'
);

-- 3. Drop existing unique constraint on canonical_url
alter table reels drop constraint if exists reels_canonical_url_key;

-- 4. Add compound unique constraint on (canonical_url, user_id)
alter table reels add constraint reels_canonical_url_user_id_key unique (canonical_url, user_id);

-- 5. Enable Row Level Security (RLS) on reels
alter table reels enable row level security;

-- 6. Create Row Level Security (RLS) Policies
create policy "Users can select their own reels and sample reels"
  on reels for select
  to authenticated, anon
  using ((auth.uid() = user_id) or (user_id is null));

create policy "Users can only insert their own reels"
  on reels for insert
  to authenticated, anon
  with check (auth.uid() = user_id);

create policy "Users can only update their own reels"
  on reels for update
  to authenticated, anon
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only delete their own reels"
  on reels for delete
  to authenticated, anon
  using (auth.uid() = user_id);

-- 7. Update match_reels function to filter by user_id
create or replace function match_reels(
  query_text text,
  query_embedding vector(1536),
  match_count int default 10,
  filter_user_id uuid default null
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
  where (reels.user_id = filter_user_id or reels.user_id is null)
  order by score desc, reels.created_at desc
  limit match_count;
end;
$$;
