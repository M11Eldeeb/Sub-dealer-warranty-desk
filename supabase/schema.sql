-- ============================================================
-- Warranty Claims App — full schema, run this once in your
-- Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text,
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('sub_dealer','dealer','parts_team')),
  branch_id uuid references branches(id),
  created_at timestamptz default now()
);

create sequence if not exists claim_number_seq start 1000;
create or replace function generate_claim_number() returns text as $$
begin return 'WC-' || nextval('claim_number_seq'); end;
$$ language plpgsql;

create table claims (
  id uuid primary key default gen_random_uuid(),
  claim_number text unique not null default generate_claim_number(),
  branch_id uuid not null references branches(id),
  created_by uuid not null references profiles(id),
  vin text not null,
  mileage integer not null,
  plate text not null,
  work_order_number text not null,
  reception_date date not null,
  customer_complaint text not null,
  cause_of_defect text not null,
  correction text not null,
  comment text not null default 'Sub Dealer Submitted',
  dealer_work_order_number text,
  status text not null default 'submitted'
    check (status in ('draft','submitted','returned','rejected','approved','awaiting_parts','parts_arrived','repair_submitted','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table claim_parts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  name text not null,
  part_number text,
  qty int not null default 1,
  status text not null default 'Waiting Action' check (status in ('Waiting Action','ICT','Shipped','Supplied to Sub-Dealer','VOR','Cancelled')),
  tracking_number text,
  eta date,
  supplying_location text check (supplying_location in ('Heraa Jeddah','Al Qassim','Jizan','Riyadh') or supplying_location is null),
  superseding_part_number text,
  created_at timestamptz default now()
);

create table claim_labor (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  labor_code text,
  labor_name text not null,
  created_at timestamptz default now()
);

create table part_return_requests (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  claim_part_id uuid not null references claim_parts(id) on delete cascade,
  reason text not null,
  requested_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table claim_attachments (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  stage text not null check (stage in ('evidence_before','after_repair')),
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now()
);

create table claim_status_log (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_name text not null,
  note text,
  at timestamptz default now()
);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger claims_updated_at before update on claims
for each row execute procedure set_updated_at();

-- ---------- Row Level Security ----------

alter table profiles enable row level security;
alter table branches enable row level security;
alter table claims enable row level security;
alter table claim_parts enable row level security;
alter table claim_labor enable row level security;
alter table part_return_requests enable row level security;
alter table claim_attachments enable row level security;
alter table claim_status_log enable row level security;

create or replace function my_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function my_branch() returns uuid as $$
  select branch_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "dealers read all profiles" on profiles for select using (my_role() = 'dealer');
create policy "insert own profile" on profiles for insert with check (id = auth.uid());

-- branches
create policy "authenticated read branches" on branches for select using (auth.role() = 'authenticated');
create policy "authenticated create branches" on branches for insert with check (auth.role() = 'authenticated');

-- claims
create policy "sub_dealer read own branch claims" on claims for select
  using (my_role() = 'sub_dealer' and branch_id = my_branch());
create policy "dealer read all claims" on claims for select
  using (my_role() = 'dealer');
create policy "parts_team read approved claims" on claims for select
  using (my_role() = 'parts_team' and status in ('awaiting_parts','parts_arrived','closed'));
create policy "sub_dealer insert own branch claims" on claims for insert
  with check (my_role() = 'sub_dealer' and branch_id = my_branch());
create policy "sub_dealer update own branch claims" on claims for update
  using (my_role() = 'sub_dealer' and branch_id = my_branch());
create policy "dealer update all claims" on claims for update
  using (my_role() = 'dealer');
create policy "parts_team update awaiting_parts claims" on claims for update
  using (my_role() = 'parts_team' and status = 'awaiting_parts');

-- claim_parts (sub-dealer enters/edits parts on own claims; dealer/parts_team manage shipment status)
create policy "read parts if can read claim" on claim_parts for select
  using (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() = 'dealer')));
create policy "sub_dealer insert parts on own claims" on claim_parts for insert
  with check (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));
create policy "sub_dealer update parts on own claims" on claim_parts for update
  using (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));
create policy "sub_dealer delete parts on own claims" on claim_parts for delete
  using (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));
create policy "dealer manage parts" on claim_parts for all
  using (my_role() = 'dealer');
create policy "parts_team read approved claim parts" on claim_parts for select
  using (exists (select 1 from claims c where c.id = claim_id and c.status in ('awaiting_parts','parts_arrived','closed') and my_role() = 'parts_team'));
create policy "parts_team update awaiting_parts claim parts" on claim_parts for update
  using (exists (select 1 from claims c where c.id = claim_id and c.status = 'awaiting_parts' and my_role() = 'parts_team'));

-- claim_labor (sub-dealer enters/edits labor lines on own claims)
create policy "read labor if can read claim" on claim_labor for select
  using (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() in ('dealer','parts_team'))));
create policy "sub_dealer insert labor on own claims" on claim_labor for insert
  with check (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));
create policy "sub_dealer update labor on own claims" on claim_labor for update
  using (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));
create policy "sub_dealer delete labor on own claims" on claim_labor for delete
  using (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));

-- part_return_requests (sub-dealer requests a return; dealer and parts_team can see it)
create policy "read return requests if can read claim" on part_return_requests for select
  using (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() in ('dealer','parts_team'))));
create policy "sub_dealer create return requests on own claims" on part_return_requests for insert
  with check (exists (select 1 from claims c where c.id = claim_id and c.branch_id = my_branch() and my_role() = 'sub_dealer'));

-- claim_attachments
create policy "read attachments if can read claim" on claim_attachments for select
  using (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() in ('dealer','parts_team'))));
create policy "insert attachments if can access claim" on claim_attachments for insert
  with check (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() = 'dealer')));
create policy "delete attachments if can access claim" on claim_attachments for delete
  using (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() = 'dealer')));

-- claim_status_log
create policy "read log if can read claim" on claim_status_log for select
  using (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() in ('dealer','parts_team'))));
create policy "insert log if can access claim" on claim_status_log for insert
  with check (exists (select 1 from claims c where c.id = claim_id and
    ((my_role() = 'sub_dealer' and c.branch_id = my_branch()) or my_role() in ('dealer','parts_team'))));

-- ---------- Storage bucket for evidence files ----------

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy "authenticated read evidence" on storage.objects for select
  using (bucket_id = 'evidence' and auth.role() = 'authenticated');
create policy "authenticated upload evidence" on storage.objects for insert
  with check (bucket_id = 'evidence' and auth.role() = 'authenticated');
create policy "authenticated delete evidence" on storage.objects for delete
  using (bucket_id = 'evidence' and auth.role() = 'authenticated');
