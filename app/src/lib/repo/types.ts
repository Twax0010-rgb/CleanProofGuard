import type {
  AccountStatus,
  AdminUser,
  Area,
  Assignment,
  AuditLogEntry,
  Branch,
  BranchStatus,
  Benchmark,
  CleaningSchedule,
  ImportBatch,
  Issue,
  IssueSeverity,
  LocationCategory,
  PermissionOverrides,
  PhotoReviewStatus,
  ProofPhotoView,
  ReportTemplate,
  ReportType,
  Site,
  Staff,
  TaskPriority,
  TaskTemplate,
  TaskTemplateStatus,
  TaskType,
} from '../types'

export interface CreateStaffInput {
  fullName: string
  role: string
  email: string | null
  phone: string | null
  pin: string
  /** Branch this staff member belongs to. */
  branchId: string
  /** Auto-generated from the name if omitted. */
  staffCode?: string
}

export interface UpdateStaffInput {
  fullName?: string
  role?: string
  email?: string | null
  phone?: string | null
  accountStatus?: AccountStatus
  staffCode?: string
}

export interface CreateAreaInput {
  name: string
  /** Auto-generated if omitted. */
  code?: string
  /** Category slug (denormalized label). Pair with categoryId for the real link. */
  category: Area['category']
  categoryId?: string | null
  frequencyMinutes: number | null
  taskTemplate: string[]
  /** Branch this area belongs to. */
  branchId: string
}

export interface UpdateAreaInput {
  name?: string
  category?: Area['category']
  categoryId?: string | null
  taskTemplate?: string[]
  active?: boolean
}

export interface CreateCategoryInput {
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
  /** Only meaningful when isGlobal is false. */
  branchId?: string | null
  isGlobal: boolean
}

export interface UpdateCategoryInput {
  name?: string
  description?: string | null
  icon?: string | null
  color?: string | null
  sortOrder?: number
}

export interface SaveReportTemplateInput {
  id?: string
  name: string
  reportType: ReportType
  fields: string[]
  sortBy: string | null
  groupBy: string | null
  shared: boolean
}

/** Why a scanned tag couldn't be turned into work, so the scanner can say something useful
 * instead of just refusing. */
export type ScanAreaFailure = 'unknown_code' | 'inactive_area' | 'other_branch'

/** `created` distinguishes work that already existed (their route, or an unassigned job they just
 * claimed) from an ad-hoc task the scan itself opened — the UI says so, since one is extra work. */
export type ScanAreaResult =
  | { ok: true; assignment: Assignment; created: boolean }
  | { ok: false; reason: ScanAreaFailure }

export interface ScheduleBreakInput {
  start: string
  end: string
  label?: string | null
}

export interface CreateScheduleInput {
  name: string
  branchId: string | null
  categoryId: string | null
  assignedUserId: string | null
  recurrenceType: CleaningSchedule['recurrenceType']
  frequencyType: string
  requiredCleansPerDay: number
  intervalMinutes: number | null
  startTime: string
  endTime: string
  shift: string | null
  areaIds: string[]
  breaks: ScheduleBreakInput[]
  /** Explicit checklist for every occurrence; empty falls back to each area's own template. */
  checklistItems: string[]
  templateId: string | null
  templateName: string | null
  requirePhoto: boolean
  notes: string | null
  isActive: boolean
  /** Generate today's occurrences now (false = save the definition only, e.g. draft). */
  generateToday: boolean
}

export interface CreateBenchmarkInput {
  name: string
  categoryId: string | null
  branchId?: string | null
  areaId?: string | null
  requiredCleansPerDay: number
  intervalMinutes?: number | null
  photoRequired: boolean
  isGlobal: boolean
}

export interface UpdateBenchmarkInput {
  name?: string
  requiredCleansPerDay?: number
  intervalMinutes?: number | null
  photoRequired?: boolean
  categoryId?: string | null
}

export interface UpdateScheduleInput {
  name?: string
  assignedUserId?: string | null
  requiredCleansPerDay?: number
  frequencyType?: string
  intervalMinutes?: number | null
  recurrenceType?: CleaningSchedule['recurrenceType']
  startTime?: string
  endTime?: string
  requirePhoto?: boolean
  notes?: string | null
  /** Replaces the schedule's areas when provided. */
  areaIds?: string[]
}

export interface CreateTaskInput {
  areaId: string
  /** Empty = a single unassigned task; one or more ids creates one assignment per staff member. */
  staffIds: string[]
  taskType: TaskType
  priority: TaskPriority
  dueAt: string | null
  checklistItems: string[]
  templateId: string | null
  templateName: string | null
  /** Copied onto each assignment (from the template, or false for ad hoc) so later template edits never change what an existing task requires. */
  requirePhoto: boolean
}

export interface CreateBranchInput {
  provinceState: string
  name: string
  /** Auto-generated from province + name if omitted. */
  code?: string
  address: string | null
  timezone: string | null
  contactPerson: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export interface UpdateBranchInput {
  provinceState?: string
  name?: string
  address?: string | null
  timezone?: string | null
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export interface UpdateAdminAccessInput {
  branchAll?: boolean
  branchIds?: string[]
  defaultBranchId?: string | null
  permissions?: PermissionOverrides
  role?: AdminUser['role']
}

export interface CreateAdminInput {
  name: string
  email: string
  /** Display label only, e.g. "Hospital Admin". */
  title: string
  role: AdminUser['role']
  branchAll: boolean
  branchIds: string[]
  defaultBranchId: string | null
  phone?: string | null
  /** Display id (e.g. AD-1042). Auto-generated from the name if omitted. */
  staffCode?: string
  /** Starting password for the new dashboard login. */
  password: string
  /** Initial lifecycle state. Defaults to 'active'. */
  accountStatus?: 'active' | 'disabled'
}

/** Basic-field edits from the Users & Access "Edit" modal (not branch/permission access). */
export interface UpdateAdminInput {
  name?: string
  title?: string
  email?: string
  phone?: string | null
  staffCode?: string
  role?: AdminUser['role']
}

/** Filters for the Photo Proof gallery. All optional; branchId narrows within the caller's allowed set. */
export interface ProofPhotoFilter {
  branchId?: string | null
  staffId?: string | null
  areaId?: string | null
  taskType?: TaskType | null
  label?: 'before' | 'after' | null
  reviewStatus?: PhotoReviewStatus | null
  /** ISO instants; inclusive start, exclusive end. */
  from?: string | null
  to?: string | null
  search?: string | null
}

export interface UpdateTaskInput {
  taskType?: TaskType
  priority?: TaskPriority
  dueAt?: string | null
}

export interface SaveTaskTemplateInput {
  id?: string
  name: string
  taskType: TaskType
  checklistItems: string[]
  defaultPriority: TaskPriority
  requirePhoto: boolean
  status: TaskTemplateStatus
}

export interface ImportAreaRow {
  code: string
  name: string
  category: Area['category']
  frequencyMinutes: number | null
  taskTemplate: string[]
  active: boolean
  /** Branch new rows are created under (the Locations page's active branch). */
  branchId: string
  /** True when this code matches an existing area — updates it instead of creating a new one. */
  isUpdate: boolean
}

export interface DataRepo {
  readonly mode: 'mock' | 'supabase'

  authenticateStaff(staffCode: string, pin: string): Promise<Staff | null>
  authenticateAdmin(email: string, password: string): Promise<AdminUser | null>

  /**
   * Tells the repo who's currently authenticated as admin, so mutating
   * methods below can check the *acting* admin's role themselves rather than
   * trusting whatever the UI happens to show — call with `null` on sign-out.
   * In mock mode this is the actual enforcement point; in Supabase mode it's
   * a no-op because RLS already reads the real session (`auth.uid()`).
   */
  setActingAdmin(adminId: string | null): void

  getStaff(id: string): Promise<Staff | null>
  getAdmin(id: string): Promise<AdminUser | null>
  getSite(id: string): Promise<Site | null>

  // ————— Branches & access —————
  /** Branches the acting admin may access (all of them for a superuser). Excludes archived unless includeArchived. */
  listBranches(siteId: string, includeArchived?: boolean): Promise<Branch[]>
  /** Access-checked: returns null if the acting admin can't access this branch. */
  getBranch(id: string): Promise<Branch | null>
  createBranch(siteId: string, input: CreateBranchInput): Promise<Branch>
  updateBranch(branchId: string, patch: UpdateBranchInput): Promise<Branch>
  /** Archive/restore/activate a branch. Requires a reason (recorded in the audit log). Blocks hard-delete. */
  setBranchStatus(branchId: string, status: BranchStatus, reason: string): Promise<Branch>

  /** All admin accounts at the site (superuser/manager visibility). */
  listAdmins(siteId: string): Promise<AdminUser[]>
  /** Superuser-only: create a new admin/dashboard account with branch access. */
  createAdmin(siteId: string, input: CreateAdminInput): Promise<AdminUser>
  /** Superuser-only: change a user's branch access, default branch, permission overrides, or role. */
  updateAdminAccess(adminId: string, patch: UpdateAdminAccessInput): Promise<AdminUser>
  /** Superuser-only: edit an admin's basic fields (name/title/email/phone/staff id/role). */
  updateAdmin(adminId: string, patch: UpdateAdminInput): Promise<AdminUser>
  /** Superuser-only: archive/disable/restore an admin. Backend blocks removing the last active superuser. */
  setAdminStatus(adminId: string, status: 'active' | 'disabled' | 'archived'): Promise<AdminUser>

  // ————— Staff photo proof —————
  /** Flattened proof photos the acting admin may view, filtered. Enforces branch access on the backend. */
  listProofPhotos(siteId: string, filter?: ProofPhotoFilter): Promise<ProofPhotoView[]>
  /** Access-checked single photo lookup — returns null if the caller can't view its branch. */
  getProofPhoto(photoId: string): Promise<ProofPhotoView | null>
  /** Set a photo's review status (approve/reject/flag/archive) with an optional note. */
  reviewProofPhoto(photoId: string, status: PhotoReviewStatus, note: string | null): Promise<ProofPhotoView>
  /** Records a photo export in the audit trail — separate permission from viewing. */
  logPhotoExport(siteId: string, detail: string): Promise<void>
  listStaffForSite(siteId: string): Promise<Staff[]>
  setStaffStatus(staffId: string, status: Staff['status']): Promise<Staff>

  /** Throws with a user-facing message on duplicate staff code or email. */
  createStaff(siteId: string, input: CreateStaffInput): Promise<Staff>
  updateStaff(staffId: string, patch: UpdateStaffInput): Promise<Staff>
  resetStaffPin(staffId: string, newPin: string): Promise<void>

  /** This staff member's assignments for today, in route order. */
  getMyAssignments(staffId: string): Promise<Assignment[]>
  getAssignment(id: string): Promise<Assignment | null>
  startAssignment(id: string): Promise<Assignment>
  toggleTask(assignmentId: string, taskId: string): Promise<Assignment>
  addPhoto(assignmentId: string, label: 'before' | 'after', dataUrl: string): Promise<Assignment>
  setNote(assignmentId: string, note: string): Promise<Assignment>
  /** Marks the current cleaning cycle done; if the area has a recurring frequency, generates the next cycle's assignment. */
  submitProof(assignmentId: string): Promise<Assignment>

  /** Open (not-done), unassigned work at a branch — the staff app's "available to pick up" list. */
  listOpenAssignments(branchId: string): Promise<Assignment[]>
  /** Staff claims an unassigned task for themselves. Claim-once: resolves null if someone else got it first. */
  claimAssignment(assignmentId: string, staffId: string): Promise<Assignment | null>
  /** Resolves a tag scanned outside the staff member's route — their route is finished, or they've
   * been sent to cover an area that was never assigned to them — into something they can start:
   * their own open assignment for that area, else an unassigned one they claim, else a fresh ad-hoc
   * task. The area's own checklist is copied onto an ad-hoc task, which has no due time: nobody
   * promised one, so it can't be late. */
  scanArea(staff: Staff, code: string): Promise<ScanAreaResult>

  /** All of today's assignments for a site, assigned and unassigned. */
  getSiteAssignments(siteId: string): Promise<Assignment[]>
  assignStaffToArea(assignmentId: string, staffId: string | null): Promise<Assignment>
  publishRoutes(siteId: string): Promise<void>

  listAreasForSite(siteId: string): Promise<Area[]>
  getArea(id: string): Promise<Area | null>
  /** Public lookup by the code printed/encoded on the physical QR tag — no auth required. */
  getAreaByCode(siteId: string, code: string): Promise<Area | null>
  setAreaFrequency(areaId: string, frequencyMinutes: number | null): Promise<Area>
  /** Throws with a user-facing message on duplicate area code. Also creates today's initial (unassigned) assignment for it. */
  createArea(siteId: string, input: CreateAreaInput): Promise<Area>
  /** Deactivating clears the area's not-yet-done assignments; reactivating spawns a fresh unassigned one. */
  updateArea(areaId: string, patch: UpdateAreaInput): Promise<Area>
  /** Permanently removes an area with no cleaning history. Areas with completed proof, photos,
   * or issues can't be hard-deleted (deactivate those instead) — history must stay auditable. */
  deleteArea(areaId: string): Promise<void>

  // ————— Location categories —————
  /** All categories at the site (active + archived); the UI filters. */
  listCategories(siteId: string): Promise<LocationCategory[]>
  /** Manage-categories permission required. Throws on a duplicate name in the same scope. */
  createCategory(siteId: string, input: CreateCategoryInput): Promise<LocationCategory>
  updateCategory(categoryId: string, patch: UpdateCategoryInput): Promise<LocationCategory>
  /** Archive (active=false) or restore (active=true) a category. */
  setCategoryActive(categoryId: string, active: boolean): Promise<LocationCategory>
  /** Hard-delete — throws with a reassign message if any area still uses it. */
  deleteCategory(categoryId: string): Promise<void>
  /** Bulk-move every area from one category to another; returns how many moved. */
  reassignCategory(fromCategoryId: string, toCategoryId: string): Promise<number>

  // ————— Cleaning benchmarks —————
  listBenchmarks(siteId: string): Promise<Benchmark[]>
  /** Manage-benchmarks permission required (superuser by default). */
  createBenchmark(siteId: string, input: CreateBenchmarkInput): Promise<Benchmark>
  updateBenchmark(benchmarkId: string, patch: UpdateBenchmarkInput): Promise<Benchmark>
  setBenchmarkActive(benchmarkId: string, active: boolean): Promise<Benchmark>
  deleteBenchmark(benchmarkId: string): Promise<void>
  /** Records that a schedule was created with a frequency different from the category's benchmark. */
  logBenchmarkOverride(siteId: string, detail: string): Promise<void>

  /** Staff flags a problem — an alternative (or addition) to marking an area clean. */
  reportIssue(
    assignmentId: string,
    staffId: string,
    description: string,
    severity: IssueSeverity,
  ): Promise<Issue>
  listIssuesForSite(siteId: string): Promise<Issue[]>
  resolveIssue(issueId: string): Promise<Issue>

  /** Accountability trail for privileged admin actions — who did what, when, to what. */
  listAuditLogForSite(siteId: string): Promise<AuditLogEntry[]>
  /** Records a report export in the audit trail — who exported what, when, with which filters/fields. */
  logReportExport(siteId: string, reportLabel: string, detail: string): Promise<void>

  /** Templates this admin owns plus any shared ones at the site. */
  listReportTemplates(siteId: string, adminId: string): Promise<ReportTemplate[]>
  /** Upserts when input.id is provided (must be the owner). */
  saveReportTemplate(siteId: string, adminId: string, input: SaveReportTemplateInput): Promise<ReportTemplate>
  deleteReportTemplate(templateId: string): Promise<void>

  /** Creates new areas and updates existing ones (matched by code) from a validated import file. failedCount is the count of rows the caller already excluded via client-side validation. */
  importAreas(siteId: string, fileName: string, rows: ImportAreaRow[], failedCount: number): Promise<ImportBatch>
  listImportBatches(siteId: string): Promise<ImportBatch[]>

  /** Active templates available to permitted admins; also returns inactive/draft ones so a super admin can manage them. */
  listTaskTemplates(siteId: string): Promise<TaskTemplate[]>
  /** Super Admin only. Upserts when input.id is provided. */
  saveTaskTemplate(siteId: string, input: SaveTaskTemplateInput): Promise<TaskTemplate>
  /** Creates one assignment per selected staff member (or a single unassigned one if none selected). Checklist/type/priority are copied onto each assignment, so later template edits never change history. */
  createTask(siteId: string, input: CreateTaskInput, createdByName: string): Promise<Assignment[]>
  /** Creates a recurring cleaning schedule and generates today's occurrences (as assignment rows). Returns the generated occurrences. Manager+ with branch access. */
  createSchedule(siteId: string, input: CreateScheduleInput, createdByName: string): Promise<Assignment[]>
  /** All cleaning schedules at the site (active, paused, archived), each with its areaIds. */
  listSchedules(siteId: string): Promise<CleaningSchedule[]>
  /** Edit a schedule definition (name/assignee/frequency/recurrence/times/areas). Applies to future generations. */
  updateSchedule(scheduleId: string, patch: UpdateScheduleInput): Promise<CleaningSchedule>
  /** Pause/resume (isActive) and archive/restore (archived) a schedule. Paused/archived schedules stop generating. */
  setScheduleStatus(scheduleId: string, isActive: boolean, archived: boolean): Promise<CleaningSchedule>
  /** Copy a schedule (paused, no occurrences generated). Returns the new schedule. */
  duplicateSchedule(scheduleId: string): Promise<CleaningSchedule>
  /** Generate today's occurrences now for the site's active schedules (idempotent). Returns rows created. Mirrors the daily cron. */
  generateScheduleOccurrences(siteId: string): Promise<number>
  /** Moves a completed task back to Pending. Requires a reason, which is recorded in the audit trail. Throws if the assignment isn't currently done. */
  reopenAssignment(assignmentId: string, reason: string): Promise<Assignment>
  /** Edits a not-yet-completed task's type/priority/due date. Throws if the assignment is already done. */
  updateTaskDetails(assignmentId: string, patch: UpdateTaskInput): Promise<Assignment>
  /** Removes a not-yet-completed task from the board. Requires a reason, which is recorded in the audit trail. Throws if the assignment is already done. */
  cancelAssignment(assignmentId: string, reason: string): Promise<void>

  /** Subscribe to change notifications for a site; call cb() to trigger a refetch. Returns an unsubscribe fn. */
  subscribe(siteId: string, cb: () => void): () => void
}
