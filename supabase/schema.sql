create extension if not exists pgcrypto;

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null default '작가 미상',
  total_count integer not null default 1 check (total_count > 0),
  category text not null default '문학',
  status text not null default '책바구니',
  purchase_date date,
  platform text not null default '',
  cover_url text not null default '',
  purchase_year integer,
  finished_date date,
  rating numeric(2,1) check (rating between 0 and 5),
  read_count integer not null default 0 check (read_count >= 0),
  list_price integer not null default 0 check (list_price >= 0),
  paid_price integer not null default 0 check (paid_price >= 0),
  purchase_method text not null default '',
  liked_notes jsonb not null default '[]'::jsonb,
  disliked_notes jsonb not null default '[]'::jsonb,
  source_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.books enable row level security;
create policy "personal archive read" on public.books for select using (true);
create policy "personal archive insert" on public.books for insert with check (true);
create policy "personal archive update" on public.books for update using (true);
create policy "personal archive delete" on public.books for delete using (true);
