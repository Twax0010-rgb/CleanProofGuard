# Clean Proof Guard — Project Handoff

## ⏸ Where we left off (2026-07-11 seventh session, for the next session)
**IN PROGRESS — big multi-part spec being built in slices.** The user asked for a large
"Scheduled tasks + benchmarks + schedule management + scheduled-clean reports" feature PLUS a
separate "transit/inactive-time tracking" feature PLUS a flexible report builder. They chose to
build **Scheduled tasks core FIRST**. This session delivered that core; the rest is still TODO
(see "Remaining from this spec" below).

**Done this session — Scheduled tasks core** (verified in the browser against Supabase as thando@):
- **"Schedule task" button beside "Create task"** on the Assign Today's Routes board, opening a
  **Create Schedule modal** (`src/admin/ScheduleTaskModal.tsx`): schedule name, branch, location
  category (filters areas), area multi-select with search + floor filter + **Room 1→10 range
  picker**, assign-to-staff or leave Unassigned, shift (day/night/custom → start/end time), break
  windows, frequency (once/twice/every 2h/every 4h/custom N), recurrence, checklist template,
  photo-required toggle, notes, plus a live "generates N×M = X occurrences" preview and a
  **benchmark hint** per category (e.g. "Restrooms 4×/day", static map for now).
- **Occurrences are generated as ordinary `assignments` rows** tagged with `schedule_id` +
  `occurrence_number`/`occurrence_total` + `scheduled_date` (new columns). So they flow through the
  existing board / staff app / proof / reports for free. Each occurrence is a separate card
  ("Clean 2 of 4") that completes independently. Board cards now show a **Scheduled / One-off**
  label and an **N/total** badge.
- **New tables** `cleaning_schedules`, `schedule_areas`, `schedule_breaks` (migrations
  `cleaning_schedules`, `create_schedule_rpc`). RPC `create_schedule(...)` (manager+ with branch
  access) inserts the schedule + areas + breaks and generates today's occurrences evenly spaced
  across the shift, pushed out of break windows, idempotent via a partial unique index
  `assignments_occurrence_key`. schema.sql mirrors all of it. Mock repo mirrors generation
  (storage key bumped to `cpg_mock_state_v17`).
- Verified: button present; modal opens; category→areas filter; benchmark banner + "Use 4×/day";
  tick 2 restrooms; preview "4 × 2 = 8"; Create → 8 occurrences under Marcus Bell (Clean 1–4 of 4
  each, spaced 10:15/12:30/14:45/17:00 avoiding the 13:00–13:30 lunch); marking occurrence 1 done
  leaves 2–4 pending (independent completion). A demo schedule "Morning restroom clean" is left in
  the live DB so you can see it on the board.

**Benchmarks slice — DONE (2026-07-11 session 7b):** editable `cleaning_benchmarks` table
(category, optional branch/area scope, cleans/day, interval, photo-required, is_global/is_active +
archive) seeded with 7 global defaults (Bathroom 4, Kitchen 3, Office 1, Reception 2, Common 2,
Ward 6, ICU 8). Superuser-gated RPCs (`admin_can_manage_benchmarks` = superuser OR the new
`benchmarks.manage` permission override): create/update/set_active/delete (migrations
`cleaning_benchmarks`, `cleaning_benchmark_rpcs`; schema.sql mirrored). New `benchmarks`
AdminFeature. A **"Benchmarks" button on the Locations page** (next to Manage categories) opens
`ManageBenchmarks.tsx` (view/search/add/edit cleans+photo/archive/restore/delete). The Schedule
modal's benchmark banner now reads from the **live** table (static map removed) and **logs a
`benchmark_overridden` audit** when a schedule's frequency differs from the benchmark. Mock seed
bumped to `cpg_mock_state_v18`. Verified in browser: 7 benchmarks list; edited Bathroom 4→5 (persisted,
reverted); Schedule modal shows the live value. Audit actions added: benchmark_created/updated/
archived/restored/deleted/overridden.

**Schedules management page — DONE (2026-07-11 session 7c):** a **"Board / Schedules" tab toggle**
on the Assign Today's Routes page. The Schedules view (`SchedulesPanel.tsx`) lists every schedule
with status/search filters, showing name, branch, category, area count, assigned staff, frequency
(N×/day), recurrence + next-generation date, and **today's completion (done/total occurrences)**.
Manager+ can Edit (name/assignee/cleans/recurrence/times/photo/notes/areas), Pause/Resume,
Duplicate, Archive/Restore. Backend: `update_schedule` / `set_schedule_status` / `duplicate_schedule`
RPCs + `admin_can_manage_schedule` (manager+ w/ branch access) — migration `schedule_management_rpcs`,
schema.sql mirrored. Mock now stores schedule definitions (`state.schedules`, key
`cpg_mock_state_v19`; `CleaningSchedule` gained `lastGeneratedDate`). Verified in browser: list with
0/8 completion, Pause, Duplicate, Edit cleans 4→3; test copy removed + original restored.

**Remaining from this spec (NOT built yet — next slices, in the user's stated priority order):**
1. Daily occurrence regeneration (currently only "today" is generated at create time; needs a cron/
   edge function to roll active schedules forward each day and mark missed occurrences). schema has
   `last_generated_date` ready; a generator RPC + scheduled task would complete it.
4. Scheduled-Clean report + the flexible report builder (selectable fields, CSV/Excel/**PDF**,
   presets, branch-scoped) and the "everything reportable" report-type list.
5. Staff-app scheduled-task view polish (occurrence count / due-by labels).
6. The entire **Transit / inactive-time tracking** feature (activity events, transit periods,
   dashboard cards, board idle labels, thresholds, redeployment suggestions, transit reports).
Multi-staff "split" schedules and the separate `schedule_occurrences`/`proof_logs` tables from the
spec were intentionally NOT created — occurrences reuse `assignments` (simpler, and behaviourally
identical). Reconsider if the reports need a dedicated occurrences table.

## Previous session (2026-07-11, sixth session)
**No task in progress.** **Editable location categories + Live Map grouped by
category**. Verified in the browser against Supabase as thando@ (superuser):
- **New `location_categories` table** (global or branch-scoped; name/slug/description/icon/color/
  sort_order/is_active + archived_at/by + created_by). Seeded 12 defaults for the demo site
  (Bathroom…Parking) + `areas.category_id` FK backfilled from the old `category` text. The old
  6-value CHECK on `areas.category` was dropped — `Area.category` is now a free slug string kept
  as a denormalized label, with `Area.categoryId` the real link. (Migrations `location_categories`,
  `location_category_rpcs`, `area_category_id_params`; schema.sql mirrors all of it.)
- **Categories are managed via RPCs** (superuser, or anyone with the new `categories.manage`
  permission override): `create/update/delete/set_active/reassign_area_category`, gated by
  `admin_can_manage_categories()`. Deleting a category that's in use is blocked with a reassign
  message; archived categories drop out of the New Area dropdown but still label their areas.
- **New Area / Edit Area modals** use a dynamic category dropdown; New Area has a "+" that opens an
  inline "New category" form (name/color/icon/scope) which saves and auto-selects the category.
- **Locations page**: filter pills now come from the backend (active categories, colored dots),
  plus a "Manage categories" button opening `ManageCategories.tsx` (search, scope/status filters,
  add/edit name+color+icon, reorder, archive/restore, delete-if-unused, bulk reassign).
- **Live Map** now groups by **Category → Floor → cards** by default, with a Group by
  Category/Floor/Branch toggle (persisted to localStorage `cpg_livemap_groupby`), a category
  filter, collapsible sections, and per-category counts (clean / in progress / overdue / not
  recorded). Status colors still drive the tiles; category color is only a small dot.
- **Permissions**: a new `categories` AdminFeature (view default for admin/manager/supervisor/
  read-only; manage superuser-only unless granted). Enforced on the backend RPCs, not just hidden.
- **Reports/import/export** flow the category through: reports + export use the category label;
  import accepts any category slug and links it to a matching category_id server-side.
- Audit actions added: category_created/updated/archived/restored/deleted, area_category_changed,
  category_reassigned. Mock seed bumped to `cpg_mock_state_v16`.
- Verified: create category from New Area "+" (real Supabase row, auto-selected), save area linked
  to it, pill on Locations, area on Live Map under its category+floor, group-by toggle, Manage
  categories edit/archive (hidden from New Area), used-category delete blocked → reassign. All
  test artifacts removed from the live DB. Build + lint clean.
- **Known minor gap**: the category read RLS is site-level, so a branch-restricted admin could see
  another branch's branch-specific categories in pickers (all seeded categories are global, so it
  doesn't show in the demo). Tighten the `location_categories` select policy by branch access if
  branch-specific categories get real use.

## Previous session (2026-07-11, fifth session)
**No task in progress.** The **Users & Access page was rebuilt to match the Staff
page** (admin/dashboard accounts only; staff stay on the Staff page). Verified in the browser
against Supabase as thando@ (superuser):
- **Staff-style layout**: page header with count + branch scope, filter pills (All / Active /
  Disabled / Archived), search over name/ID/email/role/branch, card rows with avatar, name,
  **admin ID code** (e.g. AD-style, shown + editable), status badge, role badge, email/phone,
  branch-access summary + default branch, an Active/Disabled status dropdown, and Edit /
  Manage access / Archive buttons (Restore on archived rows).
- **Admins now have real lifecycle fields.** Migration `admin_lifecycle_columns` added
  `staff_id, email, phone, account_status, created_at, updated_at, archived_at/by, restored_at/by`
  to `admin_profiles` (email was previously only in auth.users, so rows showed blank emails — now
  fixed + backfilled; staff_id backfilled as INITIALS-#### for the 7 existing admins).
- **Backend enforcement** (migration `admin_status_enforcement`): `current_admin_role()` now only
  returns a role for `account_status='active'`, so disabled/archived admins fail every RLS
  policy + RPC across the app (can't log in or see any data). A guard trigger blocks self-role-
  escalation to superuser and prevents demoting/disabling/archiving the **last active superuser**.
  `set_admin_status` RPC (superuser-only) handles archive/disable/restore with audit stamps.
- **Add user now actually works in Supabase mode** via `create_admin_account` RPC (migration
  `create_admin_account_rpc`) — a SECURITY DEFINER function that makes the auth.users + identity +
  admin_profiles rows in one shot (the anon key can't create auth users directly). Superuser-gated.
  The Add modal collects name, Staff ID (+ Generate ID), email, phone, role, branch access (+ All),
  default branch, a **starting password** (admins log in by email+password, not PIN), and status.
- **Auth gates**: both repos' `authenticateAdmin` reject non-active admins; `AdminAuthContext`
  drops a stored session if the admin was since disabled/archived.
- All admin mutations (add/edit/archive/manage-access) are superuser-only in the UI **and** on the
  backend. Verified: create (real auth user made), duplicate Staff ID rejected, archive→Archived
  tab + audit stamps, restore, last-superuser guard fires (tested via rolled-back SQL). Test admin
  removed from the live DB afterward. Build + lint clean. Mock seed bumped to `cpg_mock_state_v15`.
- NOTE: admins log in by **email + password**, not Staff ID; the admin Staff ID is a display code.
  In mock/demo mode new admins still use the shared `demo1234` password (mock auth ignores the
  per-user password); in Supabase mode the starting password set in the modal is real.

## Previous session (2026-07-11, fourth session)
**No task in progress.** Staff page management upgrades, all verified in the browser
against Supabase:
- **Editable Staff ID**: optional Staff ID field on Add user (auto-generates when blank) and an
  editable Staff ID field on Edit user. Unique-code clashes surface friendly errors in both repos
  (`UpdateStaffInput.staffCode` is new).
- **PIN reset now confirms**: success shows "✓ PIN reset to NNNN…", failures show an inline error
  (it used to fail silently — see role bug below), button shows "Resetting…" while busy.
- **Soft delete + restore for staff**: new `deleted` account status (migration `staff_soft_delete`
  widened the check constraint; schema.sql matches). Delete/Archive/Restore buttons per row with
  an inline confirm. Deleted users are excluded from "All" and live under a new "Deleted" filter
  chip; they can't sign in (authenticate_staff requires active) and their unfinished work is
  unassigned, same as archive. Restore returns them to active. Audit actions: `user_deleted`,
  `user_restored`.
- **ROLE BUG FIX (important)**: five RPCs (`reset_staff_pin`, `set_area_frequency`, `update_area`,
  `create_task_template`, `update_task_template`) and two policies (staff UPDATE, import-batch
  INSERT) only allowed `super_admin`/`manager` — but every top-tier admin here is `superuser`, so
  superusers were denied PIN resets and template management, and their staff-row updates silently
  no-opped (migration `superuser_role_checks`). Also `role_check_null_safety`: guards like
  `role not in (...)` pass when current_admin_role() is NULL (no admin profile, e.g. anon key) —
  wrapped in `coalesce(role, '')` across 9 functions. schema.sql updated to match both.
- Verified end-to-end as thando@: create with custom ID TC-9001, rename to TC-9002, PIN reset
  5678 (authenticate_staff confirms), delete → Deleted chip → can't sign in → restore → active.
  Test user removed from the live DB afterwards. Build + lint clean.

## Previous session (2026-07-11, third session)
**No task in progress.** Security + branding pass on the logins, plus two real superusers:
- **Demo credential hints removed** from the staff sign-in (`Demo: MB-4471 · PIN 1234` line,
  placeholder now a non-account `AB-1234`), the admin sign-in (demo account list, placeholder now
  `you@cleanproofguard.com`), and the Add-user modal's "password is demo1234" note. NOTE: the demo
  accounts themselves still exist and still accept demo1234 / PIN 1234 in Supabase — disable or
  re-password them before a real rollout.
- **New superusers (all branches): Sikha Moyo (sikha@cleanproofguard.com) & Thando Ndhlovu
  (thando@cleanproofguard.com)**, initial password shared in chat — not written here since this
  repo is on GitHub; change it via Supabase dashboard → Authentication → Users after first login.
  Also in the mock seed (storage key bumped to `cpg_mock_state_v14`);
  mock mode still uses the shared demo1234 for all admins.
- **"Powered by Touchstone Facility Management Academy"** footer line on staff sign-in, admin
  sign-in, and the /welcome landing page (text-only, muted gold accent to match their logo).
- **New Supabase migrations:** `touchstone_superusers` (auth users + admin_profiles rows) and
  `superuser_admin_directory` (RLS: superusers can read/update ALL admin_profiles at their site —
  before this, Users & Access showed only your own row in Supabase mode and access edits couldn't
  save; `schema.sql` updated to match).
- Verified in the browser against Supabase: thando@ signs in, Users & Access lists all 7 admins,
  both logins + landing show the Touchstone line, no console errors. Build + lint clean.

## Previous session (2026-07-11, second session)
**No task in progress.** The system is split into two clear entry points:
- **Admin website is the default**: `/` → `/admin` (login/dashboard). The old landing page moved to
  `/welcome`. Alias routes: `/admin/login`, `/admin/dashboard`, `/staff/login`, `/staff/app`. The
  admin sidebar has an "Open Staff App" preview link (new tab).
- **Staff app is an installable PWA** under `/staff`: `public/manifest.webmanifest` (CPG Staff,
  #0B7D54, standalone, scope `/staff`), generated icons in `public/icons/`, iOS/Android meta tags in
  `index.html`, an Install button on staff sign-in + profile (`src/staff/components/InstallStaffApp.tsx`,
  beforeinstallprompt on Android, Add-to-Home-Screen instructions on iOS, hidden when standalone), and
  an app-shell service worker `public/sw.js` (registered in prod builds only; never caches /admin or
  Supabase data).
- **New staff screens**: ONGOING cards (in-progress, tap to continue), "Available to pick up"
  (unassigned branch work, claim-once via new `repo.claimAssignment`/`listOpenAssignments`),
  `/staff/profile` (info + install + sign out), `/staff/pending` (offline outbox).
- **Offline outbox** (`src/staff/outbox.ts`): checklist works optimistically offline; failed
  submissions queue locally as "Pending sync", auto-sync on reconnect, deduped by re-checking the
  assignment server-side before replay.
- **Supabase storage bucket `proof-photos` created** (migration `proof_photos_bucket`) — photo
  uploads were failing with "Bucket not found" before this; schema.sql updated to match.
- All acceptance-testable flows verified in the browser against Supabase (routing, PWA assets,
  pick-up, complete-with-photos, outbox sync + dedupe, admin live feed/photo gallery reflecting
  staff work, thabo scoped to SWH only, /admin/users blocked for non-superusers).

## Previous session (2026-07-11)
**No task in progress — everything below is done and verified.** Latest work: the project is now on
GitHub (https://github.com/Twax0010-rgb/CleanProofGuard) and **runs against a real Supabase backend**
(project `ezqxsdejcdxngunfebds`, eu-central-1). Three migrations applied: `initial_schema`,
`multibranch_demo_seed` (branches, hospital staff/areas, 5 admin auth users, today's assignments),
and `staff_app_anon_access` (`get_staff_public` RPC + anon branches read policy). `app/.env` holds the
project URL + anon key (gitignored); delete it to fall back to mock mode. Same demo logins as mock:
admins `demo1234`, staff PIN `1234`. Two Supabase-mode bugs were found & fixed in
[supabaseRepo.ts](app/src/lib/repo/supabaseRepo.ts): `getStaff` now uses the `get_staff_public` RPC
(the staff app's anon key can't pass the admins-only staff RLS), and `subscribe()` now uses a unique
realtime channel topic per call (supabase-js returns the existing channel for a reused topic and
throws when a second subscriber adds callbacks — this blanked the staff app after sign-in).
`schema.sql` was updated to match what's deployed (pgcrypto lives in the `extensions` schema on
Supabase). Both staff (MB-4471) and admin (owen@) sign-ins verified in the browser against Supabase.
Note: seed timestamps are relative to migration time, so demo KPIs drift as days pass — re-running
the seed (or assigning fresh work in the app) refreshes the demo.

Environment notes: Node.js lives at `C:\Program Files\nodejs` but is NOT on PATH (prefix commands
with `$env:Path = "C:\Program Files\nodejs;$env:Path"`). Run from `app/`: `npm run dev` →
http://localhost:5173. Mock data auto-reseeds from localStorage key `cpg_mock_state_v13` (bump the
key in `app/src/lib/repo/mockRepo.ts` whenever the seed shape changes). Build check: `npm run build`;
lint: `npm run lint` (only pre-existing fast-refresh warnings are expected).

## What this is
A cleaning-compliance system: a phone-first **staff app** (sign in, see route, scan QR tags,
complete checklists, submit proof) and a desktop **admin dashboard** (assign routes, monitor
live progress, manage users/locations, run reports). Built with React 19 + Vite + TypeScript +
Tailwind CSS v4. Ships with a mock localStorage-backed backend (works out of the box, no setup)
and an optional real Supabase backend behind the same interface — see `app/.env.example` and
`app/supabase/schema.sql` to switch to Supabase later.

## Current status: fully functional, redesigned, not yet deployed
Everything below has been built and verified working in a real browser. The **only blocker right
now** is purely local: getting Node.js installed on a Windows machine so `npm install` /
`npm run dev` can run. No code work is blocked — this is just an environment setup step.

## How to run it
```
cd app
npm install
npm run dev
```
Open http://localhost:5173. Requires Node.js 18+ (install from nodejs.org, LTS version, if
`node -v` isn't recognized).

## Demo logins
**Admin** (`/admin/auth`), all password `demo1234`:
- owen@cleanproofguard.com — Superuser (all branches)
- sara@cleanproofguard.com — Manager (both hospitals: Southwest + Northwest)
- thabo@cleanproofguard.com — Manager (Southwest Hospital only)
- renee@cleanproofguard.com — Supervisor (Southwest, no branch management)
- chris@cleanproofguard.com — Read-only (Northgate)

**Staff** (`/staff/auth`), all PIN `1234`:
- Northgate: MB-4471 (Marcus Bell), AR-2290 (Aisha Rahman), JT-1187 (Jamal Turner), DK-3355 (Dana Kim)
- Southwest Hospital: NM-7100 (Nomsa Dlamini), SP-7101 (Sipho Khumalo)
- Northwest Hospital: LM-7200 (Lindiwe Mokoena), TJ-7201 (Tebogo Jacobs)

## Branches, permissions & photo proof (added — see `Clean_Proof_Guard_Branch_Access_Photo_Checklist.pdf`)
- **Multi-branch**: three facilities seeded — Northgate Tower (GAU-NGT), Southwest Hospital (GAU-SWH),
  Northwest Hospital (GAU-NWH). Every area/assignment/staff/issue/photo carries a `branchId`.
- **Branch switcher** (sidebar) grouped by province, with "All assigned"; pages default to the user's
  default branch, dates default to Today.
- **Branches page**: add/edit/archive/restore (archive needs a reason, blocks hard-delete of branches
  with history, audited). Superuser-managed; managers get read-only view; supervisors have no access.
- **Users & Access page** (superuser): per-user Branch access (checkboxes + All/Select-all/Clear presets),
  default branch, role, and a Feature × (view/manage/export) permission matrix — layered over role defaults.
- **Backend-enforced scoping**: the repo filters every admin list query to the acting admin's allowed
  branches, and `getBranch`/`getProofPhoto` return null for out-of-branch ids (not just hidden UI). Route
  guards show a friendly "no access" page for disallowed feature URLs.
- **Photo Proof gallery** (`/admin/photos`): grid of staff-captured photos, defaults to Today + active
  branch, filters (staff/task/before-after/review-status/search), detail drawer with full proof context,
  and approve/reject/flag review. Export is a separate `photos.export` permission and is audited.
- Area codes are branch-prefixed (SWH-, NWH-, CPG-); the staff scanner derives the prefix per area.

## UX improvements (second pass)
- **Users & Access → Add user**: superusers create dashboard accounts (name/email/title/role/branch
  access) from the app. Mock mode: every account signs in with `demo1234`. Supabase mode throws a
  pointer to create the Auth user first.
- **Assignments board**: the Unassigned column is now sticky (stays visible while scrolling across
  staff) and every unassigned card has a one-click **Assign** menu — no cross-board dragging needed.
- **Branches form**: Province/State is a dropdown of South Africa's 9 provinces (no typos).
- **Photo Proof**: the gallery is organised as **proof sets** — one card per proof log with before
  and after photos together (never split). A "Needs review" section sits on top (newest first) and
  reviewed sets move down into a dimmed "Reviewed" section, so pending work never gets buried.
  Approve/Reject on a card (or in the drawer) stamps the whole set; the drawer shows both photos
  stacked with set-level metadata and notes. Proof is expected as a **before + after pair**: photo-
  required tasks won't submit until both shots are attached (the button names whichever is missing),
  every seeded completed clean carries both, and a set missing a shot renders an explicit
  "No before/after photo" gap tile instead of a lone image (state key `cpg_mock_state_v13`).
- **Live Map ↔ Locations**: deactivated locations drop off the map immediately; tiles are clickable
  (jump to Locations); Locations rows have a **Delete** button — hard-delete is refused for areas
  with proof/photos/issues (deactivate those instead), and deletions are audited.
- **Dark mode**: a sun/moon toggle in the admin sidebar re-skins the whole app (admin, staff, and
  public pages) via CSS-variable overrides; the choice persists per browser.
- **Staff app pass**: the proof-logged screen now says "All caught up — {area} comes around again
  in {time}" instead of "Next up: {the room just cleaned}" when the only remaining work is that
  area's future recurring cycle; it names the staff member's branch instead of the site; and the
  last hardcoded `CPG-` prefix was removed (codes render per-branch). Seed data now gives about
  half of completed cleans a before photo, so the gallery demos paired sets out of the box
  (mock state key bumped to `cpg_mock_state_v12`).
- **My Route split into sections**: pending work (next-up, overdue, to-do — in route order) renders
  first; completed areas sit at the bottom under a "Completed · n" divider so finished rooms never
  push the next job off-screen. When everything's done, an "All areas complete for this shift" note
  shows in place of the pending list.

## What's built
- Staff auth (Staff ID + PIN) and admin auth (email/password), role-gated routing
- Staff app: today's route, QR scan (camera + manual fallback), per-area checklist, photo/notes,
  report-an-issue, mark-clean → proof log, live countdown to next clean
- Admin: Overview (KPIs, live activity feed, staff-on-shift), Live map, Assignments board
  (drag-and-drop, Unassigned column, per-staff Ongoing/Pending/Completed sections with collapsible
  Completed + audited Reopen-with-reason), Staff management (add/edit/disable/archive/reset PIN),
  Locations (CRUD, CSV import/export with validation + error reports), Reports (KPI summary +
  a full report builder: 8 report types, selectable/reorderable/searchable fields, save/load
  templates, CSV/Excel/PDF export), Notification center, Audit log
- Task system: super-admin task templates (versioned so edits never rewrite history), Create Task
  modal (template or ad hoc, multi-staff assign, priority, due date, checklist), priority/type
  badges everywhere
- 4-tier RBAC (Super Admin / Manager / Supervisor / Read-only) enforced in the backend layer, not
  just hidden UI
- Full visual redesign: "inspection log" aesthetic — recycled-paper palette, Barlow Condensed
  display face, rubber-stamp verified/overdue seal on the public verify page, tag-card sign-ins

## What's explicitly NOT built (deliberate scope cuts, disclosed along the way)
- Branch hierarchy is a flat Province→Branch model (no Building/Floor sub-levels below the branch,
  no Country/Company tier) — the branch is the scoping unit
- No XLSX file **import** (CSV only) — a hand-rolled parser was used deliberately to avoid a
  known unpatched vulnerability in the `xlsx` npm package's parsing code; `xlsx` is only used for
  writing exports (safe)
- No offline mode / idempotency keys / sync-pending states
- No staff-initiated task creation, no "team" assignment concept
- Photo storage is inline data-URLs in the mock; real signed-URL/private-bucket storage, EXIF/GPS
  scrubbing, and retention policies are Supabase-mode concerns (schema is wired, storage isn't)
- No bulk actions, no pagination on most lists, no session expiry, no QR replacement flow
- PDF export works via a print-friendly page + the browser's Print→Save-as-PDF, not a real PDF
  library

### Resolved since the original handoff
- Multi-branch hierarchy + per-user branch access + a feature×action permission matrix (was cut) —
  now built and enforced in the repo layer; see the section above
- Staff Photo Proof gallery with review workflow — built
- Dashboard "Search area or staff" — wired up (filters activity + staff-on-shift)
- `requirePhoto` — now enforced before "Mark area clean"
- Task edit / cancel-with-reason on the admin board — built
- A UTC-vs-local date bug in export filenames / date picker, and a mock-repo id-collision bug
  (duplicate React keys after reload) — fixed

## Suggested next steps (in priority order, if picking this back up)
1. Get Node.js installed locally and confirm `npm run dev` works
2. Wire up (or remove) the decorative dashboard search
3. Enforce `requirePhoto` on the staff checklist
4. Add task edit/cancel on the admin side

## Files worth knowing about
- `app/src/lib/repo/` — the `DataRepo` interface + `mockRepo.ts` (localStorage) + `supabaseRepo.ts`
  (real backend), auto-selected via `isSupabaseConfigured()`
- `app/src/lib/domain.ts` — business logic, labels, role predicates
- `app/src/lib/reports.ts` — report builder engine, date-range utilities
- `app/src/admin/pages/Assignments.tsx` — the task board (largest/most complex file)
- `app/supabase/schema.sql` — full Postgres schema + RLS policies, if you want real persistence
