-- Clean Proof Guard — Supabase schema
--
-- Run this once against a fresh Supabase project (SQL editor, or `supabase db push`).
-- Admins authenticate via Supabase Auth (email/password) — create their auth.users
-- rows in the dashboard (or supabase.auth.admin.createUser) and add a matching row
-- to admin_profiles. Staff authenticate with a Staff ID + PIN via the
-- authenticate_staff() RPC below, since they don't have email accounts.
--
-- NOTE ON SECURITY: the RLS policies below are a permissive starting point so the
-- app works end to end during development. Staff writes are scoped by matching the
-- assignment's staff_id against the id passed in from the client, which is only as
-- trustworthy as the client — before going to production, move staff identity into
-- a signed session (e.g. a custom JWT minted by an edge function from
-- authenticate_staff) and tighten these policies to check auth.uid() /
-- auth.jwt() instead.

-- Supabase installs extensions into the `extensions` schema, so functions that call
-- crypt()/gen_salt() need it on their search_path (see authenticate_staff & friends).
create extension if not exists pgcrypto with schema extensions;

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

-- A facility/branch under a site — e.g. "Gauteng · Southwest Hospital". Every area, assignment,
-- staff member, proof, and photo links back to a branch. Access is granted per-admin (see
-- admin_profiles.branch_all / branch_ids) and enforced by the RLS policies + role-checked RPCs.
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  province_state text not null default '',
  name text not null,
  code text not null unique,
  address text,
  timezone text,
  contact_person text,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived', 'pending')),
  notes text,
  created_at timestamptz not null default now(),
  created_by_name text
);
-- One branch name per province/state within a site.
create unique index if not exists branches_name_per_province on branches (site_id, lower(province_state), lower(name));

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  staff_code text not null unique,
  pin_hash text not null,
  full_name text not null,
  initials text not null,
  color_hex text not null default '#17212B',
  role text not null default 'Cleaner',
  status text not null default 'off_shift' check (status in ('on_shift', 'on_break', 'off_shift')),
  -- Account lifecycle, separate from shift status above. Disabled/archived staff
  -- fail authenticate_staff() and are filtered out of active-assignment screens.
  account_status text not null default 'active' check (account_status in ('active', 'disabled', 'archived', 'deleted')),
  email text,
  phone text,
  shift_start timestamptz,
  shift_end timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Admin profiles, keyed by the corresponding auth.users row.
create table if not exists admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  name text not null,
  initials text not null,
  color_hex text not null default '#D9852B',
  -- Display label only, e.g. "Site supervisor" — not used for access control.
  title text not null default 'Site supervisor',
  -- Permission tier, enforced by the RLS policies and role-checked RPCs below.
  role text not null default 'read_only' check (role in ('superuser', 'super_admin', 'manager', 'supervisor', 'read_only')),
  -- Branch access: branch_all grants every branch at the site; otherwise branch_ids lists the
  -- specific branches this admin may reach. default_branch_id is their first-login landing branch.
  branch_all boolean not null default false,
  branch_ids uuid[] not null default '{}',
  default_branch_id uuid references branches(id) on delete set null,
  -- Per-feature permission overrides layered on the role defaults, e.g. {"branches":{"manage":true}}.
  permissions jsonb not null default '{}',
  -- Users & Access lifecycle (mirrors staff). Admins log in by email+password;
  -- staff_id is a display identifier shown on their row, not a login credential.
  -- email is denormalized from auth.users so the dashboard can list it without
  -- an auth-schema join. account_status gates access: current_admin_role()
  -- returns a role only for 'active' admins, so disabled/archived lose all access.
  staff_id text,
  email text,
  phone text,
  account_status text not null default 'active' check (account_status in ('active', 'disabled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  restored_at timestamptz,
  restored_by uuid
);
create unique index if not exists admin_profiles_staff_id_key on admin_profiles (lower(staff_id)) where staff_id is not null;
create unique index if not exists admin_profiles_email_key on admin_profiles (lower(email)) where email is not null;

-- Editable location categories. Global (all-branch) or scoped to one branch.
-- Archived (is_active=false) categories are hidden from the New Area dropdown but
-- still label their existing areas until reassigned.
create table if not exists location_categories (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  icon text,
  color text,
  branch_id uuid references branches(id) on delete cascade,
  is_global boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid
);
create unique index if not exists loc_cat_global_name_key on location_categories (site_id, lower(name)) where is_global = true;
create unique index if not exists loc_cat_branch_name_key on location_categories (site_id, branch_id, lower(name)) where is_global = false;
create index if not exists loc_cat_site_idx on location_categories (site_id);

-- A physical space that gets cleaned. Areas are persistent config; assignments
-- (below) are individual cleaning-cycle instances against an area.
create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  code text not null unique,
  -- Denormalized category label/slug, kept for history + backward compat. The real link
  -- is category_id -> location_categories (no CHECK: any category name is allowed now).
  category text not null default 'other',
  category_id uuid references location_categories(id) on delete set null,
  -- How often this area must be re-cleaned, in minutes. Null = manual/one-off scheduling.
  frequency_minutes int,
  task_template jsonb not null default '["Wipe & disinfect surfaces", "Empty & reline bins", "Sweep / vacuum floor", "Restock supplies"]',
  last_cleaned_at timestamptz,
  -- Inactive areas are hidden from new route assignments and can't have proof submitted for them.
  active boolean not null default true
);

-- Recurring cleaning schedules. Occurrences are generated as `assignments` rows (below)
-- so they flow through the existing board, staff app, proof, and reports.
create table if not exists cleaning_schedules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  name text not null,
  branch_id uuid references branches(id) on delete set null,
  category_id uuid references location_categories(id) on delete set null,
  assigned_user_id uuid references staff(id) on delete set null,
  recurrence_type text not null default 'daily' check (recurrence_type in ('today', 'daily', 'weekdays', 'weekends', 'custom')),
  frequency_type text not null default 'custom',
  required_cleans_per_day int not null default 1,
  interval_minutes int,
  start_time text not null default '08:00',
  end_time text not null default '17:00',
  shift text,
  checklist_template_id uuid,
  checklist_template_name text,
  require_photo boolean not null default false,
  notes text,
  is_active boolean not null default true,
  last_generated_date date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  archived_at timestamptz
);
create index if not exists cleaning_schedules_site_idx on cleaning_schedules (site_id);

create table if not exists schedule_areas (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references cleaning_schedules(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  sort_order int not null default 0
);
create index if not exists schedule_areas_schedule_idx on schedule_areas (schedule_id);

create table if not exists schedule_breaks (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references cleaning_schedules(id) on delete cascade,
  break_start text not null,
  break_end text not null,
  label text
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  area_id uuid not null references areas(id) on delete cascade,
  area_name text not null,
  area_code text not null,
  staff_id uuid references staff(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'overdue')),
  due_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  sort_order int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  task_type text not null default 'cleaning' check (task_type in ('cleaning', 'inspection', 'restock', 'maintenance', 'issue_followup', 'custom')),
  -- template_id/template_name are copied from the template at creation time (deliberately
  -- not a foreign key) so editing or archiving a template later never changes what a
  -- historical task looked like.
  template_id uuid,
  template_name text,
  created_by_name text,
  -- Copied from the template at creation time (same versioning rule as template_id): staff
  -- can't mark this clean without an "after" proof photo.
  require_photo boolean not null default false,
  -- Scheduled-clean occurrences are ordinary assignments tagged with their schedule +
  -- occurrence number ("Clean 2 of 4"). Null for one-off / recurring-area tasks.
  schedule_id uuid references cleaning_schedules(id) on delete set null,
  occurrence_number int,
  occurrence_total int,
  scheduled_date date
);
-- Idempotent occurrence generation: one row per schedule/area/occurrence/day.
create unique index if not exists assignments_occurrence_key
  on assignments (schedule_id, area_id, occurrence_number, scheduled_date)
  where schedule_id is not null;

create table if not exists assignment_tasks (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  label text not null,
  completed boolean not null default false,
  sort_order int not null default 0
);

create table if not exists assignment_photos (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  label text not null check (label in ('before', 'after')),
  url text not null,
  -- Supervisor review workflow for staff-captured proof photos.
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected', 'flagged', 'archived')),
  review_note text,
  reviewed_by_name text,
  created_at timestamptz not null default now()
);

-- Something staff flags instead of (or alongside) marking an area clean.
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  area_id uuid not null references areas(id) on delete cascade,
  area_name text not null,
  area_code text not null,
  assignment_id uuid references assignments(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  staff_name text,
  description text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Accountability trail for privileged admin actions. Written client-side right after a
-- gated mutation already succeeded (so this table is a record, never itself a permission
-- gate) — admin_id is nullable so a later-deleted admin doesn't take their history with them.
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  actor_id uuid references admin_profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  target_label text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- An admin's saved report configuration — fields, filters, sort/group — reusable
-- across sessions and optionally shared with the whole site's admin team.
create table if not exists report_templates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  owner_admin_id uuid references admin_profiles(id) on delete cascade,
  name text not null,
  report_type text not null,
  fields jsonb not null default '[]',
  sort_by text,
  group_by text,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per location-import run, so admins can see who imported what, when,
-- and how many rows succeeded/failed — row-level validation errors themselves
-- live client-side only (the file never leaves the browser except as valid rows).
create table if not exists location_import_batches (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  file_name text not null,
  imported_by_name text not null,
  imported_at timestamptz not null default now(),
  success_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'success' check (status in ('success', 'partial', 'failed'))
);

-- Super-admin-authored reusable task definitions. Creating a task copies these fields
-- onto the assignment row rather than referencing this table live, so later edits or
-- archiving never change history (see the note on assignments.template_id above).
create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  name text not null,
  task_type text not null default 'cleaning' check (task_type in ('cleaning', 'inspection', 'restock', 'maintenance', 'issue_followup', 'custom')),
  checklist_items jsonb not null default '[]',
  default_priority text not null default 'medium' check (default_priority in ('low', 'medium', 'high', 'urgent')),
  require_photo boolean not null default false,
  status text not null default 'draft' check (status in ('active', 'inactive', 'draft')),
  created_at timestamptz not null default now()
);

-- Storage bucket for staff proof photos (public read — the gallery and verify pages
-- render plain public URLs). Uploads/upserts are allowed for the staff app's anon key,
-- scoped to this bucket only; same dev-grade posture as the rest of this schema.
insert into storage.buckets (id, name, public)
values ('proof-photos', 'proof-photos', true)
on conflict (id) do nothing;

create policy "anyone can upload proof photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'proof-photos');

create policy "anyone can upsert proof photos" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'proof-photos')
  with check (bucket_id = 'proof-photos');

create policy "anyone can read proof photos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'proof-photos');

-- Staff sign-in: verifies the PIN server-side so the hash never reaches the client,
-- rejects disabled/archived accounts, and stamps last_login_at on success.
create or replace function authenticate_staff(p_staff_code text, p_pin text)
returns setof staff
language sql
security definer
set search_path = public, extensions
as $$
  with matched as (
    select id from staff
    where lower(staff_code) = lower(p_staff_code)
      and account_status = 'active'
      and pin_hash = crypt(p_pin, pin_hash)
  ), touched as (
    update staff set last_login_at = now()
    where id in (select id from matched)
    returning *
  )
  select * from touched
$$;

grant execute on function authenticate_staff(text, text) to anon, authenticated;

-- Staff row lookup for the staff app's session restore / status watcher: the staff
-- app holds only the anon key (no Supabase Auth session) and the staff table's RLS
-- is admins-only, so this security-definer RPC returns the row — minus pin_hash.
-- Anyone holding a staff UUID (obtained via authenticate_staff) can re-read that row;
-- same dev-grade posture as the permissive policies below.
create or replace function get_staff_public(p_staff_id uuid)
returns table (
  id uuid,
  site_id uuid,
  branch_id uuid,
  staff_code text,
  full_name text,
  initials text,
  color_hex text,
  role text,
  status text,
  account_status text,
  email text,
  phone text,
  shift_start timestamptz,
  shift_end timestamptz,
  created_at timestamptz,
  last_login_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select id, site_id, branch_id, staff_code, full_name, initials, color_hex, role,
         status, account_status, email, phone, shift_start, shift_end, created_at, last_login_at
  from staff
  where id = p_staff_id
$$;

grant execute on function get_staff_public(uuid) to anon, authenticated;

-- Looks up the caller's permission tier (see AdminRole in src/lib/types.ts).
-- Used by the RPCs below so each privileged action checks the *real*,
-- server-known caller — not whatever role the client claims to have.
create or replace function current_admin_role(p_site_id uuid default null)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from admin_profiles
  where id = auth.uid()
    -- Only active admins have an effective role: disabled/archived admins fail
    -- every role-gated policy and RPC, so they can't read or change anything.
    and account_status = 'active'
    and (p_site_id is null or site_id = p_site_id)
  limit 1
$$;

-- Admin creates a new staff account — PIN is hashed here so it never appears in
-- an insert payload the browser sent directly. Requires Super Admin or Manager.
create or replace function create_staff(
  p_site_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_initials text,
  p_color_hex text,
  p_role text,
  p_staff_code text,
  p_email text,
  p_phone text,
  p_pin text
)
returns setof staff
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(current_admin_role(p_site_id), '') not in ('superuser', 'super_admin', 'manager') then
    raise exception 'Not authorized to add a user';
  end if;

  return query
  insert into staff (site_id, branch_id, full_name, initials, color_hex, role, staff_code, email, phone, pin_hash)
  values (p_site_id, p_branch_id, p_full_name, p_initials, p_color_hex, p_role, p_staff_code, p_email, p_phone, crypt(p_pin, gen_salt('bf')))
  returning *;
end;
$$;

grant execute on function create_staff(uuid, uuid, text, text, text, text, text, text, text, text) to authenticated;

-- Requires Super Admin or Manager.
create or replace function reset_staff_pin(p_staff_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from staff where id = p_staff_id;
  if v_site_id is null or coalesce(current_admin_role(v_site_id), '') not in ('superuser', 'super_admin', 'manager') then
    raise exception 'Not authorized to reset a PIN';
  end if;

  update staff set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = p_staff_id;
end;
$$;

grant execute on function reset_staff_pin(uuid, text) to authenticated;

-- Shift status (on_shift/on_break/off_shift) — anyone but Read-only.
create or replace function set_staff_status(p_staff_id uuid, p_status text)
returns setof staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from staff where id = p_staff_id;
  if v_site_id is null or current_admin_role(v_site_id) = 'read_only' or current_admin_role(v_site_id) is null then
    raise exception 'Not authorized to change shift status';
  end if;

  return query update staff set status = p_status where id = p_staff_id returning *;
end;
$$;

grant execute on function set_staff_status(uuid, text) to authenticated;

-- Drag-and-drop reassignment on the Assignments board — anyone but Read-only.
create or replace function assign_staff_to_area(p_assignment_id uuid, p_staff_id uuid)
returns setof assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from assignments where id = p_assignment_id;
  if v_site_id is null or current_admin_role(v_site_id) = 'read_only' or current_admin_role(v_site_id) is null then
    raise exception 'Not authorized to reassign work';
  end if;

  return query update assignments set staff_id = p_staff_id where id = p_assignment_id returning *;
end;
$$;

grant execute on function assign_staff_to_area(uuid, uuid) to authenticated;

-- No dedicated "published" state yet (see publishRoutes in supabaseRepo.ts) —
-- this exists mainly so the permission check has a real enforcement point
-- once one is added, rather than being UI-only.
create or replace function publish_routes(p_site_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_admin_role(p_site_id) = 'read_only' or current_admin_role(p_site_id) is null then
    raise exception 'Not authorized to publish routes';
  end if;
end;
$$;

grant execute on function publish_routes(uuid) to authenticated;

-- Cleaning frequency — requires Super Admin or Manager.
create or replace function set_area_frequency(p_area_id uuid, p_frequency_minutes int)
returns setof areas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from areas where id = p_area_id;
  if v_site_id is null or coalesce(current_admin_role(v_site_id), '') not in ('superuser', 'super_admin', 'manager') then
    raise exception 'Not authorized to change cleaning frequency';
  end if;

  return query update areas set frequency_minutes = p_frequency_minutes where id = p_area_id returning *;
end;
$$;

grant execute on function set_area_frequency(uuid, int) to authenticated;

-- Creating an area also opens today's initial (unassigned) assignment for it,
-- so it immediately flows into the normal assign/publish pipeline.
create or replace function create_area(
  p_site_id uuid,
  p_branch_id uuid,
  p_name text,
  p_code text,
  p_category text,
  p_frequency_minutes int,
  p_task_template text[],
  p_category_id uuid default null
)
returns setof areas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area areas;
  v_assignment_id uuid;
  v_sort_order int;
  v_label text;
  v_i int := 0;
begin
  if coalesce(current_admin_role(p_site_id), '') not in ('superuser', 'super_admin', 'manager') then
    raise exception 'Not authorized to add an area';
  end if;

  insert into areas (site_id, branch_id, name, code, category, category_id, frequency_minutes, task_template)
  values (p_site_id, p_branch_id, p_name, p_code, p_category, p_category_id, p_frequency_minutes, to_jsonb(p_task_template))
  returning * into v_area;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order from assignments where site_id = p_site_id;

  insert into assignments (site_id, branch_id, area_id, area_name, area_code, status, due_at, sort_order)
  values (
    p_site_id,
    p_branch_id,
    v_area.id,
    v_area.name,
    v_area.code,
    'todo',
    case when p_frequency_minutes is not null then now() + (p_frequency_minutes || ' minutes')::interval else null end,
    v_sort_order
  )
  returning id into v_assignment_id;

  foreach v_label in array p_task_template loop
    insert into assignment_tasks (assignment_id, label, completed, sort_order)
    values (v_assignment_id, v_label, false, v_i);
    v_i := v_i + 1;
  end loop;

  return query select * from areas where id = v_area.id;
end;
$$;

grant execute on function create_area(uuid, uuid, text, text, text, int, text[], uuid) to authenticated;

-- ————— Location categories (superuser-managed, or via categories.manage grant) —————

create or replace function admin_can_manage_categories(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_profiles
    where id = auth.uid() and account_status = 'active' and site_id = p_site_id
      and (role = 'superuser' or coalesce((permissions->'categories'->>'manage')::boolean, false))
  )
$$;

create or replace function create_location_category(
  p_site_id uuid, p_name text, p_description text, p_icon text, p_color text, p_branch_id uuid, p_is_global boolean
)
returns setof location_categories language plpgsql security definer set search_path = public as $$
declare v_slug text := lower(regexp_replace(trim(p_name), '\s+', '-', 'g'));
begin
  if not admin_can_manage_categories(p_site_id) then raise exception 'Not authorized to create categories'; end if;
  if p_is_global and exists (select 1 from location_categories where site_id = p_site_id and is_global and lower(name) = lower(trim(p_name))) then
    raise exception 'A category named "%" already exists.', trim(p_name); end if;
  if not p_is_global and exists (select 1 from location_categories where site_id = p_site_id and not is_global and branch_id = p_branch_id and lower(name) = lower(trim(p_name))) then
    raise exception 'A category named "%" already exists in this branch.', trim(p_name); end if;
  return query
  insert into location_categories (site_id, name, slug, description, icon, color, branch_id, is_global, created_by, sort_order)
  values (p_site_id, trim(p_name), v_slug, nullif(trim(coalesce(p_description,'')),''), nullif(trim(coalesce(p_icon,'')),''),
    nullif(trim(coalesce(p_color,'')),''), case when p_is_global then null else p_branch_id end, p_is_global, auth.uid(),
    coalesce((select max(sort_order) + 10 from location_categories where site_id = p_site_id), 10))
  returning *;
end; $$;

create or replace function update_location_category(
  p_id uuid, p_name text, p_description text, p_icon text, p_color text, p_sort_order int
)
returns setof location_categories language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_global boolean; v_branch uuid;
begin
  select site_id, is_global, branch_id into v_site, v_global, v_branch from location_categories where id = p_id;
  if v_site is null or not admin_can_manage_categories(v_site) then raise exception 'Not authorized to edit categories'; end if;
  if p_name is not null and exists (
    select 1 from location_categories where id <> p_id and site_id = v_site and is_global = v_global
      and coalesce(branch_id, '00000000-0000-0000-0000-000000000000') = coalesce(v_branch, '00000000-0000-0000-0000-000000000000')
      and lower(name) = lower(trim(p_name))
  ) then raise exception 'A category named "%" already exists.', trim(p_name); end if;
  return query
  update location_categories set
    name = coalesce(nullif(trim(p_name), ''), name),
    slug = case when p_name is not null and trim(p_name) <> '' then lower(regexp_replace(trim(p_name), '\s+', '-', 'g')) else slug end,
    description = coalesce(p_description, description), icon = coalesce(p_icon, icon),
    color = coalesce(p_color, color), sort_order = coalesce(p_sort_order, sort_order), updated_at = now()
  where id = p_id returning *;
end; $$;

create or replace function set_category_active(p_id uuid, p_active boolean)
returns setof location_categories language plpgsql security definer set search_path = public as $$
declare v_site uuid;
begin
  select site_id into v_site from location_categories where id = p_id;
  if v_site is null or not admin_can_manage_categories(v_site) then raise exception 'Not authorized to change categories'; end if;
  return query
  update location_categories set is_active = p_active,
    archived_at = case when p_active then null else now() end,
    archived_by = case when p_active then null else auth.uid() end, updated_at = now()
  where id = p_id returning *;
end; $$;

create or replace function delete_location_category(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_uses int;
begin
  select site_id into v_site from location_categories where id = p_id;
  if v_site is null or not admin_can_manage_categories(v_site) then raise exception 'Not authorized to delete categories'; end if;
  select count(*) into v_uses from areas where category_id = p_id;
  if v_uses > 0 then raise exception 'This category is used by % location(s). Reassign those locations before deleting.', v_uses; end if;
  delete from location_categories where id = p_id;
end; $$;

create or replace function reassign_area_category(p_from_id uuid, p_to_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_to_site uuid; v_slug text; v_count int;
begin
  select site_id into v_site from location_categories where id = p_from_id;
  select site_id, slug into v_to_site, v_slug from location_categories where id = p_to_id;
  if v_site is null or v_to_site is null or v_site <> v_to_site or not admin_can_manage_categories(v_site) then
    raise exception 'Not authorized to reassign categories'; end if;
  update areas set category_id = p_to_id, category = v_slug where category_id = p_from_id;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

alter table location_categories enable row level security;
create policy "admins read categories at their site" on location_categories for select
  to authenticated using (current_admin_role(site_id) is not null);

grant execute on function admin_can_manage_categories(uuid) to authenticated;
grant execute on function create_location_category(uuid, text, text, text, text, uuid, boolean) to authenticated;
grant execute on function update_location_category(uuid, text, text, text, text, int) to authenticated;
grant execute on function set_category_active(uuid, boolean) to authenticated;
grant execute on function delete_location_category(uuid) to authenticated;
grant execute on function reassign_area_category(uuid, uuid) to authenticated;

-- ————— Branches & access (superuser-managed) —————

-- True when the current admin may access a given branch (all-access flag, or listed in branch_ids).
create or replace function current_admin_can_access_branch(p_branch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles
    where id = auth.uid()
      and (branch_all or p_branch_id = any(branch_ids))
  )
$$;

grant execute on function current_admin_can_access_branch(uuid) to authenticated;

create or replace function create_branch(
  p_site_id uuid,
  p_province_state text,
  p_name text,
  p_code text,
  p_address text,
  p_timezone text,
  p_contact_person text,
  p_phone text,
  p_email text,
  p_notes text,
  p_created_by_name text
)
returns setof branches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(coalesce(nullif(p_code, ''),
    left(regexp_replace(p_province_state, '[^A-Za-z]', '', 'g'), 3) || '-' ||
    left(regexp_replace(p_name, '[^A-Za-z]', '', 'g'), 3)));
begin
  -- Managing branches is superuser-only, unless a per-user override grants branches.manage.
  if coalesce(current_admin_role(p_site_id), '') <> 'superuser'
     and coalesce((select (permissions->'branches'->>'manage')::boolean from admin_profiles where id = auth.uid()), false) is not true then
    raise exception 'Not authorized to add a branch';
  end if;

  return query
  insert into branches (site_id, province_state, name, code, address, timezone, contact_person, phone, email, notes, created_by_name)
  values (p_site_id, p_province_state, p_name, v_code, p_address, p_timezone, p_contact_person, p_phone, p_email, p_notes, p_created_by_name)
  returning *;
end;
$$;

grant execute on function create_branch(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Archive/restore/activate a branch. Archiving pulls its not-yet-done assignments off the boards;
-- history (reports, proof, photos) is retained. Hard-delete is intentionally not offered.
create or replace function set_branch_status(p_branch_id uuid, p_status text)
returns setof branches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from branches where id = p_branch_id;
  if v_site_id is null or (coalesce(current_admin_role(v_site_id), '') <> 'superuser'
     and coalesce((select (permissions->'branches'->>'manage')::boolean from admin_profiles where id = auth.uid()), false) is not true) then
    raise exception 'Not authorized to change a branch status';
  end if;

  if p_status = 'archived' then
    delete from assignments where branch_id = p_branch_id and status <> 'done';
  end if;

  return query update branches set status = p_status where id = p_branch_id returning *;
end;
$$;

grant execute on function set_branch_status(uuid, text) to authenticated;

-- Editing an area's name/category/checklist, or toggling active status. Deactivating
-- pulls not-yet-done assignments off the board; reactivating opens a fresh unassigned one.
create or replace function update_area(
  p_area_id uuid,
  p_name text,
  p_category text,
  p_task_template text[],
  p_active boolean,
  p_category_id uuid default null
)
returns setof areas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before areas;
  v_after areas;
  v_assignment_id uuid;
  v_sort_order int;
  v_label text;
  v_i int := 0;
begin
  select * into v_before from areas where id = p_area_id;
  if v_before.id is null or coalesce(current_admin_role(v_before.site_id), '') not in ('superuser', 'super_admin', 'manager') then
    raise exception 'Not authorized to edit an area';
  end if;

  update areas set
    name = coalesce(p_name, name),
    category = coalesce(p_category, category),
    category_id = coalesce(p_category_id, category_id),
    task_template = case when p_task_template is not null then to_jsonb(p_task_template) else task_template end,
    active = coalesce(p_active, active)
  where id = p_area_id
  returning * into v_after;

  if p_active is not null and p_active = false and v_before.active = true then
    delete from assignments where area_id = p_area_id and status <> 'done';
  elsif p_active is not null and p_active = true and v_before.active = false then
    select coalesce(max(sort_order), 0) + 1 into v_sort_order from assignments where site_id = v_after.site_id;
    insert into assignments (site_id, area_id, area_name, area_code, status, due_at, sort_order)
    values (
      v_after.site_id,
      v_after.id,
      v_after.name,
      v_after.code,
      'todo',
      case when v_after.frequency_minutes is not null then now() + (v_after.frequency_minutes || ' minutes')::interval else null end,
      v_sort_order
    )
    returning id into v_assignment_id;

    for v_label in select jsonb_array_elements_text(v_after.task_template) loop
      insert into assignment_tasks (assignment_id, label, completed, sort_order)
      values (v_assignment_id, v_label, false, v_i);
      v_i := v_i + 1;
    end loop;
  end if;

  return query select * from areas where id = p_area_id;
end;
$$;

grant execute on function update_area(uuid, text, text, text[], boolean, uuid) to authenticated;

-- Global task templates — Super Admin only, per checklist.
create or replace function create_task_template(
  p_site_id uuid,
  p_name text,
  p_task_type text,
  p_checklist_items text[],
  p_default_priority text,
  p_require_photo boolean,
  p_status text
)
returns setof task_templates
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_admin_role(p_site_id), '') not in ('superuser', 'super_admin') then
    raise exception 'Not authorized to manage task templates';
  end if;

  return query insert into task_templates (site_id, name, task_type, checklist_items, default_priority, require_photo, status)
  values (p_site_id, p_name, p_task_type, to_jsonb(p_checklist_items), p_default_priority, p_require_photo, p_status)
  returning *;
end;
$$;

grant execute on function create_task_template(uuid, text, text, text[], text, boolean, text) to authenticated;

create or replace function update_task_template(
  p_template_id uuid,
  p_name text,
  p_task_type text,
  p_checklist_items text[],
  p_default_priority text,
  p_require_photo boolean,
  p_status text
)
returns setof task_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from task_templates where id = p_template_id;
  if v_site_id is null or coalesce(current_admin_role(v_site_id), '') not in ('superuser', 'super_admin') then
    raise exception 'Not authorized to manage task templates';
  end if;

  return query update task_templates set
    name = coalesce(p_name, name),
    task_type = coalesce(p_task_type, task_type),
    checklist_items = case when p_checklist_items is not null then to_jsonb(p_checklist_items) else checklist_items end,
    default_priority = coalesce(p_default_priority, default_priority),
    require_photo = coalesce(p_require_photo, require_photo),
    status = coalesce(p_status, status)
  where id = p_template_id
  returning *;
end;
$$;

grant execute on function update_task_template(uuid, text, text, text[], text, boolean, text) to authenticated;

-- Creates one assignment (for one staff member, or unassigned if p_staff_id is null) plus
-- its checklist rows. The client loops this once per selected staff member for multi-assign.
create or replace function create_task(
  p_site_id uuid,
  p_area_id uuid,
  p_staff_id uuid,
  p_task_type text,
  p_priority text,
  p_due_at timestamptz,
  p_checklist_items text[],
  p_template_id uuid,
  p_template_name text,
  p_created_by_name text,
  p_sort_order int,
  p_require_photo boolean default false
)
returns setof assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area areas;
  v_assignment_id uuid;
  v_label text;
  v_i int := 0;
begin
  if current_admin_role(p_site_id) is null or current_admin_role(p_site_id) = 'read_only' then
    raise exception 'Not authorized to create a task';
  end if;

  select * into v_area from areas where id = p_area_id and site_id = p_site_id;
  if v_area.id is null then
    raise exception 'Location not found';
  end if;
  if not v_area.active then
    raise exception 'This area has been deactivated and cannot receive new tasks.';
  end if;

  insert into assignments (
    site_id, area_id, area_name, area_code, staff_id, status, due_at, sort_order,
    priority, task_type, template_id, template_name, created_by_name, require_photo
  )
  values (
    p_site_id, v_area.id, v_area.name, v_area.code, p_staff_id, 'todo', p_due_at, p_sort_order,
    p_priority, p_task_type, p_template_id, p_template_name, p_created_by_name, coalesce(p_require_photo, false)
  )
  returning id into v_assignment_id;

  foreach v_label in array p_checklist_items loop
    insert into assignment_tasks (assignment_id, label, completed, sort_order)
    values (v_assignment_id, v_label, false, v_i);
    v_i := v_i + 1;
  end loop;

  return query select * from assignments where id = v_assignment_id;
end;
$$;

grant execute on function create_task(uuid, uuid, uuid, text, text, timestamptz, text[], uuid, text, text, int, boolean) to authenticated;

-- ————— Cleaning schedules (manager+ with branch access) —————

alter table cleaning_schedules enable row level security;
alter table schedule_areas enable row level security;
alter table schedule_breaks enable row level security;
create policy "admins read schedules at their site" on cleaning_schedules for select
  to authenticated using (current_admin_role(site_id) is not null);
create policy "admins read schedule areas" on schedule_areas for select
  to authenticated using (exists (select 1 from cleaning_schedules s where s.id = schedule_id and current_admin_role(s.site_id) is not null));
create policy "admins read schedule breaks" on schedule_breaks for select
  to authenticated using (exists (select 1 from cleaning_schedules s where s.id = schedule_id and current_admin_role(s.site_id) is not null));

-- Creates a schedule + its areas/breaks, then generates today's occurrences as
-- assignment rows (even-spaced across the shift window, pushed out of break times).
-- Idempotent via the assignments_occurrence_key partial unique index.
create or replace function create_schedule(
  p_site_id uuid, p_name text, p_branch_id uuid, p_category_id uuid, p_assigned_user_id uuid,
  p_recurrence_type text, p_frequency_type text, p_required_cleans int, p_interval_minutes int,
  p_start_time text, p_end_time text, p_area_ids uuid[], p_breaks jsonb,
  p_checklist_items text[], p_template_id uuid, p_template_name text, p_require_photo boolean,
  p_notes text, p_shift text, p_is_active boolean, p_created_by_name text, p_generate_today boolean
) returns setof assignments
language plpgsql security definer set search_path = public as $$
declare
  v_schedule_id uuid; v_area_id uuid; v_area areas; v_i int; v_k int;
  v_n int := greatest(1, coalesce(p_required_cleans, 1));
  v_win_start timestamp; v_win_end timestamp; v_due timestamp;
  v_sort int; v_label text; v_ti int; v_assignment_id uuid;
  v_items text[]; v_break jsonb; v_today date := current_date;
begin
  if coalesce(current_admin_role(p_site_id), '') not in ('superuser','super_admin','manager') then
    raise exception 'Not authorized to create schedules';
  end if;
  if p_branch_id is not null and not current_admin_can_access_branch(p_branch_id) then
    raise exception 'You do not have access to that branch.';
  end if;

  insert into cleaning_schedules (site_id, name, branch_id, category_id, assigned_user_id, recurrence_type,
    frequency_type, required_cleans_per_day, interval_minutes, start_time, end_time, shift,
    checklist_template_id, checklist_template_name, require_photo, notes, is_active, created_by, last_generated_date)
  values (p_site_id, p_name, p_branch_id, p_category_id, p_assigned_user_id, coalesce(p_recurrence_type,'daily'),
    coalesce(p_frequency_type,'custom'), v_n, p_interval_minutes, coalesce(p_start_time,'08:00'),
    coalesce(p_end_time,'17:00'), p_shift, p_template_id, p_template_name, coalesce(p_require_photo,false),
    p_notes, coalesce(p_is_active,true), auth.uid(),
    case when coalesce(p_generate_today,true) and coalesce(p_is_active,true) then v_today else null end)
  returning id into v_schedule_id;

  v_i := 0;
  foreach v_area_id in array coalesce(p_area_ids, '{}') loop
    insert into schedule_areas (schedule_id, area_id, sort_order) values (v_schedule_id, v_area_id, v_i);
    v_i := v_i + 1;
  end loop;

  if p_breaks is not null then
    for v_break in select * from jsonb_array_elements(p_breaks) loop
      insert into schedule_breaks (schedule_id, break_start, break_end, label)
      values (v_schedule_id, v_break->>'start', v_break->>'end', v_break->>'label');
    end loop;
  end if;

  if coalesce(p_generate_today, true) and coalesce(p_is_active, true) then
    v_win_start := v_today + p_start_time::time;
    v_win_end := v_today + p_end_time::time;
    if v_win_end <= v_win_start then v_win_end := v_win_start + interval '8 hours'; end if;
    select coalesce(max(sort_order),0) into v_sort from assignments where site_id = p_site_id;

    foreach v_area_id in array coalesce(p_area_ids, '{}') loop
      select * into v_area from areas where id = v_area_id and site_id = p_site_id and active;
      continue when v_area.id is null;
      if array_length(p_checklist_items,1) > 0 then v_items := p_checklist_items;
      else select array(select jsonb_array_elements_text(v_area.task_template)) into v_items; end if;

      for v_k in 1..v_n loop
        v_due := v_win_start + (v_win_end - v_win_start) * (v_k::numeric / v_n);
        if p_breaks is not null then
          for v_break in select * from jsonb_array_elements(p_breaks) loop
            if v_due::time >= (v_break->>'start')::time and v_due::time < (v_break->>'end')::time then
              v_due := v_today + (v_break->>'end')::time;
            end if;
          end loop;
        end if;
        v_sort := v_sort + 1;
        insert into assignments (site_id, branch_id, area_id, area_name, area_code, staff_id, status, due_at,
          sort_order, task_type, template_id, template_name, created_by_name, require_photo,
          schedule_id, occurrence_number, occurrence_total, scheduled_date)
        values (p_site_id, coalesce(p_branch_id, v_area.branch_id), v_area.id, v_area.name, v_area.code,
          p_assigned_user_id, 'todo', v_due::timestamptz, v_sort, 'cleaning', p_template_id, p_template_name,
          p_created_by_name, coalesce(p_require_photo,false), v_schedule_id, v_k, v_n, v_today)
        on conflict (schedule_id, area_id, occurrence_number, scheduled_date) where schedule_id is not null do nothing
        returning id into v_assignment_id;

        if v_assignment_id is not null then
          v_ti := 0;
          foreach v_label in array coalesce(v_items, '{}') loop
            insert into assignment_tasks (assignment_id, label, completed, sort_order) values (v_assignment_id, v_label, false, v_ti);
            v_ti := v_ti + 1;
          end loop;
        end if;
      end loop;
    end loop;
  end if;

  return query select * from assignments where schedule_id = v_schedule_id and scheduled_date = v_today
    order by area_name, occurrence_number;
end;
$$;
grant execute on function create_schedule(uuid, text, uuid, uuid, uuid, text, text, int, int, text, text, uuid[], jsonb, text[], uuid, text, boolean, text, text, boolean, text, boolean) to authenticated;

-- Edit a not-yet-completed task's type/priority/due date. Null args leave a field unchanged;
-- p_clear_due=true explicitly nulls the due date (distinct from "leave it alone").
create or replace function update_task_details(
  p_assignment_id uuid,
  p_task_type text,
  p_priority text,
  p_due_at timestamptz,
  p_clear_due boolean
)
returns setof assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_status text;
begin
  select site_id, status into v_site_id, v_status from assignments where id = p_assignment_id;
  if v_site_id is null or current_admin_role(v_site_id) is null or current_admin_role(v_site_id) = 'read_only' then
    raise exception 'Not authorized to edit a task';
  end if;
  if v_status = 'done' then
    raise exception 'Completed tasks can''t be edited — reopen it first.';
  end if;

  return query
    update assignments
    set task_type = coalesce(p_task_type, task_type),
        priority = coalesce(p_priority, priority),
        due_at = case when p_clear_due then null else coalesce(p_due_at, due_at) end
    where id = p_assignment_id
    returning *;
end;
$$;

grant execute on function update_task_details(uuid, text, text, timestamptz, boolean) to authenticated;

-- Remove a not-yet-completed task from the board. Completed work is immutable history.
create or replace function cancel_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_status text;
begin
  select site_id, status into v_site_id, v_status from assignments where id = p_assignment_id;
  if v_site_id is null or current_admin_role(v_site_id) is null or current_admin_role(v_site_id) = 'read_only' then
    raise exception 'Not authorized to cancel a task';
  end if;
  if v_status = 'done' then
    raise exception 'Completed tasks can''t be cancelled.';
  end if;

  delete from assignments where id = p_assignment_id;
end;
$$;

grant execute on function cancel_assignment(uuid) to authenticated;

-- Resolving an issue is "handling" it — the Supervisor tier and up, not Read-only.
create or replace function resolve_issue(p_issue_id uuid)
returns setof issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id from issues where id = p_issue_id;
  if v_site_id is null or current_admin_role(v_site_id) = 'read_only' or current_admin_role(v_site_id) is null then
    raise exception 'Not authorized to resolve issues';
  end if;

  return query update issues set status = 'resolved', resolved_at = now() where id = p_issue_id returning *;
end;
$$;

grant execute on function resolve_issue(uuid) to authenticated;

-- Reopening a completed task is a routes-management action, same tier as reassignment/publish.
create or replace function reopen_assignment(p_assignment_id uuid)
returns setof assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_status text;
begin
  select site_id, status into v_site_id, v_status from assignments where id = p_assignment_id;
  if v_site_id is null or current_admin_role(v_site_id) is null or current_admin_role(v_site_id) = 'read_only' then
    raise exception 'Not authorized to reopen a task';
  end if;
  if v_status is distinct from 'done' then
    raise exception 'Only completed tasks can be reopened.';
  end if;

  return query
    update assignments
    set status = 'todo', started_at = null, submitted_at = null
    where id = p_assignment_id
    returning *;
end;
$$;

grant execute on function reopen_assignment(uuid) to authenticated;

-- One active account per email; multiple staff may still have a null email.
create unique index if not exists staff_email_unique on staff (lower(email)) where email is not null;

alter table sites enable row level security;
alter table branches enable row level security;
alter table staff enable row level security;
alter table admin_profiles enable row level security;
alter table areas enable row level security;
alter table assignments enable row level security;
alter table assignment_tasks enable row level security;
alter table assignment_photos enable row level security;
alter table issues enable row level security;
alter table audit_logs enable row level security;
alter table report_templates enable row level security;
alter table location_import_batches enable row level security;
alter table task_templates enable row level security;

create policy "sites are readable by anyone" on sites for select using (true);

-- Branches: an admin only sees branches they're granted access to (all-access flag or listed in
-- branch_ids). This is the row-level half of the branch-scoping the spec requires — to fully
-- enforce it, add matching `using (current_admin_can_access_branch(branch_id))` clauses to the
-- staff/areas/assignments/issues/photos select policies below (kept permissive here so the
-- public /verify page and staff anon-key writes keep working during development).
create policy "admins read accessible branches" on branches for select
  using (current_admin_can_access_branch(id));
-- The staff app shows the branch name in its header/proof screens but has no auth
-- session. Scoped `to anon` only, so authenticated admins keep the branch-access-
-- scoped policy above (policies are OR'd per role; this one never applies to them).
create policy "staff app can read branches" on branches for select
  to anon
  using (true);
create policy "branch writes go through security-definer RPCs" on branches for all
  using (false) with check (false);

-- Areas are readable by anyone: the /verify/:code public QR page has no auth
-- and needs to show the area name + last-cleaned time to anyone who scans the tag.
create policy "anyone can read areas" on areas for select using (true);
-- Permissive like the assignment policies below — both staff (scanning, via the
-- anon key) and admins (frequency changes) write to this table today.
create policy "anyone can update areas" on areas for update using (true);
create policy "anyone can insert areas" on areas for insert with check (true);

-- Staff rows are only ever read/written through the RPC above or by an authenticated
-- admin; the anon key gets no direct access to the staff table.
create policy "admins can read staff at their site" on staff for select
  to authenticated
  using (site_id in (select site_id from admin_profiles where id = auth.uid()));

create policy "admins can read their own profile" on admin_profiles for select
  to authenticated
  using (id = auth.uid());

-- Users & Access: superusers see and manage the whole admin directory at their
-- site. current_admin_role() is SECURITY DEFINER, so these don't recurse.
create policy "superusers can read all admin profiles" on admin_profiles for select
  using (current_admin_role(site_id) = 'superuser');

create policy "superusers can update admin profiles" on admin_profiles for update
  using (current_admin_role(site_id) = 'superuser')
  with check (current_admin_role(site_id) = 'superuser');

-- Invariant guard on admin_profiles: a user can't lift their own role to superuser,
-- and the last active superuser at a site can't be demoted, disabled, or archived.
create or replace function guard_admin_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_active_superusers int;
begin
  if tg_op = 'UPDATE' and new.id = auth.uid()
     and new.role = 'superuser' and old.role is distinct from 'superuser' then
    raise exception 'You cannot change your own role to superuser.';
  end if;
  if tg_op = 'UPDATE'
     and old.role = 'superuser' and old.account_status = 'active'
     and (new.role is distinct from 'superuser' or new.account_status <> 'active') then
    select count(*) into v_active_superusers
    from admin_profiles
    where site_id = old.site_id and role = 'superuser'
      and account_status = 'active' and id <> old.id;
    if v_active_superusers = 0 then
      raise exception 'This is the last active superuser — assign another before changing this one.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_admin_profiles on admin_profiles;
create trigger trg_guard_admin_profiles before update on admin_profiles
  for each row execute function guard_admin_profiles();

create or replace function touch_admin_profiles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_touch_admin_profiles on admin_profiles;
create trigger trg_touch_admin_profiles before update on admin_profiles
  for each row execute function touch_admin_profiles_updated_at();

-- Superuser-only lifecycle change (archive / disable / restore) with audit stamps.
create or replace function set_admin_status(p_admin_id uuid, p_status text)
returns setof admin_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_site_id uuid;
begin
  if p_status not in ('active', 'disabled', 'archived') then
    raise exception 'Invalid status %', p_status;
  end if;
  select site_id into v_site_id from admin_profiles where id = p_admin_id;
  if v_site_id is null or coalesce(current_admin_role(v_site_id), '') <> 'superuser' then
    raise exception 'Not authorized to change a user''s status';
  end if;
  return query
  update admin_profiles set
    account_status = p_status,
    archived_at = case when p_status = 'archived' then now() else archived_at end,
    archived_by = case when p_status = 'archived' then auth.uid() else archived_by end,
    restored_at = case when p_status = 'active' then now() else restored_at end,
    restored_by = case when p_status = 'active' then auth.uid() else restored_by end
  where id = p_admin_id
  returning *;
end;
$$;

-- Superuser-only: create a dashboard admin from the browser (anon key can't make
-- auth users directly, so this definer function does auth.users + identities +
-- admin_profiles in one shot). staff_id/email uniqueness enforced here.
create or replace function create_admin_account(
  p_site_id uuid, p_name text, p_email text, p_password text, p_phone text,
  p_title text, p_role text, p_staff_id text, p_initials text, p_color_hex text,
  p_branch_all boolean, p_branch_ids uuid[], p_default_branch_id uuid, p_account_status text
)
returns setof admin_profiles
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_new_id uuid := gen_random_uuid();
begin
  if coalesce(current_admin_role(p_site_id), '') <> 'superuser' then
    raise exception 'Not authorized to add a dashboard user';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'An email address is required.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from admin_profiles where lower(email) = v_email) then
    raise exception 'An account with "%" already exists.', v_email;
  end if;
  if p_staff_id is not null and exists (select 1 from admin_profiles where lower(staff_id) = lower(p_staff_id)) then
    raise exception 'Staff ID "%" is already in use.', p_staff_id;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', v_new_id::text, now(), now(), now());

  return query
  insert into admin_profiles (
    id, site_id, name, initials, color_hex, title, role, email, phone, staff_id,
    branch_all, branch_ids, default_branch_id, permissions, account_status
  ) values (
    v_new_id, p_site_id, p_name, p_initials, p_color_hex, coalesce(nullif(p_title, ''), 'Dashboard user'),
    p_role, v_email, nullif(trim(p_phone), ''), p_staff_id,
    p_branch_all, coalesce(p_branch_ids, '{}'), p_default_branch_id, '{}'::jsonb,
    coalesce(nullif(p_account_status, ''), 'active')
  )
  returning *;
end;
$$;
grant execute on function set_admin_status(uuid, text) to authenticated;
grant execute on function create_admin_account(uuid, text, text, text, text, text, text, text, text, text, boolean, uuid[], uuid, text) to authenticated;

-- Direct staff-table edits (name/contact/role/account status) require Manager+;
-- shift-status changes go through set_staff_status() above instead, since that
-- needs a lower bar (anyone but Read-only).
create policy "managers can update staff at their site" on staff for update
  to authenticated
  using (
    site_id in (select site_id from admin_profiles where id = auth.uid())
    and current_admin_role(site_id) in ('superuser', 'super_admin', 'manager')
  );

create policy "anyone can read today's assignments" on assignments for select using (true);
create policy "anyone can read assignment tasks" on assignment_tasks for select using (true);
create policy "anyone can read assignment photos" on assignment_photos for select using (true);

-- Permissive write policies for development. See the security note at the top of
-- this file before shipping this to production.
create policy "anon can update assignments" on assignments for update using (true);
create policy "anyone can insert assignments" on assignments for insert with check (true);
create policy "anon can update tasks" on assignment_tasks for update using (true);
create policy "anyone can insert tasks" on assignment_tasks for insert with check (true);
create policy "anon can insert photos" on assignment_photos for insert with check (true);

-- Issues are readable by any admin and insertable by staff (anon key) reporting
-- one from the checklist; resolving goes through resolve_issue() above instead.
create policy "anyone can read issues" on issues for select using (true);
create policy "anyone can insert issues" on issues for insert with check (true);

-- Audit entries are written by the client right after an already-gated mutation
-- succeeds (see the comment on the table above) — readable/insertable by any
-- authenticated admin, not staff (the anon key has no session, so auth.uid() is null).
create policy "admins can read audit logs at their site" on audit_logs for select
  to authenticated
  using (site_id in (select site_id from admin_profiles where id = auth.uid()));
create policy "admins can insert audit logs" on audit_logs for insert
  to authenticated
  with check (site_id in (select site_id from admin_profiles where id = auth.uid()));

-- Report templates: any admin at the site can read shared ones or their own;
-- only the owner can insert/update/delete their own.
create policy "admins can read report templates at their site" on report_templates for select
  to authenticated
  using (
    site_id in (select site_id from admin_profiles where id = auth.uid())
    and (shared or owner_admin_id = auth.uid())
  );
create policy "admins can insert their own report templates" on report_templates for insert
  to authenticated
  with check (
    site_id in (select site_id from admin_profiles where id = auth.uid())
    and owner_admin_id = auth.uid()
  );
create policy "admins can update their own report templates" on report_templates for update
  to authenticated
  using (owner_admin_id = auth.uid());
create policy "admins can delete their own report templates" on report_templates for delete
  to authenticated
  using (owner_admin_id = auth.uid());

-- Import batch history: any admin at the site can see it and log a new run;
-- gated to Manager+ the same way area edits are, via the app calling create_area/
-- update_area RPCs per row before writing this summary row.
create policy "admins can read import batches at their site" on location_import_batches for select
  to authenticated
  using (site_id in (select site_id from admin_profiles where id = auth.uid()));
create policy "admins can insert import batches at their site" on location_import_batches for insert
  to authenticated
  with check (
    site_id in (select site_id from admin_profiles where id = auth.uid())
    and current_admin_role(site_id) in ('superuser', 'super_admin', 'manager')
  );

-- Task templates: any admin at the site can read them (so the Create Task dropdown
-- works for Manager/Supervisor); writes go through the Super-Admin-gated RPCs above.
create policy "admins can read task templates at their site" on task_templates for select
  to authenticated
  using (site_id in (select site_id from admin_profiles where id = auth.uid()));

-- Realtime: enable change notifications for the tables the dashboards subscribe to.
alter publication supabase_realtime add table assignments;
alter publication supabase_realtime add table assignment_tasks;
alter publication supabase_realtime add table assignment_photos;
alter publication supabase_realtime add table areas;
alter publication supabase_realtime add table staff;
alter publication supabase_realtime add table issues;
alter publication supabase_realtime add table audit_logs;
alter publication supabase_realtime add table report_templates;
alter publication supabase_realtime add table location_import_batches;
alter publication supabase_realtime add table task_templates;

-- ---------------------------------------------------------------------------
-- Seed data — mirrors the demo data the app ships with in mock mode, so the
-- screens look the same the moment you flip over to a real Supabase project.
-- ---------------------------------------------------------------------------

insert into sites (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Northgate Tower')
on conflict (id) do nothing;

insert into staff (id, site_id, staff_code, pin_hash, full_name, initials, color_hex, role, status, account_status, email, shift_start, shift_end) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'MB-4471', extensions.crypt('1234', extensions.gen_salt('bf')), 'Marcus Bell', 'MB', '#17212B', 'Cleaner', 'on_shift', 'active', 'marcus.bell@example.com', now() - interval '3 hours', now() + interval '4 hours'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'AR-2290', extensions.crypt('1234', extensions.gen_salt('bf')), 'Aisha Rahman', 'AR', '#3B7DD8', 'Cleaner', 'on_shift', 'active', 'aisha.rahman@example.com', now() - interval '3 hours 20 minutes', now() + interval '3 hours 40 minutes'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'JT-1187', extensions.crypt('1234', extensions.gen_salt('bf')), 'Jamal Turner', 'JT', '#0F9D6B', 'Cleaner', 'on_shift', 'active', 'jamal.turner@example.com', now() - interval '4 hours 20 minutes', now() + interval '2 hours 40 minutes'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'DK-3355', extensions.crypt('1234', extensions.gen_salt('bf')), 'Dana Kim', 'DK', '#8A96A0', 'Cleaner', 'on_break', 'active', 'dana.kim@example.com', now() - interval '3 hours 10 minutes', now() + interval '3 hours 50 minutes'),
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'PN-5502', extensions.crypt('1234', extensions.gen_salt('bf')), 'Priya Nair', 'PN', '#8A96A0', 'Cleaner', 'off_shift', 'disabled', 'priya.nair@example.com', null, null)
on conflict (id) do nothing;

insert into areas (id, site_id, name, code, category, frequency_minutes, task_template, last_cleaned_at) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Lobby & Reception', 'CPG-L0-001', 'common', 240, '["Wipe & disinfect surfaces", "Empty & reline bins", "Sweep / vacuum floor", "Restock supplies"]', now() - interval '2 hours 50 minutes'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'L2 · Kitchenette', 'CPG-2K-007', 'kitchen', 240, '["Wipe & disinfect surfaces", "Empty & reline bins", "Sweep / vacuum floor", "Restock supplies"]', now() - interval '2 hours 30 minutes'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'L3 · Men''s Restroom', 'CPG-3M-014', 'bathroom', 120, '["Mop & disinfect floor", "Refill soap & paper towels", "Empty & reline bins", "Clean & sanitize sinks", "Restock toilet paper"]', now() - interval '1 hour 50 minutes'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', 'L3 · Women''s Restroom', 'CPG-3W-015', 'bathroom', 120, '["Mop & disinfect floor", "Refill soap & paper towels", "Empty & reline bins", "Clean & sanitize sinks", "Restock toilet paper"]', now() - interval '40 minutes'),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000001', 'L5 · Break Area', 'CPG-5B-022', 'kitchen', 240, '["Wipe & disinfect surfaces", "Empty & reline bins", "Sweep / vacuum floor", "Restock supplies"]', now() - interval '4 hours 45 minutes'),
  ('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000001', 'L6 · Executive Suite', 'CPG-6E-030', 'office', null, '["Wipe & disinfect surfaces", "Empty & reline bins", "Sweep / vacuum floor", "Restock supplies"]', null)
on conflict (id) do nothing;

-- Assignments aren't seeded here (they're generated day to day as admins assign
-- work and staff scan tags) — the mock data layer's richer daily seed lives in
-- src/lib/repo/seed.ts if you want a matching starting set of today's tasks.

-- To seed an admin: create the auth user first (dashboard → Authentication →
-- Add user, e.g. sara@cleanproofguard.com / a password you choose), then:
-- insert into admin_profiles (id, site_id, name, initials, color_hex, title, role)
-- values ('<auth-user-uuid>', '00000000-0000-0000-0000-000000000001', 'Sara Cole', 'SC', '#D9852B', 'Regional Manager', 'manager');
--
-- `role` must be one of: super_admin, manager, supervisor, read_only.
