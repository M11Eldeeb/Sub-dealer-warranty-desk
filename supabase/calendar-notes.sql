-- Per-person notes on days of the home dashboard calendar (applied as migration "calendar_notes").
create table if not exists public.calendar_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  note text not null check (length(btrim(note)) > 0 and length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.calendar_notes enable row level security;
create policy calendar_notes_select on public.calendar_notes for select to authenticated using (user_id = auth.uid());
create policy calendar_notes_insert on public.calendar_notes for insert to authenticated with check (user_id = auth.uid());
create policy calendar_notes_update on public.calendar_notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_notes_delete on public.calendar_notes for delete to authenticated using (user_id = auth.uid());
