import type {
  AccountStatus,
  ActivityEvent,
  AdminFeature,
  AdminRole,
  AdminUser,
  Area,
  AreaCategory,
  Assignment,
  AuditAction,
  Branch,
  BranchStatus,
  ChecklistTask,
  Issue,
  PermissionAction,
  PermissionOverrides,
  PhotoReviewStatus,
  SiteKpis,
  Staff,
  TaskPriority,
  TaskType,
} from './types'

export const ISSUE_SEVERITY_LABELS: Record<Issue['severity'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
  archived: 'Archived',
  deleted: 'Deleted',
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  user_added: 'Added user',
  user_updated: 'Edited user',
  user_archived: 'Archived user',
  user_restored: 'Restored user',
  user_deleted: 'Deleted user',
  pin_reset: 'Reset PIN',
  area_created: 'Created area',
  area_updated: 'Edited area',
  area_deleted: 'Deleted area',
  area_frequency_changed: 'Changed cleaning frequency',
  route_reassigned: 'Reassigned area',
  routes_published: 'Published routes',
  issue_resolved: 'Resolved issue',
  report_exported: 'Exported report',
  locations_imported: 'Imported locations',
  task_created: 'Created task',
  task_template_created: 'Created task template',
  task_template_updated: 'Edited task template',
  task_reopened: 'Reopened task',
  task_updated: 'Edited task',
  task_cancelled: 'Cancelled task',
  branch_created: 'Created branch',
  branch_updated: 'Edited branch',
  branch_archived: 'Archived branch',
  branch_restored: 'Restored branch',
  branch_access_updated: 'Updated branch access',
  permissions_updated: 'Updated permissions',
  photo_reviewed: 'Reviewed photo',
  photos_exported: 'Exported photos',
  category_created: 'Created category',
  category_updated: 'Edited category',
  category_archived: 'Archived category',
  category_restored: 'Restored category',
  category_deleted: 'Deleted category',
  area_category_changed: 'Changed area category',
  category_reassigned: 'Reassigned category',
  schedule_created: 'Created schedule',
  schedule_updated: 'Edited schedule',
  schedule_paused: 'Paused schedule',
  schedule_archived: 'Archived schedule',
  schedule_restored: 'Restored schedule',
  benchmark_created: 'Created benchmark',
  benchmark_updated: 'Edited benchmark',
  benchmark_archived: 'Archived benchmark',
  benchmark_restored: 'Restored benchmark',
  benchmark_deleted: 'Deleted benchmark',
  benchmark_overridden: 'Overrode benchmark',
}

/** South Africa's nine provinces — offered as a dropdown so branch records never carry typos. */
export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const

export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
  pending: 'Pending',
}

export const PHOTO_REVIEW_LABELS: Record<PhotoReviewStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  flagged: 'Flagged',
  archived: 'Archived',
}

export const ADMIN_FEATURE_LABELS: Record<AdminFeature, string> = {
  overview: 'Overview',
  assignments: 'Assignments',
  createTask: 'Create Task',
  taskTemplates: 'Task Templates',
  staff: 'Staff',
  locations: 'Locations',
  branches: 'Branches',
  reports: 'Reports',
  photos: 'Photos',
  liveMap: 'Live Map',
  users: 'Users & Access',
  categories: 'Location Categories',
  benchmarks: 'Cleaning Benchmarks',
  settings: 'Settings',
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  cleaning: 'Cleaning',
  inspection: 'Inspection',
  restock: 'Restock',
  maintenance: 'Maintenance',
  issue_followup: 'Issue Follow-up',
  custom: 'Custom',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  superuser: 'Superuser',
  super_admin: 'Super Admin',
  manager: 'Admin / Manager',
  supervisor: 'Supervisor',
  read_only: 'Read-only',
}

/** The full feature set, in nav order — used to render permission matrices. */
export const ADMIN_FEATURES: AdminFeature[] = [
  'overview', 'assignments', 'createTask', 'taskTemplates', 'staff',
  'locations', 'branches', 'reports', 'photos', 'liveMap', 'users', 'categories', 'benchmarks', 'settings',
]

/**
 * Baseline capabilities per role. Per-user overrides (AdminUser.permissions) are layered on top
 * of this. `superuser` implicitly gets everything and bypasses the table.
 * Managing branches and task templates is superuser-only by default (per the spec).
 */
const ROLE_PERMISSION_DEFAULTS: Record<AdminRole, PermissionOverrides> = {
  superuser: {}, // handled by the superuser short-circuit in hasPermission
  super_admin: {
    overview: { view: true }, assignments: { view: true, manage: true }, createTask: { view: true, manage: true },
    taskTemplates: { view: true, manage: true }, staff: { view: true, manage: true }, locations: { view: true, manage: true, export: true },
    branches: { view: true }, reports: { view: true, export: true }, photos: { view: true, export: true }, liveMap: { view: true },
    users: { view: true }, categories: { view: true }, benchmarks: { view: true }, settings: { view: true },
  },
  manager: {
    overview: { view: true }, assignments: { view: true, manage: true }, createTask: { view: true, manage: true },
    taskTemplates: { view: true }, staff: { view: true, manage: true }, locations: { view: true, manage: true, export: true },
    branches: { view: true }, reports: { view: true, export: true }, photos: { view: true }, liveMap: { view: true },
    // Managers can view/select categories but not manage them unless a superuser grants it.
    users: {}, categories: { view: true }, benchmarks: { view: true }, settings: {},
  },
  supervisor: {
    overview: { view: true }, assignments: { view: true, manage: true }, createTask: { view: true, manage: true },
    taskTemplates: { view: true }, staff: { view: true }, locations: { view: true },
    branches: {}, reports: { view: true }, photos: { view: true }, liveMap: { view: true },
    users: {}, categories: { view: true }, benchmarks: { view: true }, settings: {},
  },
  read_only: {
    overview: { view: true }, assignments: { view: true }, createTask: {}, taskTemplates: {}, staff: { view: true },
    locations: { view: true }, branches: {}, reports: { view: true }, photos: { view: true }, liveMap: { view: true },
    users: {}, categories: { view: true }, benchmarks: { view: true }, settings: {},
  },
}

export function roleDefaultPermissions(role: AdminRole): PermissionOverrides {
  return ROLE_PERMISSION_DEFAULTS[role] ?? {}
}

/** Effective capability = superuser-all, else role default for the action, flipped by any per-user override. */
export function hasPermission(admin: Pick<AdminUser, 'role' | 'permissions'>, feature: AdminFeature, action: PermissionAction = 'view'): boolean {
  if (admin.role === 'superuser') return true
  const override = admin.permissions?.[feature]?.[action]
  if (override !== undefined) return override
  return ROLE_PERMISSION_DEFAULTS[admin.role]?.[feature]?.[action] ?? false
}

export function canView(admin: Pick<AdminUser, 'role' | 'permissions'>, feature: AdminFeature): boolean {
  return hasPermission(admin, feature, 'view')
}

/** Add/edit/archive users, reset PINs. */
export function canManageUsers(role: AdminRole): boolean {
  return role === 'superuser' || role === 'super_admin' || role === 'manager'
}

/** Create/edit sites, areas, cleaning frequency, checklist templates. */
export function canManageAreas(role: AdminRole): boolean {
  return role === 'superuser' || role === 'super_admin' || role === 'manager'
}

/** Create/edit/publish/archive global task templates — superuser / super admin only, per checklist. */
export function canManageTemplates(role: AdminRole): boolean {
  return role === 'superuser' || role === 'super_admin'
}

/** Assign/reassign work, publish routes, toggle staff shift status. */
export function canManageRoutes(role: AdminRole): boolean {
  return role !== 'read_only'
}

/** Add/edit/archive/restore branches and change branch access — superuser only by default,
 * grantable per-user via a `branches.manage` override. */
export function canManageBranches(admin: Pick<AdminUser, 'role' | 'permissions'>): boolean {
  return admin.role === 'superuser' || hasPermission(admin, 'branches', 'manage')
}

// ————— Branch access —————

/** The concrete set of branch ids an admin may access, given the full branch list. */
export function allowedBranchIds(admin: Pick<AdminUser, 'branchAll' | 'branchIds'>, branches: Pick<Branch, 'id'>[]): string[] {
  if (admin.branchAll) return branches.map((b) => b.id)
  return admin.branchIds
}

export function canAccessBranch(admin: Pick<AdminUser, 'branchAll' | 'branchIds'>, branchId: string): boolean {
  return admin.branchAll || admin.branchIds.includes(branchId)
}

/** Which branch a page should land on: the saved default if still allowed, else the first allowed, else null. */
export function resolveLandingBranch(
  admin: Pick<AdminUser, 'branchAll' | 'branchIds' | 'defaultBranchId'>,
  branches: Pick<Branch, 'id'>[],
): string | null {
  const allowed = allowedBranchIds(admin, branches)
  if (admin.defaultBranchId && allowed.includes(admin.defaultBranchId)) return admin.defaultBranchId
  return allowed[0] ?? null
}

/** Selectable recurrence intervals for an area's cleaning frequency. `null` = manual / no recurrence. */
export const FREQUENCY_PRESETS: Array<{ minutes: number | null; label: string }> = [
  { minutes: null, label: 'Manual (no recurrence)' },
  { minutes: 30, label: 'Every 30 min' },
  { minutes: 60, label: 'Hourly' },
  { minutes: 120, label: 'Every 2 hours' },
  { minutes: 240, label: 'Every 4 hours' },
  { minutes: 480, label: 'Every 8 hours' },
  { minutes: 1440, label: 'Once daily' },
]

export function formatFrequency(minutes: number | null): string {
  return FREQUENCY_PRESETS.find((p) => p.minutes === minutes)?.label ?? `Every ${minutes}min`
}

export const AREA_CATEGORY_LABELS: Record<AreaCategory, string> = {
  bathroom: 'Bathroom',
  office: 'Office',
  common: 'Common area',
  kitchen: 'Kitchen',
  outdoor: 'Outdoor',
  other: 'Other',
}

/** Human label for a category slug: the built-in label if known, else Title-Cased from the slug.
 * A fallback for rendering `Area.category` when the full LocationCategory isn't on hand. */
export function categorySlugLabel(slug: string): string {
  if (slug in AREA_CATEGORY_LABELS) return AREA_CATEGORY_LABELS[slug as AreaCategory]
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Uncategorized'
}

/** Managing categories: superuser, or anyone granted the categories.manage override. */
export function canManageCategories(admin: Pick<AdminUser, 'role' | 'permissions'>): boolean {
  return admin.role === 'superuser' || hasPermission(admin, 'categories', 'manage')
}

/** Managing benchmarks: superuser, or anyone granted the benchmarks.manage override. */
export function canManageBenchmarks(admin: Pick<AdminUser, 'role' | 'permissions'>): boolean {
  return admin.role === 'superuser' || hasPermission(admin, 'benchmarks', 'manage')
}

/** Time remaining until an area's next clean is due, for areas on a recurring frequency. */
export function frequencyCountdown(
  area: Pick<Area, 'frequencyMinutes' | 'lastCleanedAt'>,
  now = Date.now(),
): { dueAt: number; remainingMs: number; overdue: boolean; pctElapsed: number } | null {
  if (!area.frequencyMinutes) return null
  const cycleMs = area.frequencyMinutes * 60_000
  const start = area.lastCleanedAt ? new Date(area.lastCleanedAt).getTime() : now
  const dueAt = start + cycleMs
  const remainingMs = dueAt - now
  const pctElapsed = Math.min(1, Math.max(0, (now - start) / cycleMs))
  return { dueAt, remainingMs, overdue: remainingMs < 0, pctElapsed }
}

export function taskProgress(tasks: ChecklistTask[]) {
  const done = tasks.filter((t) => t.completed).length
  return { done, total: tasks.length }
}

export function assignmentProgress(assignments: Assignment[]) {
  const done = assignments.filter((a) => a.status === 'done').length
  return { done, total: assignments.length }
}

/** First not-yet-done assignment in route order — what the app treats as "up next". */
export function getNextAssignment(assignments: Assignment[]): Assignment | null {
  const pending = assignments
    .filter((a) => a.status !== 'done')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return pending[0] ?? null
}

export function isOverdue(a: Assignment, now = Date.now()): boolean {
  if (a.status === 'done') return false
  if (!a.dueAt) return false
  return new Date(a.dueAt).getTime() < now
}

/** Effective status, accounting for a due date that has since passed. */
export function effectiveStatus(a: Assignment, now = Date.now()): Assignment['status'] {
  if (a.status === 'done') return 'done'
  if (isOverdue(a, now)) return 'overdue'
  return a.status
}

export function onTimeRate(assignments: Assignment[]): number {
  const done = assignments.filter((a) => a.status === 'done')
  if (done.length === 0) return 100
  const onTime = done.filter((a) => {
    if (!a.dueAt || !a.submittedAt) return true
    return new Date(a.submittedAt).getTime() <= new Date(a.dueAt).getTime()
  }).length
  return Math.round((onTime / done.length) * 100)
}

/** Staff eligible for new shifts/assignments — excludes disabled and archived accounts. */
export function activeStaff(staff: Staff[]): Staff[] {
  return staff.filter((s) => s.accountStatus === 'active')
}

export function computeSiteKpis(assignments: Assignment[], staff: Staff[], issues: Issue[] = []): SiteKpis {
  const { done, total } = assignmentProgress(assignments)
  const overdueCount = assignments.filter((a) => effectiveStatus(a) === 'overdue').length
  const roster = staff.filter((s) => s.accountStatus !== 'archived' && s.accountStatus !== 'deleted')
  const staffOnShift = activeStaff(staff).filter((s) => s.status !== 'off_shift').length
  return {
    cleaned: done,
    total,
    onTimeRate: onTimeRate(assignments),
    staffOnShift,
    staffTotal: roster.length,
    overdueCount,
    openIssueCount: issues.filter((i) => i.status === 'open').length,
  }
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

export function formatClock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function deriveActivity(
  assignments: Assignment[],
  staffById: Map<string, Staff>,
  now = Date.now(),
  issues: Issue[] = [],
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  for (const issue of issues) {
    const staff = issue.staffId ? staffById.get(issue.staffId) ?? null : null
    events.push({
      id: `${issue.id}-issue`,
      kind: 'issue',
      assignmentId: issue.assignmentId ?? '',
      staffId: staff?.id ?? null,
      staffName: staff?.fullName ?? issue.staffName,
      staffInitials: staff?.initials ?? null,
      staffColorHex: staff?.colorHex ?? null,
      areaName: issue.areaName,
      areaCode: issue.areaCode,
      detail: `${ISSUE_SEVERITY_LABELS[issue.severity].toLowerCase()} · ${issue.description}`,
      timestamp: issue.createdAt,
    })
  }

  for (const a of assignments) {
    const staff = a.staffId ? staffById.get(a.staffId) ?? null : null
    if (a.status === 'done' && a.submittedAt) {
      const { done, total } = taskProgress(a.tasks)
      events.push({
        id: `${a.id}-verified`,
        kind: 'verified',
        assignmentId: a.id,
        staffId: staff?.id ?? null,
        staffName: staff?.fullName ?? null,
        staffInitials: staff?.initials ?? null,
        staffColorHex: staff?.colorHex ?? null,
        areaName: a.areaName,
        areaCode: a.areaCode,
        detail: `${done}/${total} tasks · ${a.photos.length} photo${a.photos.length === 1 ? '' : 's'}`,
        timestamp: a.submittedAt,
      })
    } else if (a.status === 'in_progress' && a.startedAt) {
      events.push({
        id: `${a.id}-started`,
        kind: 'started',
        assignmentId: a.id,
        staffId: staff?.id ?? null,
        staffName: staff?.fullName ?? null,
        staffInitials: staff?.initials ?? null,
        staffColorHex: staff?.colorHex ?? null,
        areaName: a.areaName,
        areaCode: a.areaCode,
        detail: 'in progress',
        timestamp: a.startedAt,
      })
    } else if (effectiveStatus(a, now) === 'overdue' && a.dueAt) {
      events.push({
        id: `${a.id}-overdue`,
        kind: 'overdue',
        assignmentId: a.id,
        staffId: staff?.id ?? null,
        staffName: staff?.fullName ?? null,
        staffInitials: staff?.initials ?? null,
        staffColorHex: staff?.colorHex ?? null,
        areaName: a.areaName,
        areaCode: a.areaCode,
        detail: `missed window · +${formatDuration(now - new Date(a.dueAt).getTime())}`,
        timestamp: a.dueAt,
      })
    }
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export interface NotificationItem {
  id: string
  kind: 'issue' | 'overdue' | 'not_started'
  message: string
  timestamp: string
  severity: 'info' | 'warning' | 'critical'
}

const NOT_STARTED_GRACE_MS = 60 * 60_000 // alert once someone's an hour into shift with nothing started

/** Drives the admin notification center — real alerts computed from live data, not a fabricated feed. */
export function computeNotifications(
  assignments: Assignment[],
  staff: Staff[],
  issues: Issue[],
  now = Date.now(),
): NotificationItem[] {
  const items: NotificationItem[] = []

  for (const issue of issues.filter((i) => i.status === 'open')) {
    items.push({
      id: `issue-${issue.id}`,
      kind: 'issue',
      message: `${issue.staffName ?? 'Someone'} reported an issue at ${issue.areaName}: ${issue.description}`,
      timestamp: issue.createdAt,
      severity: issue.severity === 'high' ? 'critical' : issue.severity === 'medium' ? 'warning' : 'info',
    })
  }

  for (const a of assignments) {
    if (effectiveStatus(a, now) === 'overdue' && a.dueAt) {
      items.push({
        id: `overdue-${a.id}`,
        kind: 'overdue',
        message: `${a.areaName} is overdue by ${formatDuration(now - new Date(a.dueAt).getTime())}`,
        timestamp: a.dueAt,
        severity: 'critical',
      })
    }
  }

  for (const s of activeStaff(staff).filter((s) => s.status === 'on_shift')) {
    if (!s.shiftStart) continue
    const intoShift = now - new Date(s.shiftStart).getTime()
    if (intoShift < NOT_STARTED_GRACE_MS) continue
    const mine = assignments.filter((a) => a.staffId === s.id)
    const started = mine.some((a) => a.status !== 'todo')
    if (mine.length > 0 && !started) {
      items.push({
        id: `not-started-${s.id}`,
        kind: 'not_started',
        message: `${s.fullName} hasn't started their route (${formatDuration(intoShift)} into shift)`,
        timestamp: s.shiftStart,
        severity: 'warning',
      })
    }
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function placeholderPhoto(seed: string): string {
  const hue = Math.abs(hashCode(seed)) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
    <defs>
      <pattern id="p" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="hsl(${hue},20%,93%)"/>
        <rect width="8" height="16" fill="hsl(${hue},20%,97%)"/>
      </pattern>
    </defs>
    <rect width="200" height="150" fill="url(#p)"/>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}

export function initialsFrom(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '??'
}

export function generateStaffCode(fullName: string): string {
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `${initialsFrom(fullName)}-${digits}`
}

export function generateAreaCode(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2) || 'AR'
  const digits = Math.floor(100 + Math.random() * 900)
  return `CPG-${letters}-${digits}`
}

export function generatePin(length = 4): string {
  let pin = ''
  for (let i = 0; i < length; i++) pin += Math.floor(Math.random() * 10)
  return pin
}

const AVATAR_COLORS = ['#1D231F', '#35668C', '#216B4B', '#B27A0F', '#8E44AD', '#B3261E', '#2E86AB']

export function colorForName(fullName: string): string {
  return AVATAR_COLORS[Math.abs(hashCode(fullName)) % AVATAR_COLORS.length]
}
