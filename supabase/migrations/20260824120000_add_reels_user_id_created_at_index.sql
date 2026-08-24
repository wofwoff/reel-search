create index if not exists reels_user_id_created_at_idx
  on reels (user_id, created_at desc);
