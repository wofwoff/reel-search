-- 1. Add tags column to reels table of type text[] (array of text), default empty array
alter table reels add column if not exists tags text[] not null default '{}';

-- 2. Populate tags for the 4 existing sample reels
update reels 
set tags = '{"System Design", "Software Architecture", "Engineering"}'::text[]
where id = 'f9156ea9-02e5-4b19-9e68-d1d9cca834e8';

update reels 
set tags = '{"AI Tools", "Diagrams", "Creativity"}'::text[]
where id = '8e26a5dd-a6ba-4f11-818f-5787866cb721';

update reels 
set tags = '{"Voice AI", "Open Source", "Machine Learning"}'::text[]
where id = 'a73a8fdd-acfa-4ca8-98fa-d58a8c7b4f70';

update reels 
set tags = '{"AI Agents", "Automation", "Productivity"}'::text[]
where id = '9163feb4-e66d-4037-be9e-bfebde582731';
