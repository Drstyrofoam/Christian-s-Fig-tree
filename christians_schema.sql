-- ══════════════════════════════════════════════════════════════════════════════
-- CHRISTIAN'S FIG TREE — SUPABASE SCHEMA
-- Run in Supabase SQL Editor at https://ifzcvhuhakzogwyqmccr.supabase.co
-- ══════════════════════════════════════════════════════════════════════════════

-- ── PRAYERS (people to pray for) ─────────────────────────────────────────────
create table if not exists prayers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  tier text not null,
  note text default '',
  created_at timestamptz default now()
);
alter table prayers enable row level security;
create policy "Allow all" on prayers for all using (true) with check (true);

-- ── PRAYER POINTS ─────────────────────────────────────────────────────────────
create table if not exists prayer_points (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  body text default '',
  type text default 'general',
  person text default '',
  subsection text default '',
  archived boolean default false,
  archived_at timestamptz,
  created_at timestamptz default now()
);
alter table prayer_points enable row level security;
create policy "Allow all" on prayer_points for all using (true) with check (true);

-- ── NOTION PAGES (for Workshop tab) ──────────────────────────────────────────
-- Populate this table by copying pages from Notion manually,
-- or use the Notion API to sync pages into it.
create table if not exists notion_pages (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text default '',
  category text default 'General',
  notion_id text default '',  -- original Notion page ID if syncing
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
alter table notion_pages enable row level security;
create policy "Allow all" on notion_pages for all using (true) with check (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- EXAMPLE: Add a Notion page manually
-- ══════════════════════════════════════════════════════════════════════════════
-- insert into notion_pages (title, content, category) values
-- ('My idea about X', 'Full content of the page here...', 'Ideas');
