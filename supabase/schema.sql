-- Jalankan sekali di SQL Editor Supabase pada project khusus RANAKARA AI.
-- Data tiap akun dipisah oleh Row Level Security.
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- Tidak memberikan akses untuk anonymous tanpa sesi login.
grant select, insert, update, delete on public.workspaces to authenticated;
revoke all on public.workspaces from anon;

drop policy if exists "user_reads_own_workspace" on public.workspaces;
create policy "user_reads_own_workspace" on public.workspaces for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_creates_own_workspace" on public.workspaces;
create policy "user_creates_own_workspace" on public.workspaces for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_updates_own_workspace" on public.workspaces;
create policy "user_updates_own_workspace" on public.workspaces for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_deletes_own_workspace" on public.workspaces;
create policy "user_deletes_own_workspace" on public.workspaces for delete to authenticated
  using (auth.uid() = user_id);
