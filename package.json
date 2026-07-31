-- Rulează acest script în Supabase Dashboard → SQL Editor → New query

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null,
  expiry_date date not null,
  reminder_days int not null default 30,
  last_notified_at date,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "select_own" on documents for select using (auth.uid() = user_id);
create policy "insert_own" on documents for insert with check (auth.uid() = user_id);
create policy "update_own" on documents for update using (auth.uid() = user_id);
create policy "delete_own" on documents for delete using (auth.uid() = user_id);

create index if not exists idx_documents_user_id on documents(user_id);
create index if not exists idx_documents_expiry on documents(expiry_date);
