# Clean Proof Guard — Project Handoff

## ⏸ Where we left off (2026-07-11, for the next session)
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
