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
  account_status text not null default 'active' check (account_status in ('active', 'disabled', 'archived')),
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
  permissions jsonb not null default '{}'
);

-- A physical space that gets cleaned. Areas are persistent config; assignments
-- (below) are individual cleaning-cycle instances against an area.
create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  code text not null unique,
  category text not null default 'other' check (category in ('bathroom', 'office', 'common', 'kitchen', 'outdoor', 'other')),
  -- How often this area must be re-cleaned, in minutes. Null = manual/one-off scheduling.
  frequency_minutes int,
  task_template jsonb not null default '["Wipe & disinfect surfaces", "Empty & reline bins", "Sweep / vacuum floor", "Restock supplies"]',
  last_cleaned_at timestamptz,
  -- Inactive areas are hidden from new route assignments and can't have proof submitted for them.
  active boolean not null default true
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
  require_photo boolean not null default false
);

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
  if current_admin_role(p_site_id) not in ('superuser', 'super_admin', 'manager') then
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
  if v_site_id is null or current_admin_role(v_site_id) not in ('super_admin', 'manager') then
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
  if v_site_id is null or current_admin_role(v_site_id) not in ('super_admin', 'manager') then
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
  p_task_template text[]
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
  if current_admin_role(p_site_id) not in ('superuser', 'super_admin', 'manager') then
    raise exception 'Not authorized to add an area';
  end if;

  insert into areas (site_id, branch_id, name, code, category, frequency_minutes, task_template)
  values (p_site_id, p_branch_id, p_name, p_code, p_category, p_frequency_minutes, to_jsonb(p_task_template))
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

grant execute on function create_area(uuid, uuid, text, text, text, int, text[]) to authenticated;

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
  if current_admin_role(p_site_id) <> 'superuser'
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
  if v_site_id is null or (current_admin_role(v_site_id) <> 'superuser'
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
  p_active boolean
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
  if v_before.id is null or current_admin_role(v_before.site_id) not in ('super_admin', 'manager') then
    raise exception 'Not authorized to edit an area';
  end if;

  update areas set
    name = coalesce(p_name, name),
    category = coalesce(p_category, category),
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

grant execute on function update_area(uuid, text, text, text[], boolean) to authenticated;

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
  if current_admin_role(p_site_id) is distinct from 'super_admin' then
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
  if v_site_id is null or current_admin_role(v_site_id) is distinct from 'super_admin' then
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

-- Direct staff-table edits (name/contact/role/account status) require Manager+;
-- shift-status changes go through set_staff_status() above instead, since that
-- needs a lower bar (anyone but Read-only).
create policy "managers can update staff at their site" on staff for update
  to authenticated
  using (
    site_id in (select site_id from admin_profiles where id = auth.uid())
    and current_admin_role(site_id) in ('super_admin', 'manager')
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
    and current_admin_role(site_id) in ('super_admin', 'manager')
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
