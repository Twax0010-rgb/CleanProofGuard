import { allowedBranchIds, canAccessBranch, canManageAreas, canManageBenchmarks, canManageBranches, canManageCategories, canManageRoutes, canManageTemplates, canManageUsers, canView, colorForName, formatFrequency, generateAreaCode, generateStaffCode, initialsFrom } from '../domain'
import type {
  AdminRole,
  AdminUser,
  Area,
  Assignment,
  AuditAction,
  AuditLogEntry,
  Branch,
  BranchStatus,
  Benchmark,
  ChecklistTask,
  CleaningSchedule,
  ImportBatch,
  Issue,
  IssueSeverity,
  LocationCategory,
  PhotoReviewStatus,
  ProofPhotoView,
  ReportTemplate,
  Site,
  Staff,
  TaskTemplate,
} from '../types'
import { DEMO_ADMIN_PASSWORD, SITE_ID, buildSeed } from './seed'
import type { CreateAdminInput, CreateBenchmarkInput, CreateBranchInput, CreateScheduleInput, CreateStaffInput, CreateTaskInput, DataRepo, ProofPhotoFilter, SaveReportTemplateInput, SaveTaskTemplateInput, UpdateAdminAccessInput, UpdateAdminInput, UpdateBenchmarkInput, UpdateBranchInput, UpdateStaffInput } from './types'

const STORAGE_KEY = 'cpg_mock_state_v19'
const MAX_STATE_AGE_MS = 12 * 60 * 60 * 1000 // reseed if the demo has gone stale (e.g. next day)

interface PersistedState {
  seededAt: number
  site: Site
  branches: Branch[]
  staff: Staff[]
  admins: AdminUser[]
  areas: Area[]
  categories: LocationCategory[]
  benchmarks: Benchmark[]
  schedules: CleaningSchedule[]
  assignments: Assignment[]
  /** Demo-only plaintext PIN store, keyed by staff id — Supabase mode always hashes via pgcrypto instead. */
  staffPins: Record<string, string>
  issues: Issue[]
  auditLog: AuditLogEntry[]
  reportTemplates: ReportTemplate[]
  importBatches: ImportBatch[]
  taskTemplates: TaskTemplate[]
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (Date.now() - parsed.seededAt < MAX_STATE_AGE_MS) return parsed
    }
  } catch {
    // fall through to reseed
  }
  const seed = buildSeed()
  const fresh: PersistedState = { seededAt: Date.now(), ...seed }
  saveState(fresh)
  return fresh
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors — the in-memory copy still works for this session
  }
}

const events = new EventTarget()
function notify() {
  events.dispatchEvent(new Event('change'))
}

let state = loadState()

function persist() {
  saveState(state)
  notify()
}

// The repo, not the UI, is the enforcement point: it tracks who's actually
// authenticated (set by AdminAuthContext on sign-in/restore/sign-out) and
// checks that identity's role directly, so a mutating call is rejected even
// if some future screen forgot to hide the button for it.
let actingAdminId: string | null = null

function requireRole(check: (role: AdminRole) => boolean, action: string) {
  const admin = actingAdminId ? state.admins.find((a) => a.id === actingAdminId) : undefined
  if (!admin || !check(admin.role)) {
    throw new Error(`You don't have permission to ${action}.`)
  }
}

function actingAdmin(): AdminUser | undefined {
  return actingAdminId ? state.admins.find((a) => a.id === actingAdminId) : undefined
}

function requireAdmin(check: (admin: AdminUser) => boolean, action: string): AdminUser {
  const admin = actingAdmin()
  if (!admin || !check(admin)) throw new Error(`You don't have permission to ${action}.`)
  return admin
}

/**
 * The branch ids the acting admin may see. Returns null when no admin is acting (the staff app
 * reads through the same repo but is scoped by staffId, not branch). This is the backend
 * enforcement point the spec insists on — list methods below filter through it, so an admin can
 * never receive records from a branch they aren't allowed to access, whatever the UI requests.
 */
function allowedBranchSet(): Set<string> | null {
  const admin = actingAdmin()
  if (!admin) return null
  return new Set(allowedBranchIds(admin, state.branches))
}

function scopeToBranch<T extends { branchId: string }>(items: T[]): T[] {
  const allowed = allowedBranchSet()
  if (!allowed) return items
  return items.filter((i) => allowed.has(i.branchId))
}

// Collision-proof id generator. A plain incrementing counter reset to its initial value
// on every page load, while the persisted localStorage state kept records minted in earlier
// sessions — so a fresh action would reissue an id (e.g. `audit-1`) that already existed,
// duplicating React keys and letting map-by-id updates hit two records at once. Seeding with
// Date.now() guarantees a later session always starts past any prior one.
let uidCounter = 0
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`
}

/** Appends an accountability record for a privileged action — logged after the mutation already succeeded, so this never itself gates access. */
function logAction(siteId: string, action: AuditAction, targetLabel: string, detail: string | null = null) {
  const admin = actingAdminId ? state.admins.find((a) => a.id === actingAdminId) : undefined
  state.auditLog = [
    ...state.auditLog,
    {
      id: uid('audit'),
      siteId,
      actorId: admin?.id ?? null,
      actorName: admin?.name ?? 'Unknown admin',
      action,
      targetLabel,
      detail,
      createdAt: new Date().toISOString(),
    },
  ]
}

function findAssignment(id: string): Assignment {
  const a = state.assignments.find((x) => x.id === id)
  if (!a) throw new Error(`Assignment not found: ${id}`)
  return a
}

/**
 * Replaces an assignment/area/staff record with a new object rather than
 * mutating in place. React state consumers compare by reference (Object.is)
 * — mutating the existing object and handing back the same reference makes
 * setState() a no-op, so screens silently stop re-rendering after the first
 * update.
 */
function updateAssignment(id: string, updater: (a: Assignment) => Assignment): Assignment {
  let updated: Assignment | undefined
  state.assignments = state.assignments.map((a) => {
    if (a.id !== id) return a
    updated = updater(a)
    return updated
  })
  if (!updated) throw new Error(`Assignment not found: ${id}`)
  return updated
}

function updateAreaRecord(id: string, updater: (a: Area) => Area): Area {
  let updated: Area | undefined
  state.areas = state.areas.map((a) => {
    if (a.id !== id) return a
    updated = updater(a)
    return updated
  })
  if (!updated) throw new Error(`Area not found: ${id}`)
  return updated
}

function updateStaffRecord(id: string, updater: (s: Staff) => Staff): Staff {
  let updated: Staff | undefined
  state.staff = state.staff.map((s) => {
    if (s.id !== id) return s
    updated = updater(s)
    return updated
  })
  if (!updated) throw new Error(`Staff not found: ${id}`)
  return updated
}

function updateIssue(id: string, updater: (i: Issue) => Issue): Issue {
  let updated: Issue | undefined
  state.issues = state.issues.map((i) => {
    if (i.id !== id) return i
    updated = updater(i)
    return updated
  })
  if (!updated) throw new Error(`Issue not found: ${id}`)
  return updated
}

function updateBranchRecord(id: string, updater: (b: Branch) => Branch): Branch {
  let updated: Branch | undefined
  state.branches = state.branches.map((b) => {
    if (b.id !== id) return b
    updated = updater(b)
    return updated
  })
  if (!updated) throw new Error(`Branch not found: ${id}`)
  return updated
}

function generateBranchCode(provinceState: string, name: string): string {
  const prov = provinceState.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'BR'
  const initials = name.split(/\s+/).map((w) => w[0]).join('').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'X'
  return `${prov}-${initials}`
}

/** Flatten one assignment's photos into gallery view models, joined to its branch/area/staff context. */
function photoViewsForAssignment(a: Assignment): ProofPhotoView[] {
  const branch = state.branches.find((b) => b.id === a.branchId)
  const staff = a.staffId ? state.staff.find((s) => s.id === a.staffId) : null
  const hasOpenIssue = state.issues.some((i) => i.assignmentId === a.id && i.status === 'open')
  const capturedFallback = a.submittedAt ?? a.startedAt ?? a.dueAt ?? new Date().toISOString()
  return a.photos.map((p) => ({
    id: p.id,
    assignmentId: a.id,
    siteId: a.siteId,
    branchId: a.branchId,
    branchName: branch?.name ?? '—',
    branchCode: branch?.code ?? '—',
    areaId: a.areaId,
    areaName: a.areaName,
    areaCode: a.areaCode,
    staffId: a.staffId,
    staffName: staff?.fullName ?? null,
    taskType: a.taskType,
    label: p.label,
    dataUrl: p.dataUrl,
    capturedAt: capturedFallback,
    assignmentStatus: a.status,
    hasOpenIssue,
    staffNote: a.note,
    reviewStatus: p.reviewStatus ?? 'pending',
    reviewNote: p.reviewNote ?? null,
    reviewedByName: p.reviewedByName ?? null,
  }))
}

function buildAssignmentFor(
  area: Area,
  staffId: string | null,
  sortOrder: number,
  dueAt: string | null,
  overrides: Partial<Pick<Assignment, 'priority' | 'taskType' | 'templateId' | 'templateName' | 'createdByName' | 'tasks' | 'requirePhoto' | 'scheduleId' | 'occurrenceNumber' | 'occurrenceTotal'>> = {},
): Assignment {
  return {
    id: uid(`${area.id}-cycle`),
    siteId: area.siteId,
    branchId: area.branchId,
    areaId: area.id,
    areaName: area.name,
    areaCode: area.code,
    staffId,
    status: 'todo',
    dueAt,
    startedAt: null,
    submittedAt: null,
    sortOrder,
    tasks:
      overrides.tasks ??
      area.taskTemplate.map((label, i) => ({
        id: `${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label,
        completed: false,
        sortOrder: i,
      })),
    photos: [],
    note: null,
    priority: overrides.priority ?? 'medium',
    taskType: overrides.taskType ?? 'cleaning',
    templateId: overrides.templateId ?? null,
    templateName: overrides.templateName ?? null,
    createdByName: overrides.createdByName ?? null,
    requirePhoto: overrides.requirePhoto ?? false,
    scheduleId: overrides.scheduleId ?? null,
    occurrenceNumber: overrides.occurrenceNumber ?? null,
    occurrenceTotal: overrides.occurrenceTotal ?? null,
  }
}

function checklistFromLabels(labels: string[]): ChecklistTask[] {
  return labels.map((label, i) => ({
    id: `${label}-${i}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    completed: false,
    sortOrder: i,
  }))
}

/** Generates the next cleaning cycle's assignment for a recurring area, fresh tasks and all.
 * Appended at the end of the route (not the completed cycle's slot) — otherwise the area
 * just cleaned would immediately become "next up" ahead of overdue/sooner-due work. */
function spawnNextCycle(area: Area, staffId: string | null) {
  if (!area.frequencyMinutes || !area.active) return
  const dueAt = new Date(Date.now() + area.frequencyMinutes * 60_000).toISOString()
  const maxSortOrder = Math.max(0, ...state.assignments.filter((a) => a.siteId === area.siteId).map((a) => a.sortOrder))
  state.assignments = [...state.assignments, buildAssignmentFor(area, staffId, maxSortOrder + 1, dueAt)]
}

/** Deactivating an area pulls its not-yet-done work off the board; reactivating opens a fresh unassigned one. Shared by direct edits and bulk imports. */
function syncAssignmentsForActiveChange(before: Area, after: Area) {
  if (!after.active && before.active) {
    state.assignments = state.assignments.filter((a) => !(a.areaId === after.id && a.status !== 'done'))
  } else if (after.active && !before.active) {
    const maxSortOrder = Math.max(0, ...state.assignments.filter((a) => a.siteId === after.siteId).map((a) => a.sortOrder))
    const dueAt = after.frequencyMinutes ? new Date(Date.now() + after.frequencyMinutes * 60_000).toISOString() : null
    state.assignments = [...state.assignments, buildAssignmentFor(after, null, maxSortOrder + 1, dueAt)]
  }
}

async function delay<T>(value: T, ms = 120): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms))
  return value
}

export const mockRepo: DataRepo = {
  mode: 'mock',

  async authenticateStaff(staffCode, pin) {
    const staff = state.staff.find(
      (s) => s.staffCode.toLowerCase() === staffCode.trim().toLowerCase(),
    )
    if (!staff) return delay(null)
    if (staff.accountStatus !== 'active') return delay(null)
    if (state.staffPins[staff.id] !== pin) return delay(null)
    const updated = updateStaffRecord(staff.id, (s) => ({
      ...s,
      lastLoginAt: new Date().toISOString(),
    }))
    persist()
    return delay(updated)
  },

  async authenticateAdmin(email, password) {
    const admin = state.admins.find((a) => a.email.toLowerCase() === email.trim().toLowerCase())
    if (!admin || password !== DEMO_ADMIN_PASSWORD) return delay(null)
    // Disabled/archived admins keep their history but can't sign in.
    if (admin.accountStatus !== 'active') return delay(null)
    return delay(admin)
  },

  setActingAdmin(adminId) {
    actingAdminId = adminId
  },

  async getStaff(id) {
    return delay(state.staff.find((s) => s.id === id) ?? null)
  },

  async getAdmin(id) {
    return delay(state.admins.find((a) => a.id === id) ?? null)
  },

  async getSite(id) {
    return delay(state.site.id === id ? state.site : null)
  },

  async listStaffForSite(siteId) {
    return delay(scopeToBranch(state.staff.filter((s) => s.siteId === siteId)))
  },

  async setStaffStatus(staffId, status) {
    requireRole(canManageRoutes, 'change a staff member\'s shift status')
    const updated = updateStaffRecord(staffId, (s) => ({ ...s, status }))
    persist()
    return delay(updated)
  },

  async createStaff(siteId, input: CreateStaffInput) {
    requireRole(canManageUsers, 'add a user')
    const staffCode = input.staffCode?.trim() || generateStaffCode(input.fullName)
    const codeClash = state.staff.some(
      (s) => s.staffCode.toLowerCase() === staffCode.toLowerCase(),
    )
    if (codeClash) throw new Error(`Staff ID "${staffCode}" is already in use.`)
    if (input.email) {
      const emailClash = state.staff.some(
        (s) => s.email && s.email.toLowerCase() === input.email!.toLowerCase(),
      )
      if (emailClash) throw new Error(`Email "${input.email}" is already in use.`)
    }
    const staff: Staff = {
      id: uid('staff-new'),
      siteId,
      branchId: input.branchId,
      staffCode,
      fullName: input.fullName,
      initials: initialsFrom(input.fullName),
      colorHex: colorForName(input.fullName),
      role: input.role,
      status: 'off_shift',
      accountStatus: 'active',
      email: input.email,
      phone: input.phone,
      shiftStart: null,
      shiftEnd: null,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    }
    state.staff = [...state.staff, staff]
    state.staffPins = { ...state.staffPins, [staff.id]: input.pin }
    logAction(siteId, 'user_added', staff.fullName, staff.staffCode)
    persist()
    return delay(staff)
  },

  async updateStaff(staffId, patch: UpdateStaffInput) {
    requireRole(canManageUsers, 'edit a user')
    if (patch.email) {
      const emailClash = state.staff.some(
        (s) => s.id !== staffId && s.email && s.email.toLowerCase() === patch.email!.toLowerCase(),
      )
      if (emailClash) throw new Error(`Email "${patch.email}" is already in use.`)
    }
    if (patch.staffCode) {
      const codeClash = state.staff.some(
        (s) => s.id !== staffId && s.staffCode.toLowerCase() === patch.staffCode!.toLowerCase(),
      )
      if (codeClash) throw new Error(`Staff ID "${patch.staffCode}" is already in use.`)
    }
    const before = state.staff.find((s) => s.id === staffId)
    const updated = updateStaffRecord(staffId, (s) => ({ ...s, ...patch }))
    // Disabling/archiving/deleting someone shouldn't strand their unfinished work
    // on a hidden column — send it back to Unassigned. Completed work keeps its
    // staffId so their name still shows correctly in reports/history.
    if (patch.accountStatus && patch.accountStatus !== 'active') {
      state.assignments = state.assignments.map((a) =>
        a.staffId === staffId && a.status !== 'done' ? { ...a, staffId: null } : a,
      )
    }
    if (patch.accountStatus === 'deleted' && before?.accountStatus !== 'deleted') {
      logAction(updated.siteId, 'user_deleted', updated.fullName)
    } else if (patch.accountStatus === 'archived' && before?.accountStatus !== 'archived') {
      logAction(updated.siteId, 'user_archived', updated.fullName)
    } else if (
      patch.accountStatus === 'active' &&
      (before?.accountStatus === 'archived' || before?.accountStatus === 'deleted')
    ) {
      logAction(updated.siteId, 'user_restored', updated.fullName)
    } else {
      logAction(updated.siteId, 'user_updated', updated.fullName)
    }
    persist()
    return delay(updated)
  },

  async resetStaffPin(staffId, newPin) {
    requireRole(canManageUsers, 'reset a PIN')
    const staffMember = state.staff.find((s) => s.id === staffId)
    state.staffPins = { ...state.staffPins, [staffId]: newPin }
    if (staffMember) logAction(staffMember.siteId, 'pin_reset', staffMember.fullName)
    persist()
    return delay(undefined)
  },

  async getMyAssignments(staffId) {
    return delay(
      state.assignments
        .filter((a) => a.staffId === staffId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
  },

  async getAssignment(id) {
    return delay(state.assignments.find((a) => a.id === id) ?? null)
  },

  async startAssignment(id) {
    const current = findAssignment(id)
    if (current.status !== 'todo') return delay(current)
    const updated = updateAssignment(id, (a) => ({
      ...a,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    }))
    persist()
    return delay(updated)
  },

  async toggleTask(assignmentId, taskId) {
    const updated = updateAssignment(assignmentId, (a) => ({
      ...a,
      tasks: a.tasks.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
    }))
    persist()
    return delay(updated)
  },

  async addPhoto(assignmentId, label, dataUrl) {
    const updated = updateAssignment(assignmentId, (a) => ({
      ...a,
      photos: [
        ...a.photos.filter((p) => p.label !== label),
        { id: `${assignmentId}-${label}-${Date.now()}`, label, dataUrl },
      ],
    }))
    persist()
    return delay(updated)
  },

  async setNote(assignmentId, note) {
    const updated = updateAssignment(assignmentId, (a) => ({ ...a, note }))
    persist()
    return delay(updated)
  },

  async submitProof(assignmentId) {
    const before = findAssignment(assignmentId)
    const beforeArea = state.areas.find((ar) => ar.id === before.areaId)
    if (beforeArea && !beforeArea.active) {
      throw new Error('This area has been deactivated and can no longer be cleaned.')
    }
    const now = new Date().toISOString()
    const updated = updateAssignment(assignmentId, (a) => ({
      ...a,
      status: 'done',
      submittedAt: now,
    }))
    const area = state.areas.find((ar) => ar.id === updated.areaId)
    if (area) {
      updateAreaRecord(area.id, (ar) => ({ ...ar, lastCleanedAt: now }))
      spawnNextCycle(area, updated.staffId)
    }
    persist()
    return delay(updated)
  },

  async getSiteAssignments(siteId) {
    return delay(
      scopeToBranch(state.assignments.filter((a) => a.siteId === siteId))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
  },

  async assignStaffToArea(assignmentId, staffId) {
    requireRole(canManageRoutes, 'reassign work')
    const updated = updateAssignment(assignmentId, (a) => ({ ...a, staffId }))
    const staffName = staffId ? (state.staff.find((s) => s.id === staffId)?.fullName ?? 'someone') : 'Unassigned'
    logAction(updated.siteId, 'route_reassigned', updated.areaName, `→ ${staffName}`)
    persist()
    return delay(updated)
  },

  async listOpenAssignments(branchId) {
    return delay(
      state.assignments
        .filter((a) => a.branchId === branchId && !a.staffId && a.status !== 'done')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
  },

  async claimAssignment(assignmentId, staffId) {
    // Staff self-claim, not an admin action — no role gate, but strictly claim-once.
    const current = state.assignments.find((a) => a.id === assignmentId)
    if (!current || current.staffId || current.status === 'done') return delay(null)
    const updated = updateAssignment(assignmentId, (a) => ({ ...a, staffId }))
    persist()
    return delay(updated)
  },

  async scanArea(staff, code) {
    const wanted = code.trim().toUpperCase()
    const area = state.areas.find((a) => a.siteId === staff.siteId && a.code.toUpperCase() === wanted)
    if (!area) return delay({ ok: false, reason: 'unknown_code' } as const)
    if (!area.active) return delay({ ok: false, reason: 'inactive_area' } as const)
    if (area.branchId !== staff.branchId) return delay({ ok: false, reason: 'other_branch' } as const)

    const open = state.assignments.filter((a) => a.areaId === area.id && a.status !== 'done')
    const mine = open.find((a) => a.staffId === staff.id)
    if (mine) return delay({ ok: true, assignment: mine, created: false } as const)

    const unclaimed = open.find((a) => !a.staffId)
    if (unclaimed) {
      const claimed = updateAssignment(unclaimed.id, (a) => ({ ...a, staffId: staff.id }))
      persist()
      return delay({ ok: true, assignment: claimed, created: false } as const)
    }

    // No audit entry: the staff app runs on the anon key, which can't write the trail in Supabase
    // mode (and shouldn't be able to). createdByName is the provenance record — it's on the board
    // and in the assignment report's "Created by" column, and both repos behave the same way.
    const maxSort = Math.max(0, ...state.assignments.filter((a) => a.siteId === staff.siteId).map((a) => a.sortOrder))
    const created = buildAssignmentFor(area, staff.id, maxSort + 1, null, { createdByName: staff.fullName })
    state.assignments = [...state.assignments, created]
    persist()
    return delay({ ok: true, assignment: created, created: true } as const)
  },

  async publishRoutes(siteId) {
    requireRole(canManageRoutes, 'publish routes')
    logAction(siteId, 'routes_published', state.site.name)
    persist()
    return delay(undefined)
  },

  async listAreasForSite(siteId) {
    return delay(scopeToBranch(state.areas.filter((a) => a.siteId === siteId)))
  },

  async getArea(id) {
    return delay(state.areas.find((a) => a.id === id) ?? null)
  },

  async getAreaByCode(siteId, code) {
    return delay(
      state.areas.find(
        (a) => a.siteId === siteId && a.code.toLowerCase() === code.trim().toLowerCase(),
      ) ?? null,
    )
  },

  async setAreaFrequency(areaId, frequencyMinutes) {
    requireRole(canManageAreas, 'change an area\'s cleaning frequency')
    const updated = updateAreaRecord(areaId, (a) => ({ ...a, frequencyMinutes }))
    logAction(updated.siteId, 'area_frequency_changed', updated.name, formatFrequency(frequencyMinutes))
    persist()
    return delay(updated)
  },

  async createArea(siteId, input) {
    requireRole(canManageAreas, 'add an area')
    const code = input.code?.trim() || generateAreaCode(input.name)
    const codeClash = state.areas.some((a) => a.code.toLowerCase() === code.toLowerCase())
    if (codeClash) throw new Error(`Area code "${code}" is already in use.`)
    const area: Area = {
      id: uid('area-new'),
      siteId,
      branchId: input.branchId,
      name: input.name,
      code,
      category: input.category,
      categoryId: input.categoryId ?? state.categories.find((c) => c.slug === input.category)?.id ?? null,
      frequencyMinutes: input.frequencyMinutes,
      taskTemplate: input.taskTemplate,
      lastCleanedAt: null,
      active: true,
    }
    state.areas = [...state.areas, area]
    const maxSortOrder = Math.max(0, ...state.assignments.filter((a) => a.siteId === siteId).map((a) => a.sortOrder))
    const dueAt = area.frequencyMinutes ? new Date(Date.now() + area.frequencyMinutes * 60_000).toISOString() : null
    state.assignments = [...state.assignments, buildAssignmentFor(area, null, maxSortOrder + 1, dueAt)]
    logAction(siteId, 'area_created', area.name, area.code)
    persist()
    return delay(area)
  },

  async updateArea(areaId, patch) {
    requireRole(canManageAreas, 'edit an area')
    const before = state.areas.find((a) => a.id === areaId)
    if (!before) throw new Error(`Area not found: ${areaId}`)
    const updated = updateAreaRecord(areaId, (a) => ({ ...a, ...patch }))
    syncAssignmentsForActiveChange(before, updated)
    if (patch.categoryId !== undefined && patch.categoryId !== before.categoryId) {
      const catName = state.categories.find((c) => c.id === updated.categoryId)?.name ?? updated.category
      logAction(updated.siteId, 'area_category_changed', updated.name, catName)
    } else {
      const statusNote = patch.active === false ? 'deactivated' : patch.active === true ? 'reactivated' : null
      logAction(updated.siteId, 'area_updated', updated.name, statusNote)
    }
    persist()
    return delay(updated)
  },

  async deleteArea(areaId) {
    requireRole(canManageAreas, 'delete an area')
    const area = state.areas.find((a) => a.id === areaId)
    if (!area) throw new Error(`Area not found: ${areaId}`)
    // Completed proof, photos, and issue reports are compliance history — never silently
    // destroyed. Areas that have any must be deactivated instead of deleted.
    const hasProof = state.assignments.some((a) => a.areaId === areaId && (a.status === 'done' || a.photos.length > 0))
    const hasIssues = state.issues.some((i) => i.areaId === areaId)
    if (hasProof || hasIssues) {
      throw new Error(`"${area.name}" has cleaning history (proof, photos, or issues) — deactivate it instead of deleting.`)
    }
    state.assignments = state.assignments.filter((a) => a.areaId !== areaId)
    state.areas = state.areas.filter((a) => a.id !== areaId)
    logAction(area.siteId, 'area_deleted', area.name, area.code)
    persist()
    return delay(undefined)
  },

  // ————— Location categories —————

  async listCategories(siteId) {
    return delay(state.categories.filter((c) => c.siteId === siteId).sort((a, b) => a.sortOrder - b.sortOrder))
  },

  async createCategory(siteId, input) {
    const actor = requireAdmin((a) => canManageCategories(a), 'create categories')
    const name = input.name.trim()
    if (!name) throw new Error('A category name is required.')
    const isGlobal = input.isGlobal
    const branchId = isGlobal ? null : input.branchId ?? null
    const clash = state.categories.some(
      (c) => c.siteId === siteId && c.isGlobal === isGlobal && c.branchId === branchId && c.name.toLowerCase() === name.toLowerCase(),
    )
    if (clash) throw new Error(`A category named "${name}" already exists${isGlobal ? '' : ' in this branch'}.`)
    const maxSort = Math.max(0, ...state.categories.filter((c) => c.siteId === siteId).map((c) => c.sortOrder))
    const category: LocationCategory = {
      id: uid('cat-new'),
      siteId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      branchId,
      isGlobal,
      isActive: true,
      sortOrder: maxSort + 10,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    }
    state.categories = [...state.categories, category]
    logAction(siteId, 'category_created', category.name, actor.name)
    persist()
    return delay(category)
  },

  async updateCategory(categoryId, patch) {
    requireAdmin((a) => canManageCategories(a), 'edit categories')
    const before = state.categories.find((c) => c.id === categoryId)
    if (!before) throw new Error('Category not found')
    if (patch.name) {
      const name = patch.name.trim()
      const clash = state.categories.some(
        (c) => c.id !== categoryId && c.siteId === before.siteId && c.isGlobal === before.isGlobal && c.branchId === before.branchId && c.name.toLowerCase() === name.toLowerCase(),
      )
      if (clash) throw new Error(`A category named "${name}" already exists.`)
    }
    const updated: LocationCategory = {
      ...before,
      name: patch.name?.trim() || before.name,
      slug: patch.name ? patch.name.trim().toLowerCase().replace(/\s+/g, '-') : before.slug,
      description: patch.description !== undefined ? patch.description?.trim() || null : before.description,
      icon: patch.icon !== undefined ? patch.icon?.trim() || null : before.icon,
      color: patch.color !== undefined ? patch.color?.trim() || null : before.color,
      sortOrder: patch.sortOrder ?? before.sortOrder,
    }
    state.categories = state.categories.map((c) => (c.id === categoryId ? updated : c))
    logAction(before.siteId, 'category_updated', updated.name)
    persist()
    return delay(updated)
  },

  async setCategoryActive(categoryId, active) {
    requireAdmin((a) => canManageCategories(a), 'change categories')
    const before = state.categories.find((c) => c.id === categoryId)
    if (!before) throw new Error('Category not found')
    const updated: LocationCategory = { ...before, isActive: active, archivedAt: active ? null : new Date().toISOString() }
    state.categories = state.categories.map((c) => (c.id === categoryId ? updated : c))
    logAction(before.siteId, active ? 'category_restored' : 'category_archived', updated.name)
    persist()
    return delay(updated)
  },

  async deleteCategory(categoryId) {
    requireAdmin((a) => canManageCategories(a), 'delete categories')
    const cat = state.categories.find((c) => c.id === categoryId)
    if (!cat) throw new Error('Category not found')
    const uses = state.areas.filter((a) => a.categoryId === categoryId).length
    if (uses > 0) throw new Error(`This category is used by ${uses} location${uses === 1 ? '' : 's'}. Reassign those locations before deleting.`)
    state.categories = state.categories.filter((c) => c.id !== categoryId)
    logAction(cat.siteId, 'category_deleted', cat.name)
    persist()
    return delay(undefined)
  },

  async reassignCategory(fromCategoryId, toCategoryId) {
    requireAdmin((a) => canManageCategories(a), 'reassign categories')
    const from = state.categories.find((c) => c.id === fromCategoryId)
    const to = state.categories.find((c) => c.id === toCategoryId)
    if (!from || !to) throw new Error('Category not found')
    let count = 0
    state.areas = state.areas.map((a) => {
      if (a.categoryId !== fromCategoryId) return a
      count += 1
      return { ...a, categoryId: toCategoryId, category: to.slug }
    })
    logAction(from.siteId, 'category_reassigned', `${from.name} → ${to.name}`, `${count} location${count === 1 ? '' : 's'}`)
    persist()
    return delay(count)
  },

  // ————— Cleaning benchmarks —————

  async listBenchmarks(siteId) {
    return delay((state.benchmarks ?? []).filter((b) => b.siteId === siteId))
  },

  async createBenchmark(siteId, input: CreateBenchmarkInput) {
    requireAdmin((a) => canManageBenchmarks(a), 'manage benchmarks')
    const benchmark: Benchmark = {
      id: uid('bench-new'),
      siteId,
      name: input.name.trim(),
      branchId: input.isGlobal ? null : input.branchId ?? null,
      categoryId: input.categoryId,
      areaId: input.areaId ?? null,
      requiredCleansPerDay: Math.max(1, input.requiredCleansPerDay),
      intervalMinutes: input.intervalMinutes ?? null,
      photoRequired: input.photoRequired,
      isGlobal: input.isGlobal,
      isActive: true,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    }
    state.benchmarks = [...(state.benchmarks ?? []), benchmark]
    logAction(siteId, 'benchmark_created', benchmark.name, `${benchmark.requiredCleansPerDay}×/day`)
    persist()
    return delay(benchmark)
  },

  async updateBenchmark(benchmarkId, patch: UpdateBenchmarkInput) {
    requireAdmin((a) => canManageBenchmarks(a), 'edit benchmarks')
    const before = (state.benchmarks ?? []).find((b) => b.id === benchmarkId)
    if (!before) throw new Error('Benchmark not found')
    const updated: Benchmark = {
      ...before,
      name: patch.name?.trim() || before.name,
      requiredCleansPerDay: patch.requiredCleansPerDay ?? before.requiredCleansPerDay,
      intervalMinutes: patch.intervalMinutes !== undefined ? patch.intervalMinutes : before.intervalMinutes,
      photoRequired: patch.photoRequired ?? before.photoRequired,
      categoryId: patch.categoryId !== undefined ? patch.categoryId : before.categoryId,
    }
    state.benchmarks = state.benchmarks.map((b) => (b.id === benchmarkId ? updated : b))
    logAction(before.siteId, 'benchmark_updated', updated.name)
    persist()
    return delay(updated)
  },

  async setBenchmarkActive(benchmarkId, active) {
    requireAdmin((a) => canManageBenchmarks(a), 'change benchmarks')
    const before = (state.benchmarks ?? []).find((b) => b.id === benchmarkId)
    if (!before) throw new Error('Benchmark not found')
    const updated: Benchmark = { ...before, isActive: active, archivedAt: active ? null : new Date().toISOString() }
    state.benchmarks = state.benchmarks.map((b) => (b.id === benchmarkId ? updated : b))
    logAction(before.siteId, active ? 'benchmark_restored' : 'benchmark_archived', updated.name)
    persist()
    return delay(updated)
  },

  async deleteBenchmark(benchmarkId) {
    requireAdmin((a) => canManageBenchmarks(a), 'delete benchmarks')
    const b = (state.benchmarks ?? []).find((x) => x.id === benchmarkId)
    if (!b) throw new Error('Benchmark not found')
    state.benchmarks = state.benchmarks.filter((x) => x.id !== benchmarkId)
    logAction(b.siteId, 'benchmark_deleted', b.name)
    persist()
    return delay(undefined)
  },

  async logBenchmarkOverride(siteId, detail) {
    logAction(siteId, 'benchmark_overridden', detail)
    persist()
    return delay(undefined)
  },

  async reportIssue(assignmentId, staffId, description, severity: IssueSeverity) {
    const assignment = findAssignment(assignmentId)
    const staffMember = state.staff.find((s) => s.id === staffId) ?? null
    const issue: Issue = {
      id: uid('issue-new'),
      siteId: assignment.siteId,
      branchId: assignment.branchId,
      areaId: assignment.areaId,
      areaName: assignment.areaName,
      areaCode: assignment.areaCode,
      assignmentId,
      staffId,
      staffName: staffMember?.fullName ?? null,
      description,
      severity,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    }
    state.issues = [...state.issues, issue]
    persist()
    return delay(issue)
  },

  async listIssuesForSite(siteId) {
    return delay(scopeToBranch(state.issues.filter((i) => i.siteId === siteId)))
  },

  async resolveIssue(issueId) {
    requireRole(canManageRoutes, 'resolve an issue')
    const updated = updateIssue(issueId, (i) => ({ ...i, status: 'resolved', resolvedAt: new Date().toISOString() }))
    logAction(updated.siteId, 'issue_resolved', updated.areaName)
    persist()
    return delay(updated)
  },

  async listAuditLogForSite(siteId) {
    return delay(
      state.auditLog
        .filter((e) => e.siteId === siteId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    )
  },

  async logReportExport(siteId, reportLabel, detail) {
    logAction(siteId, 'report_exported', reportLabel, detail)
    persist()
    return delay(undefined)
  },

  async listReportTemplates(siteId, adminId) {
    return delay(
      state.reportTemplates.filter((t) => t.siteId === siteId && (t.shared || t.ownerAdminId === adminId)),
    )
  },

  async saveReportTemplate(siteId, adminId, input: SaveReportTemplateInput) {
    if (input.id) {
      const existing = state.reportTemplates.find((t) => t.id === input.id)
      if (!existing) throw new Error(`Report template not found: ${input.id}`)
      if (existing.ownerAdminId !== adminId) throw new Error("You can only edit your own report templates.")
      const updated: ReportTemplate = { ...existing, ...input, id: existing.id }
      state.reportTemplates = state.reportTemplates.map((t) => (t.id === updated.id ? updated : t))
      persist()
      return delay(updated)
    }
    const template: ReportTemplate = {
      id: uid('report-template'),
      siteId,
      ownerAdminId: adminId,
      name: input.name,
      reportType: input.reportType,
      fields: input.fields,
      sortBy: input.sortBy,
      groupBy: input.groupBy,
      shared: input.shared,
      createdAt: new Date().toISOString(),
    }
    state.reportTemplates = [...state.reportTemplates, template]
    persist()
    return delay(template)
  },

  async deleteReportTemplate(templateId) {
    const existing = state.reportTemplates.find((t) => t.id === templateId)
    if (!existing) return delay(undefined)
    if (existing.ownerAdminId !== actingAdminId) throw new Error("You can only delete your own report templates.")
    state.reportTemplates = state.reportTemplates.filter((t) => t.id !== templateId)
    persist()
    return delay(undefined)
  },

  async importAreas(siteId, fileName, rows, failedCount) {
    requireRole(canManageAreas, 'import locations')
    let successCount = 0
    for (const row of rows) {
      if (row.isUpdate) {
        const before = state.areas.find((a) => a.siteId === siteId && a.code.toLowerCase() === row.code.toLowerCase())
        if (!before) continue
        const updated = updateAreaRecord(before.id, (a) => ({
          ...a,
          name: row.name,
          category: row.category,
          categoryId: state.categories.find((c) => c.siteId === siteId && c.slug === row.category)?.id ?? a.categoryId,
          frequencyMinutes: row.frequencyMinutes,
          taskTemplate: row.taskTemplate,
          active: row.active,
        }))
        syncAssignmentsForActiveChange(before, updated)
      } else {
        const area: Area = {
          id: uid('area-import'),
          siteId,
          branchId: row.branchId,
          name: row.name,
          code: row.code,
          category: row.category,
          categoryId: state.categories.find((c) => c.siteId === siteId && c.slug === row.category)?.id ?? null,
          frequencyMinutes: row.frequencyMinutes,
          taskTemplate: row.taskTemplate,
          lastCleanedAt: null,
          active: row.active,
        }
        state.areas = [...state.areas, area]
        if (row.active) {
          const maxSortOrder = Math.max(0, ...state.assignments.filter((a) => a.siteId === siteId).map((a) => a.sortOrder))
          const dueAt = area.frequencyMinutes ? new Date(Date.now() + area.frequencyMinutes * 60_000).toISOString() : null
          state.assignments = [...state.assignments, buildAssignmentFor(area, null, maxSortOrder + 1, dueAt)]
        }
      }
      successCount++
    }
    const admin = actingAdminId ? state.admins.find((a) => a.id === actingAdminId) : undefined
    const batch: ImportBatch = {
      id: uid('import'),
      siteId,
      fileName,
      importedByName: admin?.name ?? 'Unknown admin',
      importedAt: new Date().toISOString(),
      successCount,
      failedCount,
      status: successCount === 0 ? 'failed' : failedCount > 0 ? 'partial' : 'success',
    }
    state.importBatches = [...state.importBatches, batch]
    logAction(siteId, 'locations_imported', fileName, `${successCount} imported, ${failedCount} failed`)
    persist()
    return delay(batch)
  },

  async listImportBatches(siteId) {
    return delay(
      state.importBatches
        .filter((b) => b.siteId === siteId)
        .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()),
    )
  },

  async listTaskTemplates(siteId) {
    return delay(state.taskTemplates.filter((t) => t.siteId === siteId))
  },

  async saveTaskTemplate(siteId, input: SaveTaskTemplateInput) {
    requireRole(canManageTemplates, 'manage task templates')
    if (input.id) {
      const existing = state.taskTemplates.find((t) => t.id === input.id)
      if (!existing) throw new Error(`Task template not found: ${input.id}`)
      const updated: TaskTemplate = { ...existing, ...input, id: existing.id }
      state.taskTemplates = state.taskTemplates.map((t) => (t.id === updated.id ? updated : t))
      logAction(siteId, 'task_template_updated', updated.name)
      persist()
      return delay(updated)
    }
    const template: TaskTemplate = {
      id: uid('task-template'),
      siteId,
      name: input.name,
      taskType: input.taskType,
      checklistItems: input.checklistItems,
      defaultPriority: input.defaultPriority,
      requirePhoto: input.requirePhoto,
      status: input.status,
      createdAt: new Date().toISOString(),
    }
    state.taskTemplates = [...state.taskTemplates, template]
    logAction(siteId, 'task_template_created', template.name)
    persist()
    return delay(template)
  },

  async createTask(siteId, input: CreateTaskInput, createdByName) {
    requireRole(canManageRoutes, 'create a task')
    const area = state.areas.find((a) => a.id === input.areaId)
    if (!area) throw new Error('Location not found')
    if (!area.active) throw new Error('This area has been deactivated and cannot receive new tasks.')
    const staffIds = input.staffIds.length > 0 ? input.staffIds : [null]
    const created: Assignment[] = []
    for (const staffId of staffIds) {
      const maxSortOrder = Math.max(0, ...state.assignments.filter((a) => a.siteId === siteId).map((a) => a.sortOrder))
      const assignment = buildAssignmentFor(area, staffId, maxSortOrder + 1, input.dueAt, {
        taskType: input.taskType,
        priority: input.priority,
        templateId: input.templateId,
        templateName: input.templateName,
        createdByName,
        tasks: checklistFromLabels(input.checklistItems),
        requirePhoto: input.requirePhoto,
      })
      state.assignments = [...state.assignments, assignment]
      created.push(assignment)
    }
    logAction(siteId, 'task_created', area.name, `${created.length} assignment${created.length === 1 ? '' : 's'} · ${createdByName}`)
    persist()
    return delay(created)
  },

  async createSchedule(siteId, input: CreateScheduleInput, createdByName) {
    requireAdmin((a) => a.role === 'superuser' || a.role === 'super_admin' || a.role === 'manager', 'create a schedule')
    const scheduleId = uid('schedule')
    const n = Math.max(1, input.requiredCleansPerDay)
    const today = new Date().toISOString().slice(0, 10)
    const schedule: CleaningSchedule = {
      id: scheduleId,
      siteId,
      name: input.name,
      branchId: input.branchId,
      categoryId: input.categoryId,
      assignedUserId: input.assignedUserId,
      recurrenceType: input.recurrenceType,
      frequencyType: input.frequencyType,
      requiredCleansPerDay: n,
      intervalMinutes: input.intervalMinutes,
      startTime: input.startTime,
      endTime: input.endTime,
      shift: input.shift,
      requirePhoto: input.requirePhoto,
      notes: input.notes,
      isActive: input.isActive,
      areaIds: input.areaIds,
      lastGeneratedDate: input.generateToday && input.isActive ? today : null,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    }
    state.schedules = [...(state.schedules ?? []), schedule]
    const created: Assignment[] = []
    if (input.generateToday && input.isActive) {
      const day = new Date()
      const [sh, sm] = input.startTime.split(':').map(Number)
      const [eh, em] = input.endTime.split(':').map(Number)
      const winStart = new Date(day); winStart.setHours(sh, sm, 0, 0)
      let winEnd = new Date(day); winEnd.setHours(eh, em, 0, 0)
      if (winEnd <= winStart) winEnd = new Date(winStart.getTime() + 8 * 3600_000)
      let maxSort = Math.max(0, ...state.assignments.filter((a) => a.siteId === siteId).map((a) => a.sortOrder))
      for (const areaId of input.areaIds) {
        const area = state.areas.find((a) => a.id === areaId && a.active)
        if (!area) continue
        const items = input.checklistItems.length > 0 ? input.checklistItems : area.taskTemplate
        for (let k = 1; k <= n; k++) {
          let due = new Date(winStart.getTime() + ((winEnd.getTime() - winStart.getTime()) * k) / n)
          for (const b of input.breaks) {
            const [bsh, bsm] = b.start.split(':').map(Number)
            const [beh, bem] = b.end.split(':').map(Number)
            const bs = new Date(day); bs.setHours(bsh, bsm, 0, 0)
            const be = new Date(day); be.setHours(beh, bem, 0, 0)
            if (due >= bs && due < be) due = be
          }
          maxSort += 1
          const a = buildAssignmentFor(area, input.assignedUserId, maxSort, due.toISOString(), {
            taskType: 'cleaning',
            templateId: input.templateId,
            templateName: input.templateName,
            createdByName,
            tasks: checklistFromLabels(items),
            requirePhoto: input.requirePhoto,
            scheduleId,
            occurrenceNumber: k,
            occurrenceTotal: n,
          })
          state.assignments = [...state.assignments, a]
          created.push(a)
        }
      }
    }
    logAction(siteId, 'schedule_created', input.name, `${created.length} occurrence${created.length === 1 ? '' : 's'} · ${createdByName}`)
    persist()
    return delay(created)
  },

  async listSchedules(siteId) {
    return delay((state.schedules ?? []).filter((s) => s.siteId === siteId))
  },

  async updateSchedule(scheduleId, patch) {
    requireAdmin((a) => a.role === 'superuser' || a.role === 'super_admin' || a.role === 'manager', 'edit a schedule')
    const before = (state.schedules ?? []).find((s) => s.id === scheduleId)
    if (!before) throw new Error('Schedule not found')
    const updated: CleaningSchedule = {
      ...before,
      name: patch.name?.trim() || before.name,
      assignedUserId: patch.assignedUserId !== undefined ? patch.assignedUserId : before.assignedUserId,
      requiredCleansPerDay: patch.requiredCleansPerDay ?? before.requiredCleansPerDay,
      frequencyType: patch.frequencyType ?? before.frequencyType,
      intervalMinutes: patch.intervalMinutes !== undefined ? patch.intervalMinutes : before.intervalMinutes,
      recurrenceType: patch.recurrenceType ?? before.recurrenceType,
      startTime: patch.startTime ?? before.startTime,
      endTime: patch.endTime ?? before.endTime,
      requirePhoto: patch.requirePhoto ?? before.requirePhoto,
      notes: patch.notes !== undefined ? patch.notes : before.notes,
      areaIds: patch.areaIds ?? before.areaIds,
    }
    state.schedules = state.schedules.map((s) => (s.id === scheduleId ? updated : s))
    logAction(before.siteId, 'schedule_updated', updated.name)
    persist()
    return delay(updated)
  },

  async setScheduleStatus(scheduleId, isActive, archived) {
    requireAdmin((a) => a.role === 'superuser' || a.role === 'super_admin' || a.role === 'manager', 'change a schedule')
    const before = (state.schedules ?? []).find((s) => s.id === scheduleId)
    if (!before) throw new Error('Schedule not found')
    const updated: CleaningSchedule = { ...before, isActive, archivedAt: archived ? new Date().toISOString() : null }
    state.schedules = state.schedules.map((s) => (s.id === scheduleId ? updated : s))
    logAction(before.siteId, archived ? 'schedule_archived' : !isActive ? 'schedule_paused' : 'schedule_restored', updated.name)
    persist()
    return delay(updated)
  },

  async duplicateSchedule(scheduleId) {
    requireAdmin((a) => a.role === 'superuser' || a.role === 'super_admin' || a.role === 'manager', 'duplicate a schedule')
    const before = (state.schedules ?? []).find((s) => s.id === scheduleId)
    if (!before) throw new Error('Schedule not found')
    const copy: CleaningSchedule = {
      ...before,
      id: uid('schedule'),
      name: `${before.name} (copy)`,
      isActive: false,
      lastGeneratedDate: null,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    }
    state.schedules = [...state.schedules, copy]
    logAction(before.siteId, 'schedule_updated', copy.name, 'duplicated')
    persist()
    return delay(copy)
  },

  async generateScheduleOccurrences(siteId) {
    requireAdmin((a) => a.role === 'superuser' || a.role === 'super_admin' || a.role === 'manager', 'generate schedule occurrences')
    const day = new Date()
    const todayStr = day.toISOString().slice(0, 10)
    const dow = day.getDay()
    let count = 0
    for (const s of (state.schedules ?? []).filter((x) => x.siteId === siteId && x.isActive && !x.archivedAt)) {
      if (s.recurrenceType === 'today' || s.recurrenceType === 'custom') continue
      if (s.recurrenceType === 'weekdays' && (dow === 0 || dow === 6)) continue
      if (s.recurrenceType === 'weekends' && dow !== 0 && dow !== 6) continue
      const n = Math.max(1, s.requiredCleansPerDay)
      const [sh, sm] = s.startTime.split(':').map(Number)
      const [eh, em] = s.endTime.split(':').map(Number)
      const winStart = new Date(day); winStart.setHours(sh, sm, 0, 0)
      let winEnd = new Date(day); winEnd.setHours(eh, em, 0, 0)
      if (winEnd <= winStart) winEnd = new Date(winStart.getTime() + 8 * 3600_000)
      // Don't hand future work to a disabled/archived cleaner.
      const staffOk = s.assignedUserId && state.staff.find((st) => st.id === s.assignedUserId && st.accountStatus === 'active')
      const staffId = staffOk ? s.assignedUserId : null
      let maxSort = Math.max(0, ...state.assignments.filter((a) => a.siteId === siteId).map((a) => a.sortOrder))
      for (const areaId of s.areaIds) {
        const area = state.areas.find((a) => a.id === areaId && a.active)
        if (!area) continue
        for (let k = 1; k <= n; k++) {
          // Idempotent: skip if this occurrence already exists for today.
          const exists = state.assignments.some(
            (a) => a.scheduleId === s.id && a.areaId === areaId && a.occurrenceNumber === k &&
              (a.dueAt ? a.dueAt.slice(0, 10) === todayStr : false),
          )
          if (exists) continue
          const due = new Date(winStart.getTime() + ((winEnd.getTime() - winStart.getTime()) * k) / n)
          maxSort += 1
          const asg = buildAssignmentFor(area, staffId, maxSort, due.toISOString(), {
            taskType: 'cleaning', createdByName: 'Scheduled', requirePhoto: s.requirePhoto,
            scheduleId: s.id, occurrenceNumber: k, occurrenceTotal: n,
          })
          state.assignments = [...state.assignments, asg]
          count += 1
        }
      }
      state.schedules = state.schedules.map((x) => (x.id === s.id ? { ...x, lastGeneratedDate: todayStr } : x))
    }
    persist()
    return delay(count)
  },

  async updateTaskDetails(assignmentId, patch) {
    requireRole(canManageRoutes, 'edit a task')
    const before = findAssignment(assignmentId)
    if (before.status === 'done') throw new Error('Completed tasks can\'t be edited — reopen it first.')
    const updated = updateAssignment(assignmentId, (a) => ({
      ...a,
      ...(patch.taskType !== undefined ? { taskType: patch.taskType } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
    }))
    logAction(updated.siteId, 'task_updated', updated.areaName)
    persist()
    return delay(updated)
  },

  async cancelAssignment(assignmentId, reason) {
    requireRole(canManageRoutes, 'cancel a task')
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to cancel a task.')
    const target = findAssignment(assignmentId)
    if (target.status === 'done') throw new Error('Completed tasks can\'t be cancelled.')
    state.assignments = state.assignments.filter((a) => a.id !== assignmentId)
    logAction(target.siteId, 'task_cancelled', target.areaName, trimmedReason)
    persist()
    return delay(undefined)
  },

  async reopenAssignment(assignmentId, reason) {
    requireRole(canManageRoutes, 'reopen a task')
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to reopen a task.')
    const before = findAssignment(assignmentId)
    if (before.status !== 'done') throw new Error('Only completed tasks can be reopened.')
    const updated = updateAssignment(assignmentId, (a) => ({
      ...a,
      status: 'todo',
      startedAt: null,
      submittedAt: null,
    }))
    logAction(updated.siteId, 'task_reopened', updated.areaName, trimmedReason)
    persist()
    return delay(updated)
  },

  // ————— Branches & access —————

  async listBranches(siteId, includeArchived = false) {
    const allowed = allowedBranchSet()
    let branches = state.branches.filter((b) => b.siteId === siteId && (!allowed || allowed.has(b.id)))
    if (!includeArchived) branches = branches.filter((b) => b.status !== 'archived')
    return delay([...branches].sort((a, b) => a.name.localeCompare(b.name)))
  },

  async getBranch(id) {
    const branch = state.branches.find((b) => b.id === id) ?? null
    if (!branch) return delay(null)
    const admin = actingAdmin()
    // Don't leak a branch the caller can't access — a URL/API probe returns null, not the record.
    if (admin && !canAccessBranch(admin, id)) return delay(null)
    return delay(branch)
  },

  async createBranch(siteId, input: CreateBranchInput) {
    const admin = requireAdmin(canManageBranches, 'add a branch')
    const code = (input.code?.trim() || generateBranchCode(input.provinceState, input.name)).toUpperCase()
    if (state.branches.some((b) => b.code.toLowerCase() === code.toLowerCase())) {
      throw new Error(`Branch code "${code}" is already in use.`)
    }
    if (
      state.branches.some(
        (b) =>
          b.siteId === siteId &&
          b.provinceState.trim().toLowerCase() === input.provinceState.trim().toLowerCase() &&
          b.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      )
    ) {
      throw new Error(`A branch named "${input.name}" already exists in ${input.provinceState}.`)
    }
    const branch: Branch = {
      id: uid('branch'),
      siteId,
      provinceState: input.provinceState.trim(),
      name: input.name.trim(),
      code,
      address: input.address,
      timezone: input.timezone,
      contactPerson: input.contactPerson,
      phone: input.phone,
      email: input.email,
      status: 'active',
      notes: input.notes,
      createdAt: new Date().toISOString(),
      createdByName: admin.name,
    }
    state.branches = [...state.branches, branch]
    logAction(siteId, 'branch_created', branch.name, branch.code)
    persist()
    return delay(branch)
  },

  async updateBranch(branchId, patch: UpdateBranchInput) {
    requireAdmin(canManageBranches, 'edit a branch')
    const updated = updateBranchRecord(branchId, (b) => ({ ...b, ...patch }))
    logAction(updated.siteId, 'branch_updated', updated.name)
    persist()
    return delay(updated)
  },

  async setBranchStatus(branchId, status: BranchStatus, reason) {
    requireAdmin(canManageBranches, 'change a branch\'s status')
    const trimmed = reason.trim()
    if (!trimmed) throw new Error('A reason is required.')
    const before = state.branches.find((b) => b.id === branchId)
    if (!before) throw new Error('Branch not found')
    const updated = updateBranchRecord(branchId, (b) => ({ ...b, status }))
    // Archiving pulls the branch's not-yet-done work off the active boards; its history
    // (completed proof, photos, reports) stays intact and visible to authorized users.
    if (status === 'archived' && before.status !== 'archived') {
      state.assignments = state.assignments.filter((a) => !(a.branchId === branchId && a.status !== 'done'))
      logAction(updated.siteId, 'branch_archived', updated.name, trimmed)
    } else if (status === 'active' && before.status === 'archived') {
      logAction(updated.siteId, 'branch_restored', updated.name, trimmed)
    } else {
      logAction(updated.siteId, 'branch_updated', updated.name, `status → ${status}: ${trimmed}`)
    }
    persist()
    return delay(updated)
  },

  async listAdmins(siteId) {
    requireAdmin((a) => a.role === 'superuser' || canView(a, 'users'), 'view users')
    return delay(state.admins.filter((a) => a.siteId === siteId))
  },

  async createAdmin(siteId, input: CreateAdminInput) {
    requireAdmin((a) => a.role === 'superuser', 'add a dashboard user')
    const email = input.email.trim().toLowerCase()
    if (!email) throw new Error('An email address is required.')
    if (state.admins.some((a) => a.email.toLowerCase() === email)) {
      throw new Error(`An account with "${email}" already exists.`)
    }
    const staffCode = input.staffCode?.trim() || generateStaffCode(input.name)
    if (state.admins.some((a) => a.staffCode?.toLowerCase() === staffCode.toLowerCase())) {
      throw new Error(`Staff ID "${staffCode}" is already in use.`)
    }
    const admin: AdminUser = {
      id: uid('admin-new'),
      siteId,
      name: input.name.trim(),
      initials: initialsFrom(input.name),
      colorHex: colorForName(input.name),
      title: input.title.trim() || 'Dashboard user',
      role: input.role,
      email,
      phone: input.phone?.trim() || null,
      staffCode,
      accountStatus: input.accountStatus ?? 'active',
      branchAll: input.branchAll,
      branchIds: input.branchIds,
      defaultBranchId:
        input.defaultBranchId && (input.branchAll || input.branchIds.includes(input.defaultBranchId))
          ? input.defaultBranchId
          : (input.branchAll ? null : input.branchIds[0] ?? null),
      permissions: {},
    }
    state.admins = [...state.admins, admin]
    logAction(siteId, 'user_added', admin.name, `Dashboard account · ${email}`)
    persist()
    return delay(admin)
  },

  async updateAdmin(adminId, patch: UpdateAdminInput) {
    const actor = requireAdmin((a) => a.role === 'superuser', 'edit a user')
    const before = state.admins.find((a) => a.id === adminId)
    if (!before) throw new Error('User not found')
    // A user can't lift their own role to superuser.
    if (patch.role === 'superuser' && before.role !== 'superuser' && adminId === actor.id) {
      throw new Error('You cannot change your own role to superuser.')
    }
    // Never demote the last active superuser.
    if (before.role === 'superuser' && before.accountStatus === 'active' && patch.role && patch.role !== 'superuser') {
      const others = state.admins.filter(
        (a) => a.id !== adminId && a.siteId === before.siteId && a.role === 'superuser' && a.accountStatus === 'active',
      )
      if (others.length === 0) throw new Error('This is the last active superuser — assign another before changing this one.')
    }
    if (patch.email) {
      const email = patch.email.trim().toLowerCase()
      if (state.admins.some((a) => a.id !== adminId && a.email.toLowerCase() === email)) {
        throw new Error(`An account with "${email}" already exists.`)
      }
    }
    if (patch.staffCode) {
      const code = patch.staffCode.trim().toLowerCase()
      if (state.admins.some((a) => a.id !== adminId && a.staffCode?.toLowerCase() === code)) {
        throw new Error(`Staff ID "${patch.staffCode}" is already in use.`)
      }
    }
    const updated: AdminUser = {
      ...before,
      name: patch.name?.trim() || before.name,
      initials: patch.name ? initialsFrom(patch.name) : before.initials,
      title: patch.title !== undefined ? patch.title.trim() || 'Dashboard user' : before.title,
      email: patch.email !== undefined ? patch.email.trim().toLowerCase() : before.email,
      phone: patch.phone !== undefined ? patch.phone?.trim() || null : before.phone,
      staffCode: patch.staffCode !== undefined ? patch.staffCode.trim() : before.staffCode,
      role: patch.role ?? before.role,
    }
    state.admins = state.admins.map((a) => (a.id === adminId ? updated : a))
    logAction(before.siteId, patch.role && patch.role !== before.role ? 'permissions_updated' : 'user_updated', updated.name)
    persist()
    return delay(updated)
  },

  async setAdminStatus(adminId, status) {
    requireAdmin((a) => a.role === 'superuser', "change a user's status")
    const before = state.admins.find((a) => a.id === adminId)
    if (!before) throw new Error('User not found')
    // Never disable/archive the last active superuser.
    if (before.role === 'superuser' && before.accountStatus === 'active' && status !== 'active') {
      const others = state.admins.filter(
        (a) => a.id !== adminId && a.siteId === before.siteId && a.role === 'superuser' && a.accountStatus === 'active',
      )
      if (others.length === 0) throw new Error('This is the last active superuser — assign another before archiving this one.')
    }
    const updated: AdminUser = { ...before, accountStatus: status }
    state.admins = state.admins.map((a) => (a.id === adminId ? updated : a))
    const action = status === 'archived' ? 'user_archived' : status === 'active' && before.accountStatus === 'archived' ? 'user_restored' : 'user_updated'
    logAction(before.siteId, action, updated.name, status === 'disabled' ? 'Disabled' : status === 'active' ? 'Active' : null)
    persist()
    return delay(updated)
  },

  async updateAdminAccess(adminId, patch: UpdateAdminAccessInput) {
    const actor = requireAdmin((a) => a.role === 'superuser', 'change branch access or permissions')
    const before = state.admins.find((a) => a.id === adminId)
    if (!before) throw new Error('User not found')
    // A user can't lift their own role to superuser, or grant themselves more branches.
    if (patch.role === 'superuser' && before.role !== 'superuser' && adminId === actor.id) {
      throw new Error('You cannot change your own role to superuser.')
    }
    // Never demote the last active superuser.
    if (before.role === 'superuser' && before.accountStatus === 'active' && patch.role && patch.role !== 'superuser') {
      const others = state.admins.filter(
        (a) => a.id !== adminId && a.siteId === before.siteId && a.role === 'superuser' && a.accountStatus === 'active',
      )
      if (others.length === 0) throw new Error('This is the last active superuser — assign another before changing this one.')
    }
    const updated: AdminUser = {
      ...before,
      branchAll: patch.branchAll ?? before.branchAll,
      branchIds: patch.branchIds ?? before.branchIds,
      defaultBranchId: patch.defaultBranchId !== undefined ? patch.defaultBranchId : before.defaultBranchId,
      permissions: patch.permissions ?? before.permissions,
      role: patch.role ?? before.role,
    }
    // A default branch must be one the user can actually reach.
    if (updated.defaultBranchId && !updated.branchAll && !updated.branchIds.includes(updated.defaultBranchId)) {
      updated.defaultBranchId = updated.branchIds[0] ?? null
    }
    state.admins = state.admins.map((a) => (a.id === adminId ? updated : a))
    const changedRole = patch.role && patch.role !== before.role
    logAction(before.siteId, changedRole ? 'permissions_updated' : 'branch_access_updated', before.name)
    persist()
    return delay(updated)
  },

  // ————— Staff photo proof —————

  async listProofPhotos(siteId, filter: ProofPhotoFilter = {}) {
    requireAdmin((a) => canView(a, 'photos'), 'view photos')
    const allowed = allowedBranchSet()
    let views = state.assignments
      .filter((a) => a.siteId === siteId && (!allowed || allowed.has(a.branchId)))
      .flatMap(photoViewsForAssignment)

    if (filter.branchId) views = views.filter((v) => v.branchId === filter.branchId)
    if (filter.staffId) views = views.filter((v) => v.staffId === filter.staffId)
    if (filter.areaId) views = views.filter((v) => v.areaId === filter.areaId)
    if (filter.taskType) views = views.filter((v) => v.taskType === filter.taskType)
    if (filter.label) views = views.filter((v) => v.label === filter.label)
    if (filter.reviewStatus) views = views.filter((v) => v.reviewStatus === filter.reviewStatus)
    if (filter.from) views = views.filter((v) => new Date(v.capturedAt).getTime() >= new Date(filter.from!).getTime())
    if (filter.to) views = views.filter((v) => new Date(v.capturedAt).getTime() < new Date(filter.to!).getTime())
    if (filter.search) {
      const q = filter.search.trim().toLowerCase()
      views = views.filter(
        (v) =>
          v.areaName.toLowerCase().includes(q) ||
          v.areaCode.toLowerCase().includes(q) ||
          v.branchName.toLowerCase().includes(q) ||
          (v.staffName?.toLowerCase().includes(q) ?? false) ||
          v.assignmentId.toLowerCase().includes(q),
      )
    }
    views.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    return delay(views)
  },

  async getProofPhoto(photoId) {
    const admin = actingAdmin()
    for (const a of state.assignments) {
      const photo = a.photos.find((p) => p.id === photoId)
      if (!photo) continue
      // Backend access check: a caller can't fetch a photo from a branch they can't see.
      if (admin && !canAccessBranch(admin, a.branchId)) return delay(null)
      if (admin && !canView(admin, 'photos')) return delay(null)
      return delay(photoViewsForAssignment(a).find((v) => v.id === photoId) ?? null)
    }
    return delay(null)
  },

  async reviewProofPhoto(photoId, status: PhotoReviewStatus, note) {
    const admin = requireAdmin((a) => canView(a, 'photos'), 'review photos')
    let host: Assignment | undefined
    for (const a of state.assignments) {
      if (a.photos.some((p) => p.id === photoId)) { host = a; break }
    }
    if (!host) throw new Error('Photo not found')
    if (!canAccessBranch(admin, host.branchId)) throw new Error('You don\'t have access to this photo\'s branch.')
    updateAssignment(host.id, (a) => ({
      ...a,
      photos: a.photos.map((p) =>
        p.id === photoId ? { ...p, reviewStatus: status, reviewNote: note, reviewedByName: admin.name } : p,
      ),
    }))
    logAction(host.siteId, 'photo_reviewed', host.areaName, `${status}${note ? ` · ${note}` : ''}`)
    persist()
    const view = photoViewsForAssignment(findAssignment(host.id)).find((v) => v.id === photoId)
    if (!view) throw new Error('Photo not found')
    return delay(view)
  },

  async logPhotoExport(siteId, detail) {
    logAction(siteId, 'photos_exported', 'Photo proof', detail)
    persist()
    return delay(undefined)
  },

  subscribe(_siteId, cb) {
    const handler = () => cb()
    events.addEventListener('change', handler)
    return () => events.removeEventListener('change', handler)
  },
}

export { SITE_ID }
