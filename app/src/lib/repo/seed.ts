import { placeholderPhoto } from '../domain'
import type { AdminUser, Area, AreaCategory, Assignment, AuditLogEntry, Branch, ChecklistTask, ImportBatch, Issue, ProofPhoto, ReportTemplate, Site, Staff, TaskTemplate } from '../types'

export const SITE_ID = 'site-northgate'

// Branch/facility ids. Northgate is the original single-site data; the two Gauteng hospitals
// are the multi-branch examples from the spec.
export const BRANCH_NG = 'branch-northgate'
export const BRANCH_SW = 'branch-swh'
export const BRANCH_NW = 'branch-nwh'

const MEN_RESTROOM_TASKS: Array<[string, boolean]> = [
  ['Mop & disinfect floor', true],
  ['Refill soap & paper towels', true],
  ['Empty & reline bins', true],
  ['Clean & sanitize sinks', false],
  ['Restock toilet paper', false],
]

const GENERIC_TASKS = [
  'Wipe & disinfect surfaces',
  'Empty & reline bins',
  'Sweep / vacuum floor',
  'Restock supplies',
]

function tasksFrom(labels: string[], completed: (i: number) => boolean): ChecklistTask[] {
  return labels.map((label, i) => ({
    id: `${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    completed: completed(i),
    sortOrder: i,
  }))
}

interface SeedAssignmentSpec {
  id: string
  /** Defaults to Northgate when omitted. */
  branchId?: string
  areaName: string
  areaCode: string
  category: AreaCategory
  /** Recurring cleaning interval in minutes; null = manual/one-off scheduling. */
  frequencyMinutes: number | null
  staffId: string | null
  sortOrder: number
  status: Assignment['status']
  /** minutes from "now" — negative is in the past */
  dueOffsetMin?: number
  submittedOffsetMin?: number
  startedOffsetMin?: number
  /** For not-yet-done, frequency-tracked areas: when it was last actually cleaned (drives the countdown; dueOffsetMin is derived from this + frequencyMinutes). */
  lastCleanedOffsetMin?: number
  tasks: ChecklistTask[]
  withBeforePhoto?: boolean
}

function minutesFromNow(mins: number): string {
  return new Date(Date.now() + mins * 60_000).toISOString()
}

/** For frequency-tracked areas still pending today, the due time is derived from when it was last cleaned — not hand-picked — so the two always agree. */
function resolveDueOffsetMin(s: SeedAssignmentSpec): number | undefined {
  if (s.frequencyMinutes != null && s.lastCleanedOffsetMin !== undefined) {
    return s.lastCleanedOffsetMin + s.frequencyMinutes
  }
  return s.dueOffsetMin
}

function resolveLastCleanedOffsetMin(s: SeedAssignmentSpec): number | undefined {
  if (s.status === 'done') return s.submittedOffsetMin
  return s.lastCleanedOffsetMin
}

export function buildSeed(): {
  site: Site
  branches: Branch[]
  staff: Staff[]
  admins: AdminUser[]
  areas: Area[]
  assignments: Assignment[]
  staffPins: Record<string, string>
  issues: Issue[]
  auditLog: AuditLogEntry[]
  reportTemplates: ReportTemplate[]
  importBatches: ImportBatch[]
  taskTemplates: TaskTemplate[]
} {
  const site: Site = { id: SITE_ID, name: 'Clean Proof Guard' }

  const branches: Branch[] = [
    {
      id: BRANCH_NG, siteId: SITE_ID, provinceState: 'Gauteng', name: 'Northgate Tower', code: 'GAU-NGT',
      address: '1 Northgate Ave, Johannesburg', timezone: 'Africa/Johannesburg', contactPerson: 'Owen Vance',
      phone: '+27 11 555 0100', email: 'northgate@cleanproofguard.com', status: 'active', notes: null,
      createdAt: minutesFromNow(-60 * 24 * 120), createdByName: 'Owen Vance',
    },
    {
      id: BRANCH_SW, siteId: SITE_ID, provinceState: 'Gauteng', name: 'Southwest Hospital', code: 'GAU-SWH',
      address: '45 Hospital Rd, Soweto', timezone: 'Africa/Johannesburg', contactPerson: 'Thabo Nkosi',
      phone: '+27 11 555 0200', email: 'southwest@cleanproofguard.com', status: 'active', notes: null,
      createdAt: minutesFromNow(-60 * 24 * 30), createdByName: 'Owen Vance',
    },
    {
      id: BRANCH_NW, siteId: SITE_ID, provinceState: 'Gauteng', name: 'Northwest Hospital', code: 'GAU-NWH',
      address: '12 Clinic St, Randburg', timezone: 'Africa/Johannesburg', contactPerson: 'Lerato Molefe',
      phone: '+27 11 555 0300', email: 'northwest@cleanproofguard.com', status: 'active', notes: null,
      createdAt: minutesFromNow(-60 * 24 * 20), createdByName: 'Owen Vance',
    },
  ]

  const staff: Staff[] = [
    {
      id: 'staff-mb',
      siteId: SITE_ID,
      branchId: BRANCH_NG,
      staffCode: 'MB-4471',
      fullName: 'Marcus Bell',
      initials: 'MB',
      colorHex: '#1D231F',
      role: 'Cleaner',
      status: 'on_shift',
      accountStatus: 'active',
      email: 'marcus.bell@example.com',
      phone: '+1 555-0101',
      shiftStart: minutesFromNow(-180),
      shiftEnd: minutesFromNow(240),
      createdAt: minutesFromNow(-60 * 24 * 40),
      lastLoginAt: minutesFromNow(-180),
    },
    {
      id: 'staff-ar',
      siteId: SITE_ID,
      branchId: BRANCH_NG,
      staffCode: 'AR-2290',
      fullName: 'Aisha Rahman',
      initials: 'AR',
      colorHex: '#35668C',
      role: 'Cleaner',
      status: 'on_shift',
      accountStatus: 'active',
      email: 'aisha.rahman@example.com',
      phone: '+1 555-0102',
      shiftStart: minutesFromNow(-200),
      shiftEnd: minutesFromNow(220),
      createdAt: minutesFromNow(-60 * 24 * 25),
      lastLoginAt: minutesFromNow(-200),
    },
    {
      id: 'staff-jt',
      siteId: SITE_ID,
      branchId: BRANCH_NG,
      staffCode: 'JT-1187',
      fullName: 'Jamal Turner',
      initials: 'JT',
      colorHex: '#216B4B',
      role: 'Cleaner',
      status: 'on_shift',
      accountStatus: 'active',
      email: 'jamal.turner@example.com',
      phone: '+1 555-0103',
      shiftStart: minutesFromNow(-260),
      shiftEnd: minutesFromNow(160),
      createdAt: minutesFromNow(-60 * 24 * 90),
      lastLoginAt: minutesFromNow(-260),
    },
    {
      id: 'staff-dk',
      siteId: SITE_ID,
      branchId: BRANCH_NG,
      staffCode: 'DK-3355',
      fullName: 'Dana Kim',
      initials: 'DK',
      colorHex: '#808B81',
      role: 'Cleaner',
      status: 'on_break',
      accountStatus: 'active',
      email: 'dana.kim@example.com',
      phone: '+1 555-0104',
      shiftStart: minutesFromNow(-190),
      shiftEnd: minutesFromNow(230),
      createdAt: minutesFromNow(-60 * 24 * 12),
      lastLoginAt: minutesFromNow(-190),
    },
    {
      id: 'staff-pn',
      siteId: SITE_ID,
      branchId: BRANCH_NG,
      staffCode: 'PN-5502',
      fullName: 'Priya Nair',
      initials: 'PN',
      colorHex: '#808B81',
      role: 'Cleaner',
      status: 'off_shift',
      accountStatus: 'disabled',
      email: 'priya.nair@example.com',
      phone: '+1 555-0105',
      shiftStart: null,
      shiftEnd: null,
      createdAt: minutesFromNow(-60 * 24 * 5),
      lastLoginAt: minutesFromNow(-60 * 24 * 3),
    },
    // ——— Southwest Hospital staff ———
    {
      id: 'staff-sw1', siteId: SITE_ID, branchId: BRANCH_SW, staffCode: 'NM-7100', fullName: 'Nomsa Dlamini', initials: 'ND',
      colorHex: '#216B4B', role: 'Cleaner', status: 'on_shift', accountStatus: 'active', email: 'nomsa.dlamini@example.com',
      phone: '+27 82 555 0201', shiftStart: minutesFromNow(-210), shiftEnd: minutesFromNow(210), createdAt: minutesFromNow(-60 * 24 * 28), lastLoginAt: minutesFromNow(-210),
    },
    {
      id: 'staff-sw2', siteId: SITE_ID, branchId: BRANCH_SW, staffCode: 'SP-7101', fullName: 'Sipho Khumalo', initials: 'SK',
      colorHex: '#35668C', role: 'Cleaner', status: 'on_shift', accountStatus: 'active', email: 'sipho.khumalo@example.com',
      phone: '+27 82 555 0202', shiftStart: minutesFromNow(-160), shiftEnd: minutesFromNow(260), createdAt: minutesFromNow(-60 * 24 * 18), lastLoginAt: minutesFromNow(-160),
    },
    // ——— Northwest Hospital staff ———
    {
      id: 'staff-nw1', siteId: SITE_ID, branchId: BRANCH_NW, staffCode: 'LM-7200', fullName: 'Lindiwe Mokoena', initials: 'LM',
      colorHex: '#B27A0F', role: 'Cleaner', status: 'on_shift', accountStatus: 'active', email: 'lindiwe.mokoena@example.com',
      phone: '+27 82 555 0301', shiftStart: minutesFromNow(-140), shiftEnd: minutesFromNow(280), createdAt: minutesFromNow(-60 * 24 * 15), lastLoginAt: minutesFromNow(-140),
    },
    {
      id: 'staff-nw2', siteId: SITE_ID, branchId: BRANCH_NW, staffCode: 'TJ-7201', fullName: 'Tebogo Jacobs', initials: 'TJ',
      colorHex: '#8E44AD', role: 'Cleaner', status: 'off_shift', accountStatus: 'active', email: 'tebogo.jacobs@example.com',
      phone: '+27 82 555 0302', shiftStart: null, shiftEnd: null, createdAt: minutesFromNow(-60 * 24 * 9), lastLoginAt: minutesFromNow(-60 * 24 * 1),
    },
  ]

  // Demo-only PIN store (mock mode never hashes — Supabase mode always does, via pgcrypto).
  const staffPins: Record<string, string> = {
    'staff-mb': DEMO_STAFF_PIN,
    'staff-ar': DEMO_STAFF_PIN,
    'staff-jt': DEMO_STAFF_PIN,
    'staff-dk': DEMO_STAFF_PIN,
    'staff-pn': DEMO_STAFF_PIN,
    'staff-sw1': DEMO_STAFF_PIN,
    'staff-sw2': DEMO_STAFF_PIN,
    'staff-nw1': DEMO_STAFF_PIN,
    'staff-nw2': DEMO_STAFF_PIN,
  }

  const admins: AdminUser[] = [
    {
      id: 'admin-ov',
      siteId: SITE_ID,
      name: 'Owen Vance',
      initials: 'OV',
      colorHex: '#B3261E',
      title: 'Owner',
      role: 'superuser',
      email: 'owen@cleanproofguard.com',
      branchAll: true,
      branchIds: [],
      defaultBranchId: null,
      permissions: {},
    },
    {
      // "Admin B" — a regional manager with BOTH hospitals, to demo multi-branch switching.
      id: 'admin-sc',
      siteId: SITE_ID,
      name: 'Sara Cole',
      initials: 'SC',
      colorHex: '#B27A0F',
      title: 'Regional Manager',
      role: 'manager',
      email: 'sara@cleanproofguard.com',
      branchAll: false,
      branchIds: [BRANCH_SW, BRANCH_NW],
      defaultBranchId: BRANCH_SW,
      permissions: {},
    },
    {
      // "Admin A" — restricted to Southwest Hospital only.
      id: 'admin-tn',
      siteId: SITE_ID,
      name: 'Thabo Nkosi',
      initials: 'TN',
      colorHex: '#216B4B',
      title: 'Hospital Admin',
      role: 'manager',
      email: 'thabo@cleanproofguard.com',
      branchAll: false,
      branchIds: [BRANCH_SW],
      defaultBranchId: BRANCH_SW,
      permissions: {},
    },
    {
      // "Supervisor C" — Southwest only, and explicitly cannot manage branches.
      id: 'admin-ro',
      siteId: SITE_ID,
      name: 'Renee Okafor',
      initials: 'RO',
      colorHex: '#2E63B0',
      title: 'Shift Supervisor',
      role: 'supervisor',
      email: 'renee@cleanproofguard.com',
      branchAll: false,
      branchIds: [BRANCH_SW],
      defaultBranchId: BRANCH_SW,
      permissions: {},
    },
    {
      id: 'admin-cl',
      siteId: SITE_ID,
      name: 'Chris Lin',
      initials: 'CL',
      colorHex: '#5E6B76',
      title: 'Client Viewer',
      role: 'read_only',
      email: 'chris@cleanproofguard.com',
      branchAll: false,
      branchIds: [BRANCH_NG],
      defaultBranchId: BRANCH_NG,
      permissions: {},
    },
  ]

  const specs: SeedAssignmentSpec[] = [
    // Marcus Bell — 14 total: 6 done, 1 next(todo), 1 overdue, 6 todo
    { id: 'a-mb-1', areaName: 'Lobby & Reception', areaCode: 'CPG-L0-001', category: 'common', frequencyMinutes: 240, staffId: 'staff-mb', sortOrder: 1, status: 'done', submittedOffsetMin: -170, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-mb-2', areaName: 'L2 · Kitchenette', areaCode: 'CPG-2K-007', category: 'kitchen', frequencyMinutes: 240, staffId: 'staff-mb', sortOrder: 2, status: 'done', submittedOffsetMin: -150, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-mb-3', areaName: 'L1 · East Wing', areaCode: 'CPG-1E-002', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 3, status: 'done', submittedOffsetMin: -135, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-mb-4', areaName: 'L1 · West Wing', areaCode: 'CPG-1W-003', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 4, status: 'done', submittedOffsetMin: -115, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-mb-5', areaName: 'L2 · Server Room', areaCode: 'CPG-2S-008', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 5, status: 'done', submittedOffsetMin: -95, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-mb-6', areaName: 'L2 · Copy Room', areaCode: 'CPG-2C-010', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 6, status: 'done', submittedOffsetMin: -75, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-mb-7', areaName: "L3 · Men's Restroom", areaCode: 'CPG-3M-014', category: 'bathroom', frequencyMinutes: 120, staffId: 'staff-mb', sortOrder: 7, status: 'todo', lastCleanedOffsetMin: -110, tasks: tasksFrom(MEN_RESTROOM_TASKS.map((t) => t[0]), (i) => MEN_RESTROOM_TASKS[i][1]), withBeforePhoto: true },
    { id: 'a-mb-8', areaName: "L3 · Women's Restroom", areaCode: 'CPG-3W-015', category: 'bathroom', frequencyMinutes: 120, staffId: 'staff-mb', sortOrder: 8, status: 'todo', lastCleanedOffsetMin: -40, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-mb-9', areaName: 'L5 · Break Area', areaCode: 'CPG-5B-022', category: 'kitchen', frequencyMinutes: 240, staffId: 'staff-mb', sortOrder: 9, status: 'todo', lastCleanedOffsetMin: -285, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-mb-10', areaName: 'L4 · Stairwell B', areaCode: 'CPG-4S-016', category: 'common', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 10, status: 'todo', dueOffsetMin: 90, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-mb-11', areaName: 'L6 · Storage', areaCode: 'CPG-6S-025', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 11, status: 'todo', dueOffsetMin: 120, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-mb-12', areaName: 'L7 · Utility Room', areaCode: 'CPG-7U-035', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 12, status: 'todo', dueOffsetMin: 150, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-mb-13', areaName: 'L8 · Server Closet', areaCode: 'CPG-8S-040', category: 'office', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 13, status: 'todo', dueOffsetMin: 180, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-mb-14', areaName: 'L9 · Loading Dock', areaCode: 'CPG-9L-045', category: 'outdoor', frequencyMinutes: null, staffId: 'staff-mb', sortOrder: 14, status: 'todo', dueOffsetMin: 210, tasks: tasksFrom(GENERIC_TASKS, () => false) },

    // Aisha Rahman — 12 total: 9 done, 1 in progress, 2 todo
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `a-ar-${i + 1}`,
      areaName: `L${(i % 4) + 1} · Area ${i + 1}`,
      areaCode: `CPG-4A-${100 + i}`,
      category: 'office' as const,
      frequencyMinutes: null,
      staffId: 'staff-ar',
      sortOrder: i + 1,
      status: 'done' as const,
      submittedOffsetMin: -180 + i * 15,
      tasks: tasksFrom(GENERIC_TASKS, () => true),
    })),
    { id: 'a-ar-10', areaName: 'L4 · Meeting Rooms', areaCode: 'CPG-4M-018', category: 'common', frequencyMinutes: 240, staffId: 'staff-ar', sortOrder: 10, status: 'in_progress', startedOffsetMin: -6, dueOffsetMin: 30, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-ar-11', areaName: 'L4 · Storage Room', areaCode: 'CPG-4S-019', category: 'office', frequencyMinutes: null, staffId: 'staff-ar', sortOrder: 11, status: 'todo', dueOffsetMin: 80, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-ar-12', areaName: 'L4 · Pantry', areaCode: 'CPG-4P-020', category: 'kitchen', frequencyMinutes: 240, staffId: 'staff-ar', sortOrder: 12, status: 'todo', lastCleanedOffsetMin: -160, tasks: tasksFrom(GENERIC_TASKS, () => false) },

    // Jamal Turner — 11 total, all done
    { id: 'a-jt-1', areaName: 'L2 · Kitchenette', areaCode: 'CPG-2K-007B', category: 'kitchen', frequencyMinutes: 240, staffId: 'staff-jt', sortOrder: 1, status: 'done', submittedOffsetMin: -240, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-jt-2', areaName: 'L1 · Gym & Showers', areaCode: 'CPG-1G-003', category: 'bathroom', frequencyMinutes: 120, staffId: 'staff-jt', sortOrder: 2, status: 'done', submittedOffsetMin: -222, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-jt-3', areaName: 'L1 · Mailroom', areaCode: 'CPG-1M-005', category: 'office', frequencyMinutes: null, staffId: 'staff-jt', sortOrder: 3, status: 'done', submittedOffsetMin: -204, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `a-jt-${i + 4}`,
      areaName: `L${(i % 3) + 1} · Zone ${i + 4}`,
      areaCode: `CPG-9Z-${204 + i}`,
      category: 'office' as const,
      frequencyMinutes: null,
      staffId: 'staff-jt',
      sortOrder: i + 4,
      status: 'done' as const,
      submittedOffsetMin: -186 + i * 18,
      tasks: tasksFrom(GENERIC_TASKS, () => true),
    })),

    // Dana Kim — 13 total: 7 done, 1 overdue, 5 todo
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `a-dk-${i + 1}`,
      areaName: `L${(i % 5) + 1} · Corridor ${i + 1}`,
      areaCode: `CPG-5C-${300 + i}`,
      category: 'common' as const,
      frequencyMinutes: null,
      staffId: 'staff-dk',
      sortOrder: i + 1,
      status: 'done' as const,
      submittedOffsetMin: -170 + i * 12,
      tasks: tasksFrom(GENERIC_TASKS, () => true),
    })),
    { id: 'a-dk-8', areaName: 'L2 · Server Room', areaCode: 'CPG-2S-031', category: 'office', frequencyMinutes: null, staffId: 'staff-dk', sortOrder: 8, status: 'todo', dueOffsetMin: -20, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `a-dk-${i + 9}`,
      areaName: `L${(i % 4) + 1} · Wing ${i + 9}`,
      areaCode: `CPG-6W-${400 + i}`,
      category: 'office' as const,
      frequencyMinutes: null,
      staffId: 'staff-dk',
      sortOrder: i + 9,
      status: 'todo' as const,
      dueOffsetMin: 60 + i * 20,
      tasks: tasksFrom(GENERIC_TASKS, () => false),
    })),

    // Unassigned pool
    { id: 'a-un-1', areaName: 'L6 · Executive Suite', areaCode: 'CPG-6E-030', category: 'office', frequencyMinutes: null, staffId: null, sortOrder: 1, status: 'todo', dueOffsetMin: 90, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-un-2', areaName: 'L1 · Parking Lobby', areaCode: 'CPG-1P-004', category: 'outdoor', frequencyMinutes: null, staffId: null, sortOrder: 2, status: 'todo', dueOffsetMin: 120, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-un-3', areaName: 'L7 · Roof Terrace', areaCode: 'CPG-7R-041', category: 'outdoor', frequencyMinutes: null, staffId: null, sortOrder: 3, status: 'todo', dueOffsetMin: 150, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-un-4', areaName: 'L9 · Loading Dock B', areaCode: 'CPG-9L-050', category: 'outdoor', frequencyMinutes: null, staffId: null, sortOrder: 4, status: 'todo', dueOffsetMin: -15, tasks: tasksFrom(GENERIC_TASKS, () => false) },

    // ————— Southwest Hospital (GAU-SWH) —————
    { id: 'a-sw-1', branchId: BRANCH_SW, areaName: 'Ward A · Patient Rooms', areaCode: 'SWH-WA-001', category: 'common', frequencyMinutes: 120, staffId: 'staff-sw1', sortOrder: 1, status: 'done', submittedOffsetMin: -160, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-sw-2', branchId: BRANCH_SW, areaName: 'Theatre 1 · Operating Room', areaCode: 'SWH-OR-002', category: 'other', frequencyMinutes: 60, staffId: 'staff-sw1', sortOrder: 2, status: 'done', submittedOffsetMin: -95, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-sw-3', branchId: BRANCH_SW, areaName: 'ICU · Restroom', areaCode: 'SWH-3M-003', category: 'bathroom', frequencyMinutes: 90, staffId: 'staff-sw2', sortOrder: 3, status: 'done', submittedOffsetMin: -50, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-sw-4', branchId: BRANCH_SW, areaName: 'Reception · Waiting Area', areaCode: 'SWH-RC-004', category: 'common', frequencyMinutes: 180, staffId: 'staff-sw2', sortOrder: 4, status: 'in_progress', startedOffsetMin: -8, dueOffsetMin: 25, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-sw-5', branchId: BRANCH_SW, areaName: 'Ward B · Corridor', areaCode: 'SWH-WB-005', category: 'common', frequencyMinutes: 120, staffId: 'staff-sw1', sortOrder: 5, status: 'todo', lastCleanedOffsetMin: -140, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-sw-6', branchId: BRANCH_SW, areaName: 'Pharmacy · Dispensary', areaCode: 'SWH-PH-006', category: 'office', frequencyMinutes: null, staffId: null, sortOrder: 6, status: 'todo', dueOffsetMin: -20, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-sw-7', branchId: BRANCH_SW, areaName: 'Canteen · Kitchen', areaCode: 'SWH-KT-007', category: 'kitchen', frequencyMinutes: 240, staffId: null, sortOrder: 7, status: 'todo', dueOffsetMin: 60, tasks: tasksFrom(GENERIC_TASKS, () => false) },

    // ————— Northwest Hospital (GAU-NWH) —————
    { id: 'a-nw-1', branchId: BRANCH_NW, areaName: 'Casualty · Triage', areaCode: 'NWH-CS-001', category: 'common', frequencyMinutes: 90, staffId: 'staff-nw1', sortOrder: 1, status: 'done', submittedOffsetMin: -120, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-nw-2', branchId: BRANCH_NW, areaName: 'Maternity · Ward', areaCode: 'NWH-MW-002', category: 'common', frequencyMinutes: 120, staffId: 'staff-nw1', sortOrder: 2, status: 'done', submittedOffsetMin: -70, tasks: tasksFrom(GENERIC_TASKS, () => true) },
    { id: 'a-nw-3', branchId: BRANCH_NW, areaName: 'Radiology · Restroom', areaCode: 'NWH-3M-003', category: 'bathroom', frequencyMinutes: 90, staffId: 'staff-nw1', sortOrder: 3, status: 'todo', lastCleanedOffsetMin: -100, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-nw-4', branchId: BRANCH_NW, areaName: 'Admin Block · Offices', areaCode: 'NWH-AB-004', category: 'office', frequencyMinutes: null, staffId: 'staff-nw1', sortOrder: 4, status: 'todo', dueOffsetMin: 40, tasks: tasksFrom(GENERIC_TASKS, () => false) },
    { id: 'a-nw-5', branchId: BRANCH_NW, areaName: 'Parking · Entrance', areaCode: 'NWH-PK-005', category: 'outdoor', frequencyMinutes: null, staffId: null, sortOrder: 5, status: 'todo', dueOffsetMin: 90, tasks: tasksFrom(GENERIC_TASKS, () => false) },
  ]

  const areas: Area[] = specs.map((s) => {
    const lastCleanedOffsetMin = resolveLastCleanedOffsetMin(s)
    return {
      id: `area-${s.id}`,
      siteId: site.id,
      branchId: s.branchId ?? BRANCH_NG,
      name: s.areaName,
      code: s.areaCode,
      category: s.category,
      frequencyMinutes: s.frequencyMinutes,
      taskTemplate: s.tasks.map((t) => t.label),
      lastCleanedAt: lastCleanedOffsetMin !== undefined ? minutesFromNow(lastCleanedOffsetMin) : null,
      active: true,
    }
  })

  const assignments: Assignment[] = specs.map((s) => {
    const dueOffsetMin = resolveDueOffsetMin(s)
    // Completed cleans carry an "after" proof photo; a couple also have a "before" — this is what
    // populates the Photo Proof gallery, per branch. Deterministic review status for realism.
    const photos: ProofPhoto[] = []
    if (s.withBeforePhoto) {
      photos.push({ id: `${s.id}-before`, label: 'before', dataUrl: placeholderPhoto(`${s.id}-b`), reviewStatus: 'approved', reviewNote: null, reviewedByName: 'Sara Cole' })
    }
    if (s.status === 'done') {
      const approved = s.sortOrder % 3 === 0
      // Every completed clean carries the full before/after pair — proof of a clean is the
      // change between the two shots, so an "after only" record is incomplete evidence.
      if (!s.withBeforePhoto) {
        photos.push({
          id: `${s.id}-before`, label: 'before', dataUrl: placeholderPhoto(`${s.id}-b`),
          reviewStatus: approved ? 'approved' : 'pending', reviewNote: null, reviewedByName: approved ? 'Sara Cole' : null,
        })
      }
      photos.push({
        id: `${s.id}-after`, label: 'after', dataUrl: placeholderPhoto(`${s.id}-a`),
        reviewStatus: approved ? 'approved' : 'pending', reviewNote: null, reviewedByName: approved ? 'Sara Cole' : null,
      })
    }
    return {
      id: s.id,
      siteId: site.id,
      branchId: s.branchId ?? BRANCH_NG,
      areaId: `area-${s.id}`,
      areaName: s.areaName,
      areaCode: s.areaCode,
      staffId: s.staffId,
      status: s.status,
      dueAt: dueOffsetMin !== undefined ? minutesFromNow(dueOffsetMin) : null,
      startedAt: s.startedOffsetMin !== undefined ? minutesFromNow(s.startedOffsetMin) : null,
      submittedAt: s.submittedOffsetMin !== undefined ? minutesFromNow(s.submittedOffsetMin) : null,
      sortOrder: s.sortOrder,
      tasks: s.tasks,
      photos,
      note: null,
      priority: 'medium',
      taskType: 'cleaning',
      templateId: null,
      templateName: null,
      createdByName: null,
      requirePhoto: false,
    }
  })

  const issues: Issue[] = [
    {
      id: 'issue-1',
      siteId: site.id,
      branchId: BRANCH_NG,
      areaId: 'area-a-dk-8',
      areaName: 'L2 · Server Room',
      areaCode: 'CPG-2S-031',
      assignmentId: 'a-dk-8',
      staffId: 'staff-dk',
      staffName: 'Dana Kim',
      description: 'Door is locked and I don\'t have a key — can\'t get in to clean.',
      severity: 'medium',
      status: 'open',
      createdAt: minutesFromNow(-18),
      resolvedAt: null,
    },
    {
      id: 'issue-sw-1',
      siteId: site.id,
      branchId: BRANCH_SW,
      areaId: 'area-a-sw-6',
      areaName: 'Pharmacy · Dispensary',
      areaCode: 'SWH-PH-006',
      assignmentId: 'a-sw-6',
      staffId: 'staff-sw2',
      staffName: 'Sipho Khumalo',
      description: 'Biohazard spill near the dispensary counter — needs specialist cleanup.',
      severity: 'high',
      status: 'open',
      createdAt: minutesFromNow(-35),
      resolvedAt: null,
    },
  ]

  const auditLog: AuditLogEntry[] = [
    {
      id: 'audit-seed-1',
      siteId: site.id,
      actorId: 'admin-sc',
      actorName: 'Sara Cole',
      action: 'routes_published',
      targetLabel: site.name,
      detail: null,
      createdAt: minutesFromNow(-190),
    },
    {
      id: 'audit-seed-2',
      siteId: site.id,
      actorId: 'admin-sc',
      actorName: 'Sara Cole',
      action: 'user_added',
      targetLabel: 'Priya Nair',
      detail: 'PN-5502',
      createdAt: minutesFromNow(-1200),
    },
  ]

  const reportTemplates: ReportTemplate[] = []
  const importBatches: ImportBatch[] = []

  const taskTemplates: TaskTemplate[] = [
    {
      id: 'template-restroom-deep-clean',
      siteId: site.id,
      name: 'Restroom Deep Clean',
      taskType: 'cleaning',
      checklistItems: ['Clean basins', 'Clean mirrors', 'Mop floor', 'Sanitize handles', 'Refill soap', 'Upload photo'],
      defaultPriority: 'medium',
      requirePhoto: true,
      status: 'active',
      createdAt: minutesFromNow(-14400),
    },
    {
      id: 'template-safety-inspection',
      siteId: site.id,
      name: 'Monthly Safety Inspection',
      taskType: 'inspection',
      checklistItems: ['Check fire extinguisher', 'Check emergency exits', 'Check lighting', 'Note any hazards'],
      defaultPriority: 'high',
      requirePhoto: false,
      status: 'active',
      createdAt: minutesFromNow(-10080),
    },
  ]

  return { site, branches, staff, admins, areas, assignments, staffPins, issues, auditLog, reportTemplates, importBatches, taskTemplates }
}

/** Demo credentials, surfaced in the sign-in screens' helper text. */
export const DEMO_STAFF_PIN = '1234'
export const DEMO_ADMIN_PASSWORD = 'demo1234'
