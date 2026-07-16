export type StaffStatus = 'on_shift' | 'on_break' | 'off_shift'

/** Account lifecycle — separate from shift status. Only active accounts can sign in.
 * Deleted is a soft delete: hidden from the main list and all pickers, restorable. */
export type AccountStatus = 'active' | 'disabled' | 'archived' | 'deleted'

export interface Site {
  id: string
  name: string
}

export type BranchStatus = 'active' | 'inactive' | 'archived' | 'pending'

/** A facility/branch under the company/site — e.g. "Gauteng · Southwest Hospital". Every area,
 * assignment, staff member, proof, and photo links back to one of these via branchId. */
export interface Branch {
  id: string
  siteId: string
  provinceState: string
  name: string
  /** Unique globally, e.g. GAU-SWH. */
  code: string
  address: string | null
  timezone: string | null
  contactPerson: string | null
  phone: string | null
  email: string | null
  status: BranchStatus
  notes: string | null
  createdAt: string
  createdByName: string | null
}

export interface Staff {
  id: string
  siteId: string
  branchId: string
  staffCode: string
  fullName: string
  initials: string
  colorHex: string
  role: string
  status: StaffStatus
  accountStatus: AccountStatus
  email: string | null
  phone: string | null
  shiftStart: string | null
  shiftEnd: string | null
  createdAt: string
  lastLoginAt: string | null
}

/**
 * Permission tier — separate from `title`, which is just a display label
 * (e.g. "Site supervisor"). Enforced in the repo layer (mockRepo checks the
 * signed-in admin's role directly; Supabase mode uses RLS keyed off this
 * column), not only hidden in the UI.
 */
export type AdminRole = 'superuser' | 'super_admin' | 'manager' | 'supervisor' | 'read_only'

/** Feature areas a permission can be scoped to. Mirrors the admin nav + the spec's list. */
export type AdminFeature =
  | 'overview'
  | 'assignments'
  | 'createTask'
  | 'taskTemplates'
  | 'staff'
  | 'locations'
  | 'branches'
  | 'reports'
  | 'photos'
  | 'liveMap'
  | 'users'
  | 'categories'
  | 'benchmarks'
  | 'settings'

export type PermissionAction = 'view' | 'manage' | 'export'

/** Per-user overrides layered on top of the role's default capabilities. A missing entry means
 * "use the role default"; an explicit true/false grants or revokes that action for the user. */
export type PermissionOverrides = Partial<Record<AdminFeature, Partial<Record<PermissionAction, boolean>>>>

export interface AdminUser {
  id: string
  siteId: string
  name: string
  initials: string
  colorHex: string
  /** Display label only, e.g. "Site supervisor" — not used for access control. */
  title: string
  role: AdminRole
  email: string
  /** Phone number, optional. */
  phone: string | null
  /** Display identifier shown on the Users & Access row (e.g. AD-1042). Admins still
   * log in by email+password — this is not a login credential, unlike a staff code. */
  staffCode: string | null
  /** Account lifecycle. Only 'active' admins can sign in or reach any data;
   * 'archived'/'disabled' keep their history but lose access. ('deleted' unused for admins.) */
  accountStatus: AccountStatus
  /** True = access to every branch at the site (superusers, regional owners). */
  branchAll: boolean
  /** Specific branch ids this admin may access (ignored when branchAll is true). */
  branchIds: string[]
  /** The branch this admin lands on at first login; null = "All assigned". */
  defaultBranchId: string | null
  /** Optional per-feature overrides on top of the role defaults. */
  permissions: PermissionOverrides
}

export type AssignmentStatus = 'todo' | 'in_progress' | 'done' | 'overdue'

/** The built-in category slugs seeded on every site. Areas can also use custom category
 * slugs created by admins, so `Area.category` is a free string — this union is only used
 * for the default label lookup + import validation. */
export type AreaCategory = 'bathroom' | 'office' | 'common' | 'kitchen' | 'outdoor' | 'other'

/** An editable location category. Global (all-branch) or scoped to one branch. */
export interface LocationCategory {
  id: string
  siteId: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  color: string | null
  branchId: string | null
  isGlobal: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  archivedAt: string | null
}

export interface Area {
  id: string
  siteId: string
  branchId: string
  name: string
  code: string
  /** Denormalized category slug (kept for history + display fallback). The real link is categoryId. */
  category: string
  /** FK to the LocationCategory this area belongs to; null for legacy/unlinked areas. */
  categoryId: string | null
  /** How often this area must be re-cleaned, in minutes. Null = no recurring schedule (one-off / manually assigned each time). */
  frequencyMinutes: number | null
  /** Checklist labels used whenever a new cleaning cycle is generated for this area. */
  taskTemplate: string[]
  lastCleanedAt: string | null
  /** Inactive areas are hidden from new route assignments and can't have proof submitted for them. */
  active: boolean
}

export interface ChecklistTask {
  id: string
  label: string
  completed: boolean
  sortOrder: number
}

export type PhotoReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'archived'

export interface ProofPhoto {
  id: string
  label: 'before' | 'after'
  dataUrl: string
  /** Supervisor review state. Absent on older records is treated as 'pending'. */
  reviewStatus?: PhotoReviewStatus
  reviewNote?: string | null
  reviewedByName?: string | null
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskType = 'cleaning' | 'inspection' | 'restock' | 'maintenance' | 'issue_followup' | 'custom'

export interface Assignment {
  id: string
  siteId: string
  branchId: string
  areaId: string
  areaName: string
  areaCode: string
  staffId: string | null
  status: AssignmentStatus
  dueAt: string | null
  startedAt: string | null
  submittedAt: string | null
  sortOrder: number
  tasks: ChecklistTask[]
  photos: ProofPhoto[]
  note: string | null
  priority: TaskPriority
  taskType: TaskType
  /** Set only for tasks created from a template — null for recurring/area-default cycles. The checklist/type were copied at creation time, so later template edits never change history. */
  templateId: string | null
  templateName: string | null
  /** Name of the admin/supervisor who created this via the Create Task flow — null for system-generated recurring cycles. */
  createdByName: string | null
  /** Copied from the template at creation time (same versioning rule as templateId): staff can't mark this clean without an "after" proof photo. */
  requirePhoto: boolean
  /** Set when this assignment is one occurrence generated by a cleaning schedule; null for one-off/recurring-area tasks. */
  scheduleId: string | null
  /** 1-based occurrence index within the day, e.g. 2 of 4. Null for non-scheduled tasks. */
  occurrenceNumber: number | null
  /** Total required occurrences that day for this area under the schedule. Null for non-scheduled tasks. */
  occurrenceTotal: number | null
}

/** An editable cleaning-frequency benchmark for a category (optionally branch/area scoped). */
export interface Benchmark {
  id: string
  siteId: string
  name: string
  branchId: string | null
  categoryId: string | null
  areaId: string | null
  requiredCleansPerDay: number
  intervalMinutes: number | null
  photoRequired: boolean
  isGlobal: boolean
  isActive: boolean
  createdAt: string
  archivedAt: string | null
}

/** A recurring cleaning schedule definition (occurrences are generated as Assignment rows). */
export interface CleaningSchedule {
  id: string
  siteId: string
  name: string
  branchId: string | null
  categoryId: string | null
  assignedUserId: string | null
  recurrenceType: 'today' | 'daily' | 'weekdays' | 'weekends' | 'custom'
  frequencyType: string
  requiredCleansPerDay: number
  intervalMinutes: number | null
  startTime: string
  endTime: string
  shift: string | null
  requirePhoto: boolean
  notes: string | null
  isActive: boolean
  areaIds: string[]
  lastGeneratedDate: string | null
  createdAt: string
  archivedAt: string | null
}

export type TaskTemplateStatus = 'active' | 'inactive' | 'draft'

/** A super-admin-authored reusable task definition. Creating a task from one copies its fields onto the assignment — the template itself can keep changing without touching history. */
export interface TaskTemplate {
  id: string
  siteId: string
  name: string
  taskType: TaskType
  checklistItems: string[]
  defaultPriority: TaskPriority
  requirePhoto: boolean
  status: TaskTemplateStatus
  createdAt: string
}

export type ActivityKind = 'verified' | 'started' | 'overdue' | 'issue'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  assignmentId: string
  staffId: string | null
  staffName: string | null
  staffInitials: string | null
  staffColorHex: string | null
  areaName: string
  areaCode: string
  detail: string
  timestamp: string
}

export type IssueSeverity = 'low' | 'medium' | 'high'
export type IssueStatus = 'open' | 'resolved'

/** Something staff flags instead of (or in addition to) marking an area clean. */
export interface Issue {
  id: string
  siteId: string
  branchId: string
  areaId: string
  areaName: string
  areaCode: string
  assignmentId: string | null
  staffId: string | null
  staffName: string | null
  description: string
  severity: IssueSeverity
  status: IssueStatus
  createdAt: string
  resolvedAt: string | null
}

export type AuditAction =
  | 'user_added'
  | 'user_updated'
  | 'user_archived'
  | 'user_restored'
  | 'user_deleted'
  | 'pin_reset'
  | 'area_created'
  | 'area_updated'
  | 'area_deleted'
  | 'area_frequency_changed'
  | 'route_reassigned'
  | 'routes_published'
  | 'issue_resolved'
  | 'report_exported'
  | 'locations_imported'
  | 'task_created'
  | 'task_template_created'
  | 'task_template_updated'
  | 'task_reopened'
  | 'task_updated'
  | 'task_cancelled'
  | 'branch_created'
  | 'branch_updated'
  | 'branch_archived'
  | 'branch_restored'
  | 'branch_access_updated'
  | 'permissions_updated'
  | 'photo_reviewed'
  | 'photos_exported'
  | 'category_created'
  | 'category_updated'
  | 'category_archived'
  | 'category_restored'
  | 'category_deleted'
  | 'area_category_changed'
  | 'category_reassigned'
  | 'schedule_created'
  | 'schedule_updated'
  | 'schedule_paused'
  | 'schedule_archived'
  | 'schedule_restored'
  | 'benchmark_created'
  | 'benchmark_updated'
  | 'benchmark_archived'
  | 'benchmark_restored'
  | 'benchmark_deleted'
  | 'benchmark_overridden'

/** A record of a privileged admin action, for accountability — who did what and when. */
export interface AuditLogEntry {
  id: string
  siteId: string
  actorId: string | null
  actorName: string
  action: AuditAction
  targetLabel: string
  detail: string | null
  createdAt: string
}

export type ReportType =
  | 'cleaning_proof'
  | 'scheduled_clean'
  | 'schedule_compliance'
  | 'assignments'
  | 'staff_performance'
  | 'locations'
  | 'issues'
  | 'overdue_sla'
  | 'photo_proof'
  | 'qr_scans'
  | 'benchmarks'
  | 'audit_log'

/** An admin's saved report configuration — fields, filters, sort/group — reusable across sessions. */
export interface ReportTemplate {
  id: string
  siteId: string
  ownerAdminId: string
  name: string
  reportType: ReportType
  fields: string[]
  sortBy: string | null
  groupBy: string | null
  /** Visible to every admin at the site, not just the owner. */
  shared: boolean
  createdAt: string
}

/** A record of one location-import run, for the "who imported what, when" history the checklist asks for. */
export interface ImportBatch {
  id: string
  siteId: string
  fileName: string
  importedByName: string
  importedAt: string
  successCount: number
  failedCount: number
  status: 'success' | 'partial' | 'failed'
}

export interface SiteKpis {
  cleaned: number
  total: number
  onTimeRate: number
  staffOnShift: number
  staffTotal: number
  overdueCount: number
  openIssueCount: number
}

/** A flattened proof photo with all the context the Photo Proof gallery filters/sorts on.
 * Derived from an assignment's photos joined to its branch/area/staff, not stored separately. */
export interface ProofPhotoView {
  id: string
  assignmentId: string
  siteId: string
  branchId: string
  branchName: string
  branchCode: string
  areaId: string
  areaName: string
  areaCode: string
  staffId: string | null
  staffName: string | null
  taskType: TaskType
  label: 'before' | 'after'
  dataUrl: string
  capturedAt: string
  assignmentStatus: AssignmentStatus
  hasOpenIssue: boolean
  reviewStatus: PhotoReviewStatus
  reviewNote: string | null
  reviewedByName: string | null
}
