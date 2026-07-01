alter table reels drop column if exists tags;

create table if not exists reel_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reel_collection_items (
  collection_id uuid not null references reel_collections(id) on delete cascade,
  reel_id uuid not null references reels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, reel_id)
);

create unique index if not exists reel_collection_items_reel_id_key
  on reel_collection_items (reel_id);

create unique index if not exists reel_collections_user_name_key
  on reel_collections (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index if not exists reel_collections_user_updated_idx
  on reel_collections (user_id, updated_at desc);

create index if not exists reel_collection_items_collection_idx
  on reel_collection_items (collection_id);

create or replace function set_reel_collection_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reel_collections_set_updated_at on reel_collections;
create trigger reel_collections_set_updated_at
  before update on reel_collections
  for each row
  execute function set_reel_collection_updated_at();

alter table reel_collections enable row level security;
alter table reel_collection_items enable row level security;

create policy "Users can select their own reel collections"
  on reel_collections for select
  to authenticated, anon
  using ((auth.uid() = user_id) or (user_id is null));

create policy "Users can insert their own reel collections"
  on reel_collections for insert
  to authenticated, anon
  with check (auth.uid() = user_id);

create policy "Users can update their own reel collections"
  on reel_collections for update
  to authenticated, anon
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own reel collections"
  on reel_collections for delete
  to authenticated, anon
  using (auth.uid() = user_id);

create policy "Users can select their own reel collection items"
  on reel_collection_items for select
  to authenticated, anon
  using (
    exists (
      select 1
      from reel_collections c
      where c.id = reel_collection_items.collection_id
        and ((auth.uid() = c.user_id) or (c.user_id is null))
    )
  );

create policy "Users can insert their own reel collection items"
  on reel_collection_items for insert
  to authenticated, anon
  with check (
    exists (
      select 1
      from reel_collections c
      join reels r on r.id = reel_collection_items.reel_id
      where c.id = reel_collection_items.collection_id
        and auth.uid() = c.user_id
        and auth.uid() = r.user_id
    )
  );

create policy "Users can update their own reel collection items"
  on reel_collection_items for update
  to authenticated, anon
  using (
    exists (
      select 1
      from reel_collections c
      join reels r on r.id = reel_collection_items.reel_id
      where c.id = reel_collection_items.collection_id
        and auth.uid() = c.user_id
        and auth.uid() = r.user_id
    )
  )
  with check (
    exists (
      select 1
      from reel_collections c
      join reels r on r.id = reel_collection_items.reel_id
      where c.id = reel_collection_items.collection_id
        and auth.uid() = c.user_id
        and auth.uid() = r.user_id
    )
  );

create policy "Users can delete their own reel collection items"
  on reel_collection_items for delete
  to authenticated, anon
  using (
    exists (
      select 1
      from reel_collections c
      where c.id = reel_collection_items.collection_id
        and auth.uid() = c.user_id
    )
  );
