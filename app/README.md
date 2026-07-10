# Clean Proof Guard

Proof-of-cleaning system: staff scan QR tags on a phone to prove each area was
cleaned; admins assign routes and monitor completion live from a desktop
dashboard. Built with React + Vite + TypeScript + Tailwind CSS v4.

Implements the screens designed in `../project/Clean Proof Guard.dc.html`
(see `../README.md` and `../chats/` for the design handoff this was built from).

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL. The root page links to both apps:

- **Staff app** (`/staff/auth`) — phone-first: sign in → my route (with live
  per-area recurring-cleaning countdowns) → scan tag → verify checklist →
  proof logged.
- **Admin dashboard** (`/admin/auth`) — desktop: overview (KPIs, live
  activity, staff on shift), assignments board (drag-and-drop routing),
  locations (per-area cleaning frequency + QR tags), staff roster (add/edit/
  disable/archive users, reset PINs), live map (status by floor), and reports
  (today's breakdown + overdue log).
- **Public verify page** (`/verify/:areaCode`, e.g. `/verify/CPG-3M-014`) — no
  login required. This is what the physical QR tag at each location opens:
  area name, category, and a live "last cleaned" / "next due" readout. Print
  the QR from a location's row on the admin Locations page.

### Demo credentials

The app ships with a working in-memory/localStorage mock backend, seeded with
a demo site (Northgate Tower), staff, and today's assignments — no setup
required.

- Staff: `MB-4471` / PIN `1234` (also `AR-2290`, `JT-1187`, `DK-3355`, all PIN `1234`)
- Admin — one per permission tier, all password `demo1234`:
  - `owen@cleanproofguard.com` — Super Admin (full access)
  - `sara@cleanproofguard.com` — Manager (full access)
  - `renee@cleanproofguard.com` — Supervisor (reassign work, can't manage users/areas)
  - `chris@cleanproofguard.com` — Read-only (view everything, no editing)

Mock data is scoped to the browser's localStorage, so the staff app and admin
dashboard only share state within the same browser — that's expected until
Supabase is wired up (see below), at which point every device reads/writes
the same real backend.

## Connecting a real backend (Supabase)

The app is written against a `DataRepo` interface (`src/lib/repo/types.ts`)
with two implementations: `mockRepo` (default, no setup) and `supabaseRepo`.
It switches to Supabase automatically once real credentials are present.

1. Create a Supabase project.
2. Run `supabase/schema.sql` against it (SQL editor, or `supabase db push`) —
   creates tables, RLS policies, the `authenticate_staff` RPC, and seeds the
   same demo staff as the mock data.
3. Create a `proof-photos` storage bucket (public read) for checklist photos.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` from your project's API settings.
5. Create an admin: add an auth user (dashboard → Authentication → Add user),
   then insert a matching row into `admin_profiles` (see the comment at the
   bottom of `schema.sql`).

Restart the dev server — `src/lib/env.ts` detects the credentials and
`src/lib/repo/index.ts` switches to `supabaseRepo` for every screen.

**Security note:** the RLS policies in `schema.sql` are a permissive starting
point for development (see the comment at the top of that file) — harden them
before running this in production.

## Notable implementation choices

- **QR scanning** (`src/staff/components/QrScanner.tsx`) uses the device
  camera + `jsqr` to decode tags client-side, with a manual "Enter code"
  fallback (also useful for testing without a printed tag). A physical tag
  encodes the full `/verify/:code` URL, so a bare phone-camera scan (not the
  staff app) opens the public page directly; the in-app scanner and manual
  entry both also accept the bare code.
- **Areas vs. assignments**: `Area` (`src/lib/types.ts`) is the persistent
  config for a physical space — category, recurring cleaning frequency,
  checklist template, last-cleaned time. `Assignment` is one cleaning-cycle
  instance against an area. When a frequency-tracked area's assignment is
  submitted, the repo stamps the area's `lastCleanedAt` and generates the
  *next* cycle's assignment automatically (`spawnNextCycle` in
  `mockRepo`/`supabaseRepo`) — that's the countdown shown on My Route, the
  Locations page, and the verify page resetting on every scan.
- **Assignments board** drag-and-drop uses `@dnd-kit/core`.
- **Realtime**: `DataRepo.subscribe()` triggers a refetch on change — backed
  by an `EventTarget` in mock mode and Supabase Realtime `postgres_changes`
  once connected.
- **QR tag generation**: the Locations page renders and lets you download a
  real scannable QR (via the `qrcode` package) for each area's verify URL —
  print it and stick it at the entrance.
- **User management** (admin Staff page): account lifecycle (`active` /
  `disabled` / `archived`) is separate from shift status (`on_shift` /
  `on_break` / `off_shift`). Disabling or archiving someone rejects their next
  sign-in, force-ends any live session within ~45s (`StaffAuthContext` polls
  and listens on `repo.subscribe`), and immediately hands their unfinished
  work back to the Unassigned column — while completed assignments keep their
  name for history. PINs are set at creation and can be reset from the Edit
  user modal; in Supabase mode both go through `create_staff` /
  `reset_staff_pin` RPCs so a PIN is never hashed client-side.
- **Admin roles** (`AdminRole` in `src/lib/types.ts`): Super Admin and Manager
  can manage users and areas; Supervisor can additionally reassign work and
  toggle shift status but not manage users/areas; Read-only can view every
  admin page but can't mutate anything. This is enforced in the repo layer,
  not just hidden in the UI — `mockRepo` checks the signed-in admin's role
  itself (tracked via `setActingAdmin`, called from `AdminAuthContext`, not a
  client-supplied argument), and Supabase mode backs the same actions with
  role-checked RPCs (`set_staff_status`, `assign_staff_to_area`,
  `set_area_frequency`, `publish_routes`) plus a role-aware RLS policy on the
  `staff` table.
