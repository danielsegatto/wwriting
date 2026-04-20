-- 001_initial_schema.sql
-- Run once in the Supabase SQL editor (or via supabase db push if using the CLI).
-- This migration is intentionally idempotent: all CREATE statements use
-- "if not exists" where Postgres supports it, so re-running is safe.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type block_type as enum ('text', 'divider');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type block_tag_source as enum ('inline', 'picker');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists folders (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  parent_id  uuid        references folders(id) on delete cascade,
  name       text        not null,
  position   text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  folder_id  uuid        not null references folders(id) on delete cascade,
  name       text        not null,
  position   text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blocks (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  conversation_id  uuid        not null references conversations(id) on delete cascade,
  type             block_type  not null default 'text',
  body             text,
  position         text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists tags (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  color      text,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists block_tags (
  block_id   uuid              not null references blocks(id) on delete cascade,
  tag_id     uuid              not null references tags(id)   on delete cascade,
  source     block_tag_source  not null,
  created_at timestamptz       not null default now(),
  primary key (block_id, tag_id, source)
);

create table if not exists block_references (
  id               uuid        primary key default gen_random_uuid(),
  source_block_id  uuid        not null references blocks(id) on delete cascade,
  target_block_id  uuid        not null references blocks(id) on delete cascade,
  created_at       timestamptz not null default now()
);

create table if not exists user_settings (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  preferences jsonb       not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_folders_parent                   on folders(parent_id);
create index if not exists idx_folders_user                     on folders(user_id);
create index if not exists idx_conversations_folder             on conversations(folder_id);
create index if not exists idx_conversations_user               on conversations(user_id);
create index if not exists idx_blocks_conversation_position     on blocks(conversation_id, position);
create index if not exists idx_blocks_user                      on blocks(user_id);
create index if not exists idx_block_tags_tag                   on block_tags(tag_id);
create index if not exists idx_block_references_source          on block_references(source_block_id);
create index if not exists idx_block_references_target          on block_references(target_block_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger folders_updated_at
    before update on folders
    for each row execute function update_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger conversations_updated_at
    before update on conversations
    for each row execute function update_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger blocks_updated_at
    before update on blocks
    for each row execute function update_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger user_settings_updated_at
    before update on user_settings
    for each row execute function update_updated_at();
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table folders         enable row level security;
alter table conversations   enable row level security;
alter table blocks          enable row level security;
alter table tags            enable row level security;
alter table block_tags      enable row level security;
alter table block_references enable row level security;
alter table user_settings   enable row level security;

-- Drop and recreate policies so the file is safe to re-run.
drop policy if exists "folders: own rows"           on folders;
drop policy if exists "conversations: own rows"     on conversations;
drop policy if exists "blocks: own rows"            on blocks;
drop policy if exists "tags: own rows"              on tags;
drop policy if exists "block_tags: via owned block" on block_tags;
drop policy if exists "block_references: via owned source block" on block_references;
drop policy if exists "user_settings: own row"      on user_settings;

create policy "folders: own rows"
  on folders for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "conversations: own rows"
  on conversations for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "blocks: own rows"
  on blocks for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "tags: own rows"
  on tags for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- block_tags has no user_id; access is mediated through the parent block.
create policy "block_tags: via owned block"
  on block_tags for all
  using (
    exists (
      select 1 from blocks
      where blocks.id = block_tags.block_id
        and blocks.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from blocks
      where blocks.id = block_tags.block_id
        and blocks.user_id = auth.uid()
    )
  );

-- block_references has no user_id; access is mediated through the source block.
create policy "block_references: via owned source block"
  on block_references for all
  using (
    exists (
      select 1 from blocks
      where blocks.id = block_references.source_block_id
        and blocks.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from blocks
      where blocks.id = block_references.source_block_id
        and blocks.user_id = auth.uid()
    )
  );

create policy "user_settings: own row"
  on user_settings for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- Supabase realtime must be enabled per-table in the dashboard under
-- Database → Replication → Realtime, or via the publication below.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table folders;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table blocks;
