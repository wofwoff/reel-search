alter table reel_collections
  add column if not exists domain text;

alter table reel_collections
  drop constraint if exists reel_collections_domain_check;

alter table reel_collections
  add constraint reel_collections_domain_check
  check (
    domain is null or domain in (
      'Arts & Creativity',
      'Food & Cooking',
      'Technology',
      'Career & Education',
      'Health & Fitness',
      'Entertainment',
      'Travel & Places',
      'Business & Finance',
      'Lifestyle',
      'Other'
    )
  );

create index if not exists reel_collections_user_domain_idx
  on reel_collections (user_id, domain, updated_at desc);
