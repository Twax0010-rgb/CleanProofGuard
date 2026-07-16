import {
  AUDIT_ACTION_LABELS,
  categorySlugLabel,
  effectiveStatus,
  formatClock,
  formatFrequency,
  ISSUE_SEVERITY_LABELS,
  PHOTO_REVIEW_LABELS,
  SCHEDULE_RECURRENCE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  taskProgress,
} from './domain'
import type { Area, Assignment, AuditLogEntry, Benchmark, Branch, CleaningSchedule, Issue, LocationCategory, ReportType, Staff } from './types'

// --- Date ranges -------------------------------------------------------

export type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

export interface DateRange {
  preset: DateRangePreset
  /** Inclusive start of day. */
  start: Date
  /** Exclusive — start of the day after the range ends. */
  end: Date
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range',
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom']

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Monday-start week, matching most operational reporting conventions. */
function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  const day = (r.getDay() + 6) % 7
  return addDays(r, -day)
}

function startOfMonth(d: Date): Date {
  const r = startOfDay(d)
  r.setDate(1)
  return r
}

/** Resolves a preset (using the browser's local time as the operational "site day") into a concrete [start, end) range. */
export function resolveDateRange(preset: DateRangePreset, customStart?: Date, customEnd?: Date, now = new Date()): DateRange {
  const today = startOfDay(now)
  switch (preset) {
    case 'yesterday': {
      const y = addDays(today, -1)
      return { preset, start: y, end: today }
    }
    case 'this_week':
      return { preset, start: startOfWeek(today), end: addDays(today, 1) }
    case 'last_week': {
      const thisWeekStart = startOfWeek(today)
      return { preset, start: addDays(thisWeekStart, -7), end: thisWeekStart }
    }
    case 'this_month':
      return { preset, start: startOfMonth(today), end: addDays(today, 1) }
    case 'last_month': {
      const thisMonthStart = startOfMonth(today)
      return { preset, start: startOfMonth(addDays(thisMonthStart, -1)), end: thisMonthStart }
    }
    case 'custom':
      return { preset, start: startOfDay(customStart ?? today), end: addDays(startOfDay(customEnd ?? today), 1) }
    case 'today':
    default:
      return { preset: 'today', start: today, end: addDays(today, 1) }
  }
}

export function isoInRange(iso: string | null, range: DateRange): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= range.start.getTime() && t < range.end.getTime()
}

export function formatDateRangeLabel(range: DateRange): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const inclusiveEnd = new Date(range.end.getTime() - 1)
  if (range.start.toDateString() === inclusiveEnd.toDateString()) return fmt(range.start)
  return `${fmt(range.start)} – ${fmt(inclusiveEnd)}`
}

/** yyyy-mm-dd in the browser's local time. Ranges are built from local midnight
 * (startOfDay), so formatting via toISOString() would shift the stamp a day off for any
 * non-UTC timezone. This keeps file names and date inputs on the operational "site day". */
export function toLocalDateStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** yyyy-mm-dd, safe to use in exported file names. */
export function dateRangeFileTag(range: DateRange): string {
  const inclusiveEnd = new Date(range.end.getTime() - 1)
  return range.start.toDateString() === inclusiveEnd.toDateString()
    ? toLocalDateStamp(range.start)
    : `${toLocalDateStamp(range.start)}_to_${toLocalDateStamp(inclusiveEnd)}`
}

function dateOnly(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** An assignment's "reporting date" — when it was completed, or when it's/was due. Undated (no due date, not yet done) work only counts under Today. */
function assignmentReportDate(a: Assignment): string | null {
  return a.submittedAt ?? a.dueAt ?? null
}

export function assignmentInRange(a: Assignment, range: DateRange): boolean {
  const d = assignmentReportDate(a)
  return d ? isoInRange(d, range) : range.preset === 'today'
}

export function filterAssignmentsInRange(assignments: Assignment[], range: DateRange): Assignment[] {
  return assignments.filter((a) => assignmentInRange(a, range))
}

export function filterIssuesInRange(issues: Issue[], range: DateRange): Issue[] {
  return issues.filter((i) => isoInRange(i.createdAt, range))
}

// --- Report field/row model --------------------------------------------

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  cleaning_proof: 'Cleaning proof report',
  scheduled_clean: 'Scheduled-clean report',
  schedule_compliance: 'Schedule compliance report',
  assignments: 'Assignment report',
  staff_performance: 'Staff performance report',
  locations: 'Location report',
  issues: 'Issue report',
  overdue_sla: 'Overdue / SLA report',
  photo_proof: 'Photo proof report',
  qr_scans: 'QR scan report',
  benchmarks: 'Benchmark report',
  audit_log: 'Audit log report',
}

/** One line of "what this report answers", shown under the type picker. */
export const REPORT_TYPE_HINTS: Record<ReportType, string> = {
  cleaning_proof: 'Every completed clean with its proof',
  scheduled_clean: 'Every scheduled occurrence — done, missed or still due',
  schedule_compliance: 'Per schedule: required vs done, against the benchmark',
  assignments: 'All work on the board, whatever its state',
  staff_performance: 'Per staff member: assigned, completed, on-time',
  locations: 'Per area: frequency, last clean, activity in range',
  issues: 'Problems staff reported, and whether they were resolved',
  overdue_sla: 'Work that blew its due time',
  photo_proof: 'Every before/after photo and its review state',
  qr_scans: 'Where and when staff scanned in',
  benchmarks: 'The cleaning-frequency standards themselves',
  audit_log: 'Who changed what, for accountability',
}

export const REPORT_TYPES: ReportType[] = [
  'cleaning_proof',
  'scheduled_clean',
  'schedule_compliance',
  'assignments',
  'staff_performance',
  'locations',
  'issues',
  'overdue_sla',
  'photo_proof',
  'qr_scans',
  'benchmarks',
  'audit_log',
]

export interface ReportField {
  key: string
  label: string
  category: string
}

export type ReportRow = Record<string, string | number>

export interface ReportContext {
  assignments: Assignment[]
  areas: Area[]
  staff: Staff[]
  issues: Issue[]
  auditLog: AuditLogEntry[]
  branches: Branch[]
  schedules: CleaningSchedule[]
  benchmarks: Benchmark[]
  categories: LocationCategory[]
}

// --- Scheduled-clean helpers -------------------------------------------

/** What actually happened to a scheduled occurrence. "Missed" is not a stored status: an occurrence
 * whose due time has passed while it's still to-do reads as overdue, and once its day is over that
 * overdue occurrence is a miss. Anything still due later today is simply pending. */
export type OccurrenceOutcome = 'Completed' | 'Missed' | 'In progress' | 'Pending'

export function occurrenceOutcome(a: Assignment, now = Date.now()): OccurrenceOutcome {
  if (a.status === 'done') return 'Completed'
  if (a.status === 'in_progress') return 'In progress'
  return effectiveStatus(a, now) === 'overdue' ? 'Missed' : 'Pending'
}

export function isOnTime(a: Assignment): boolean {
  return !a.dueAt || !a.submittedAt || new Date(a.submittedAt).getTime() <= new Date(a.dueAt).getTime()
}

/** How many minutes past due the clean landed (or, if it never landed, how late it is now). */
function minutesLate(a: Assignment, now = Date.now()): number | '' {
  if (!a.dueAt) return ''
  const end = a.submittedAt ? new Date(a.submittedAt).getTime() : now
  const late = Math.round((end - new Date(a.dueAt).getTime()) / 60000)
  return late > 0 ? late : 0
}

/** The benchmark that applies to a piece of work: the most specific active one wins — a benchmark
 * pinned to the area beats one scoped to its branch, which beats the category's global default.
 * Returns undefined when the category has no benchmark set at all. */
export function resolveBenchmark(
  scope: { categoryId: string | null; branchId: string | null; areaId?: string | null },
  benchmarks: Benchmark[],
): Benchmark | undefined {
  const active = benchmarks.filter((b) => b.isActive && !b.archivedAt)
  const sameCategory = (b: Benchmark) => !!scope.categoryId && b.categoryId === scope.categoryId
  return (
    (scope.areaId ? active.find((b) => b.areaId === scope.areaId) : undefined) ??
    (scope.branchId ? active.find((b) => sameCategory(b) && b.branchId === scope.branchId) : undefined) ??
    active.find((b) => sameCategory(b) && b.isGlobal)
  )
}

/** Yes/No against the benchmark's required cleans per day — '—' when the category has no benchmark. */
function benchmarkVerdict(actualCleans: number | null, benchmark: Benchmark | undefined): string {
  if (!benchmark || actualCleans === null) return '—'
  return actualCleans >= benchmark.requiredCleansPerDay ? 'Yes' : 'No'
}

/** Branch columns, offered on every report so an all-branches export is still readable. */
const BRANCH_FIELDS: ReportField[] = [
  { key: 'branchName', label: 'Branch', category: 'Branch' },
  { key: 'branchCode', label: 'Branch code', category: 'Branch' },
]

export const REPORT_FIELDS: Record<ReportType, ReportField[]> = {
  cleaning_proof: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'submittedTime', label: 'Submitted time', category: 'Date & time' },
    { key: 'dueTime', label: 'Due time', category: 'Date & time' },
    { key: 'durationMin', label: 'Time on task (min)', category: 'Date & time' },
    { key: 'onTime', label: 'On time', category: 'SLA' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'category', label: 'Category', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'staffCode', label: 'Staff ID', category: 'Staff' },
    { key: 'taskType', label: 'Task type', category: 'Task' },
    { key: 'priority', label: 'Priority', category: 'Task' },
    { key: 'templateName', label: 'Template', category: 'Task' },
    { key: 'tasksCompleted', label: 'Tasks completed', category: 'Cleaning proof' },
    { key: 'photoCount', label: 'Photo count', category: 'Cleaning proof' },
    { key: 'notes', label: 'Notes', category: 'Cleaning proof' },
  ],
  scheduled_clean: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'dueTime', label: 'Due by', category: 'Date & time' },
    { key: 'submittedTime', label: 'Cleaned at', category: 'Date & time' },
    { key: 'durationMin', label: 'Time on task (min)', category: 'Date & time' },
    { key: 'outcome', label: 'Outcome', category: 'Schedule' },
    { key: 'scheduleName', label: 'Schedule', category: 'Schedule' },
    { key: 'occurrence', label: 'Occurrence', category: 'Schedule' },
    { key: 'occurrenceNumber', label: 'Occurrence no.', category: 'Schedule' },
    { key: 'occurrenceTotal', label: 'Cleans required/day', category: 'Schedule' },
    { key: 'recurrence', label: 'Recurrence', category: 'Schedule' },
    { key: 'shift', label: 'Shift', category: 'Schedule' },
    { key: 'onTime', label: 'On time', category: 'SLA' },
    { key: 'minutesLate', label: 'Minutes late', category: 'SLA' },
    { key: 'benchmarkCleans', label: 'Benchmark cleans/day', category: 'SLA' },
    { key: 'meetsBenchmark', label: 'Meets benchmark', category: 'SLA' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'category', label: 'Category', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'staffCode', label: 'Staff ID', category: 'Staff' },
    { key: 'tasksCompleted', label: 'Tasks completed', category: 'Cleaning proof' },
    { key: 'photoCount', label: 'Photo count', category: 'Cleaning proof' },
    { key: 'photoRequired', label: 'Photo required', category: 'Cleaning proof' },
    { key: 'notes', label: 'Notes', category: 'Cleaning proof' },
  ],
  schedule_compliance: [
    { key: 'scheduleName', label: 'Schedule', category: 'Schedule' },
    { key: 'scheduleStatus', label: 'Schedule status', category: 'Schedule' },
    { key: 'recurrence', label: 'Recurrence', category: 'Schedule' },
    { key: 'shift', label: 'Shift', category: 'Schedule' },
    { key: 'window', label: 'Shift window', category: 'Schedule' },
    { key: 'areaCount', label: 'Areas', category: 'Schedule' },
    ...BRANCH_FIELDS,
    { key: 'category', label: 'Category', category: 'Location' },
    { key: 'staffName', label: 'Assigned to', category: 'Staff' },
    { key: 'requiredCleans', label: 'Cleans required/day', category: 'Compliance' },
    { key: 'occurrencesDue', label: 'Occurrences due', category: 'Compliance' },
    { key: 'completedCount', label: 'Completed', category: 'Compliance' },
    { key: 'missedCount', label: 'Missed', category: 'Compliance' },
    { key: 'pendingCount', label: 'Still due', category: 'Compliance' },
    { key: 'complianceRate', label: 'Compliance %', category: 'Compliance' },
    { key: 'onTimeRate', label: 'On-time %', category: 'Compliance' },
    { key: 'benchmarkCleans', label: 'Benchmark cleans/day', category: 'Compliance' },
    { key: 'meetsBenchmark', label: 'Meets benchmark', category: 'Compliance' },
  ],
  assignments: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'dueTime', label: 'Due time', category: 'Date & time' },
    { key: 'submittedTime', label: 'Submitted time', category: 'Date & time' },
    { key: 'status', label: 'Status', category: 'Assignment' },
    { key: 'source', label: 'Source', category: 'Assignment' },
    { key: 'scheduleName', label: 'Schedule', category: 'Assignment' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'sortOrder', label: 'Route order', category: 'Assignment' },
    { key: 'taskType', label: 'Task type', category: 'Task' },
    { key: 'priority', label: 'Priority', category: 'Task' },
    { key: 'templateName', label: 'Template', category: 'Task' },
    { key: 'createdByName', label: 'Created by', category: 'Task' },
  ],
  staff_performance: [
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'staffCode', label: 'Staff ID', category: 'Staff' },
    { key: 'role', label: 'Role', category: 'Staff' },
    ...BRANCH_FIELDS,
    { key: 'assignedCount', label: 'Assigned', category: 'SLA/performance' },
    { key: 'completedCount', label: 'Completed', category: 'SLA/performance' },
    { key: 'overdueCount', label: 'Overdue', category: 'SLA/performance' },
    { key: 'onTimeRate', label: 'On-time rate %', category: 'SLA/performance' },
    { key: 'scheduledAssigned', label: 'Scheduled cleans due', category: 'Scheduled work' },
    { key: 'scheduledCompleted', label: 'Scheduled cleans done', category: 'Scheduled work' },
    { key: 'scheduledMissed', label: 'Scheduled cleans missed', category: 'Scheduled work' },
  ],
  locations: [
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'category', label: 'Category', category: 'Location' },
    ...BRANCH_FIELDS,
    { key: 'frequency', label: 'Cleaning frequency', category: 'Location' },
    { key: 'status', label: 'Status', category: 'Location' },
    { key: 'lastCleanedAt', label: 'Last cleaned', category: 'Date & time' },
    { key: 'cleanedCount', label: 'Cleaned in range', category: 'SLA/performance' },
    { key: 'overdueCount', label: 'Overdue in range', category: 'SLA/performance' },
    { key: 'benchmarkCleans', label: 'Benchmark cleans/day', category: 'SLA/performance' },
  ],
  issues: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'time', label: 'Time', category: 'Date & time' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Reported by', category: 'Staff' },
    { key: 'severity', label: 'Severity', category: 'Issues' },
    { key: 'status', label: 'Status', category: 'Issues' },
    { key: 'description', label: 'Description', category: 'Issues' },
    { key: 'resolvedTime', label: 'Resolved time', category: 'Issues' },
  ],
  overdue_sla: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'dueTime', label: 'Due time', category: 'Date & time' },
    { key: 'status', label: 'Status', category: 'SLA/performance' },
    { key: 'minutesLate', label: 'Minutes late', category: 'SLA/performance' },
    { key: 'source', label: 'Source', category: 'SLA/performance' },
    { key: 'scheduleName', label: 'Schedule', category: 'SLA/performance' },
  ],
  photo_proof: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'submittedTime', label: 'Submitted time', category: 'Date & time' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'category', label: 'Category', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'label', label: 'Shot', category: 'Photo' },
    { key: 'reviewStatus', label: 'Review status', category: 'Photo' },
    { key: 'reviewedByName', label: 'Reviewed by', category: 'Photo' },
    { key: 'reviewNote', label: 'Review note', category: 'Photo' },
    { key: 'scheduleName', label: 'Schedule', category: 'Photo' },
    { key: 'notes', label: 'Staff notes', category: 'Photo' },
  ],
  qr_scans: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'scanTime', label: 'Scan time', category: 'Date & time' },
    ...BRANCH_FIELDS,
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
  ],
  benchmarks: [
    { key: 'name', label: 'Benchmark', category: 'Benchmark' },
    { key: 'scope', label: 'Scope', category: 'Benchmark' },
    ...BRANCH_FIELDS,
    { key: 'category', label: 'Category', category: 'Location' },
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'requiredCleans', label: 'Cleans required/day', category: 'Benchmark' },
    { key: 'interval', label: 'Interval', category: 'Benchmark' },
    { key: 'photoRequired', label: 'Photo required', category: 'Benchmark' },
    { key: 'status', label: 'Status', category: 'Benchmark' },
    { key: 'areasCovered', label: 'Areas covered', category: 'Benchmark' },
    { key: 'createdAt', label: 'Created', category: 'Date & time' },
  ],
  audit_log: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'time', label: 'Time', category: 'Date & time' },
    { key: 'actorName', label: 'Actor', category: 'Audit' },
    { key: 'action', label: 'Action', category: 'Audit' },
    { key: 'targetLabel', label: 'Target', category: 'Audit' },
    { key: 'detail', label: 'Detail', category: 'Audit' },
  ],
}

/** The columns a report opens with. Every field stays available in the picker — these are just the
 * ones that answer the question on their own, so a report is useful before anyone configures it. */
const REPORT_DEFAULT_FIELDS: Record<ReportType, string[]> = {
  cleaning_proof: ['date', 'submittedTime', 'dueTime', 'onTime', 'areaName', 'areaCode', 'category', 'staffName', 'tasksCompleted', 'photoCount'],
  scheduled_clean: ['date', 'scheduleName', 'occurrence', 'areaName', 'areaCode', 'dueTime', 'submittedTime', 'outcome', 'onTime', 'staffName', 'photoCount'],
  schedule_compliance: [
    'scheduleName', 'branchName', 'category', 'areaCount', 'staffName', 'requiredCleans',
    'occurrencesDue', 'completedCount', 'missedCount', 'complianceRate', 'benchmarkCleans', 'meetsBenchmark',
  ],
  assignments: ['date', 'dueTime', 'submittedTime', 'status', 'source', 'areaName', 'areaCode', 'staffName', 'taskType', 'priority'],
  staff_performance: ['staffName', 'staffCode', 'role', 'assignedCount', 'completedCount', 'overdueCount', 'onTimeRate'],
  locations: ['areaName', 'areaCode', 'category', 'frequency', 'status', 'lastCleanedAt', 'cleanedCount', 'overdueCount'],
  issues: ['date', 'time', 'areaName', 'areaCode', 'staffName', 'severity', 'status', 'description'],
  overdue_sla: ['date', 'areaName', 'areaCode', 'staffName', 'dueTime', 'status', 'minutesLate', 'source'],
  photo_proof: ['date', 'submittedTime', 'areaName', 'areaCode', 'staffName', 'label', 'reviewStatus', 'reviewedByName'],
  qr_scans: ['date', 'scanTime', 'areaName', 'areaCode', 'staffName'],
  benchmarks: ['name', 'scope', 'category', 'requiredCleans', 'interval', 'photoRequired', 'status', 'areasCovered'],
  audit_log: ['date', 'time', 'actorName', 'action', 'targetLabel', 'detail'],
}

export function defaultFieldsFor(type: ReportType): string[] {
  return [...REPORT_DEFAULT_FIELDS[type]]
}

export function buildReportRows(type: ReportType, ctx: ReportContext, range: DateRange): ReportRow[] {
  const areasById = new Map(ctx.areas.map((a) => [a.id, a]))
  const staffById = new Map(ctx.staff.map((s) => [s.id, s]))
  const branchesById = new Map(ctx.branches.map((b) => [b.id, b]))
  const schedulesById = new Map(ctx.schedules.map((s) => [s.id, s]))
  const categoriesById = new Map(ctx.categories.map((c) => [c.id, c]))
  const inRangeAssignments = ctx.assignments.filter((a) => assignmentInRange(a, range))

  /** Branch columns for any row that carries a branch id. */
  const branchCols = (branchId: string | null) => {
    const b = branchId ? branchesById.get(branchId) : undefined
    return { branchName: b?.name ?? 'All branches', branchCode: b?.code ?? '' }
  }

  /** The category's current name, falling back to the denormalized slug for unlinked/legacy areas. */
  const categoryLabel = (area: Area | undefined): string => {
    if (!area) return ''
    const linked = area.categoryId ? categoriesById.get(area.categoryId) : undefined
    return linked?.name ?? categorySlugLabel(area.category)
  }

  const scheduleName = (a: Assignment): string => (a.scheduleId ? schedulesById.get(a.scheduleId)?.name ?? 'Deleted schedule' : '')

  const durationMinutes = (a: Assignment): number | '' =>
    a.startedAt && a.submittedAt ? Math.round((new Date(a.submittedAt).getTime() - new Date(a.startedAt).getTime()) / 60000) : ''

  switch (type) {
    case 'cleaning_proof':
      return ctx.assignments
        .filter((a) => a.status === 'done' && isoInRange(a.submittedAt, range))
        .map((a) => {
          const area = areasById.get(a.areaId)
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          const { done, total } = taskProgress(a.tasks)
          return {
            date: dateOnly(a.submittedAt),
            submittedTime: formatClock(a.submittedAt),
            dueTime: formatClock(a.dueAt),
            durationMin: durationMinutes(a),
            onTime: isOnTime(a) ? 'Yes' : 'No',
            ...branchCols(a.branchId),
            areaName: a.areaName,
            areaCode: a.areaCode,
            category: categoryLabel(area),
            staffName: staffMember?.fullName ?? '—',
            staffCode: staffMember?.staffCode ?? '',
            taskType: TASK_TYPE_LABELS[a.taskType],
            priority: TASK_PRIORITY_LABELS[a.priority],
            templateName: a.templateName ?? '',
            tasksCompleted: `${done}/${total}`,
            photoCount: a.photos.length,
            notes: a.note ?? '',
          }
        })

    case 'scheduled_clean':
      return inRangeAssignments
        .filter((a) => !!a.scheduleId)
        .sort(
          (x, y) =>
            new Date(x.dueAt ?? 0).getTime() - new Date(y.dueAt ?? 0).getTime() ||
            (x.occurrenceNumber ?? 0) - (y.occurrenceNumber ?? 0),
        )
        .map((a) => {
          const area = areasById.get(a.areaId)
          const schedule = a.scheduleId ? schedulesById.get(a.scheduleId) : undefined
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          const { done, total } = taskProgress(a.tasks)
          const benchmark = resolveBenchmark(
            { categoryId: area?.categoryId ?? null, branchId: a.branchId, areaId: a.areaId },
            ctx.benchmarks,
          )
          return {
            date: dateOnly(assignmentReportDate(a)),
            dueTime: formatClock(a.dueAt),
            submittedTime: formatClock(a.submittedAt),
            durationMin: durationMinutes(a),
            outcome: occurrenceOutcome(a),
            scheduleName: scheduleName(a),
            occurrence: a.occurrenceNumber && a.occurrenceTotal ? `${a.occurrenceNumber} of ${a.occurrenceTotal}` : '',
            occurrenceNumber: a.occurrenceNumber ?? '',
            occurrenceTotal: a.occurrenceTotal ?? '',
            recurrence: schedule ? SCHEDULE_RECURRENCE_LABELS[schedule.recurrenceType] : '',
            shift: schedule?.shift ?? '',
            // A clean that hasn't been submitted yet is neither on time nor late — it's still open.
            onTime: a.submittedAt ? (isOnTime(a) ? 'Yes' : 'No') : '—',
            minutesLate: minutesLate(a),
            benchmarkCleans: benchmark?.requiredCleansPerDay ?? '—',
            meetsBenchmark: benchmarkVerdict(a.occurrenceTotal, benchmark),
            ...branchCols(a.branchId),
            areaName: a.areaName,
            areaCode: a.areaCode,
            category: categoryLabel(area),
            staffName: staffMember?.fullName ?? 'Unassigned',
            staffCode: staffMember?.staffCode ?? '',
            tasksCompleted: `${done}/${total}`,
            photoCount: a.photos.length,
            photoRequired: a.requirePhoto ? 'Yes' : 'No',
            notes: a.note ?? '',
          }
        })

    case 'schedule_compliance':
      return ctx.schedules
        .map((s) => {
          const occurrences = inRangeAssignments.filter((a) => a.scheduleId === s.id)
          const completed = occurrences.filter((a) => a.status === 'done')
          const missed = occurrences.filter((a) => occurrenceOutcome(a) === 'Missed')
          const onTimeCount = completed.filter(isOnTime).length
          const benchmark = resolveBenchmark({ categoryId: s.categoryId, branchId: s.branchId }, ctx.benchmarks)
          const assignee = s.assignedUserId ? staffById.get(s.assignedUserId) : undefined
          const category = s.categoryId ? categoriesById.get(s.categoryId) : undefined
          return {
            scheduleName: s.name,
            scheduleStatus: s.archivedAt ? 'Archived' : s.isActive ? 'Active' : 'Paused',
            recurrence: SCHEDULE_RECURRENCE_LABELS[s.recurrenceType],
            shift: s.shift ?? '',
            window: `${s.startTime}–${s.endTime}`,
            areaCount: s.areaIds.length,
            ...branchCols(s.branchId),
            category: category?.name ?? 'All categories',
            staffName: assignee?.fullName ?? 'Unassigned',
            requiredCleans: s.requiredCleansPerDay,
            occurrencesDue: occurrences.length,
            completedCount: completed.length,
            missedCount: missed.length,
            pendingCount: occurrences.length - completed.length - missed.length,
            complianceRate: occurrences.length > 0 ? Math.round((completed.length / occurrences.length) * 100) : 0,
            onTimeRate: completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 0,
            benchmarkCleans: benchmark?.requiredCleansPerDay ?? '—',
            meetsBenchmark: benchmarkVerdict(s.requiredCleansPerDay, benchmark),
            // Sorting handle only — not an exposed field.
            _live: s.isActive && !s.archivedAt ? 1 : 0,
          }
        })
        // An active schedule that generated nothing in range is itself a finding, so it stays;
        // a long-archived one with no occurrences is just noise.
        .filter((row) => row.occurrencesDue > 0 || row._live === 1)
        .sort((a, b) => a.complianceRate - b.complianceRate || b.occurrencesDue - a.occurrencesDue)
        .map(({ _live, ...row }) => row)

    case 'assignments':
      return inRangeAssignments.map((a) => {
        const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
        return {
          date: dateOnly(assignmentReportDate(a)),
          dueTime: formatClock(a.dueAt),
          submittedTime: formatClock(a.submittedAt),
          status: effectiveStatus(a),
          source: a.scheduleId ? 'Scheduled' : 'One-off',
          scheduleName: scheduleName(a),
          ...branchCols(a.branchId),
          areaName: a.areaName,
          areaCode: a.areaCode,
          staffName: staffMember?.fullName ?? 'Unassigned',
          taskType: TASK_TYPE_LABELS[a.taskType],
          priority: TASK_PRIORITY_LABELS[a.priority],
          templateName: a.templateName ?? '',
          createdByName: a.createdByName ?? '',
          sortOrder: a.sortOrder,
        }
      })

    case 'staff_performance':
      return ctx.staff
        .map((s) => {
          const mine = inRangeAssignments.filter((a) => a.staffId === s.id)
          const completed = mine.filter((a) => a.status === 'done')
          const overdue = mine.filter((a) => effectiveStatus(a) === 'overdue')
          const onTimeCount = completed.filter(isOnTime).length
          const scheduled = mine.filter((a) => !!a.scheduleId)
          return {
            staffName: s.fullName,
            staffCode: s.staffCode,
            role: s.role,
            ...branchCols(s.branchId),
            assignedCount: mine.length,
            completedCount: completed.length,
            overdueCount: overdue.length,
            onTimeRate: completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 100,
            scheduledAssigned: scheduled.length,
            scheduledCompleted: scheduled.filter((a) => a.status === 'done').length,
            scheduledMissed: scheduled.filter((a) => occurrenceOutcome(a) === 'Missed').length,
          }
        })
        .filter((row) => row.assignedCount > 0)

    case 'locations':
      return ctx.areas.map((a) => {
        const mine = inRangeAssignments.filter((x) => x.areaId === a.id)
        const benchmark = resolveBenchmark({ categoryId: a.categoryId, branchId: a.branchId, areaId: a.id }, ctx.benchmarks)
        return {
          areaName: a.name,
          areaCode: a.code,
          category: categoryLabel(a),
          ...branchCols(a.branchId),
          frequency: formatFrequency(a.frequencyMinutes),
          status: a.active ? 'Active' : 'Inactive',
          lastCleanedAt: formatClock(a.lastCleanedAt),
          cleanedCount: mine.filter((x) => x.status === 'done').length,
          overdueCount: mine.filter((x) => effectiveStatus(x) === 'overdue').length,
          benchmarkCleans: benchmark?.requiredCleansPerDay ?? '—',
        }
      })

    case 'issues':
      return ctx.issues
        .filter((i) => isoInRange(i.createdAt, range))
        .map((i) => ({
          date: dateOnly(i.createdAt),
          time: formatClock(i.createdAt),
          ...branchCols(i.branchId),
          areaName: i.areaName,
          areaCode: i.areaCode,
          staffName: i.staffName ?? 'Unknown',
          severity: ISSUE_SEVERITY_LABELS[i.severity],
          status: i.status === 'open' ? 'Open' : 'Resolved',
          description: i.description,
          resolvedTime: i.resolvedAt ? formatClock(i.resolvedAt) : '',
        }))

    case 'overdue_sla':
      return inRangeAssignments
        .filter((a) => {
          const status = effectiveStatus(a)
          if (status === 'overdue') return true
          return a.status === 'done' && !!a.dueAt && !!a.submittedAt && new Date(a.submittedAt).getTime() > new Date(a.dueAt).getTime()
        })
        .map((a) => {
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          return {
            date: dateOnly(assignmentReportDate(a)),
            ...branchCols(a.branchId),
            areaName: a.areaName,
            areaCode: a.areaCode,
            staffName: staffMember?.fullName ?? 'Unassigned',
            dueTime: formatClock(a.dueAt),
            status: effectiveStatus(a),
            minutesLate: minutesLate(a),
            source: a.scheduleId ? 'Scheduled' : 'One-off',
            scheduleName: scheduleName(a),
          }
        })

    case 'photo_proof':
      return ctx.assignments
        .filter((a) => a.photos.length > 0 && isoInRange(a.submittedAt, range))
        .flatMap((a) => {
          const area = areasById.get(a.areaId)
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          return a.photos.map((p) => ({
            date: dateOnly(a.submittedAt),
            submittedTime: formatClock(a.submittedAt),
            ...branchCols(a.branchId),
            areaName: a.areaName,
            areaCode: a.areaCode,
            category: categoryLabel(area),
            staffName: staffMember?.fullName ?? '—',
            label: p.label === 'before' ? 'Before' : 'After',
            reviewStatus: PHOTO_REVIEW_LABELS[p.reviewStatus ?? 'pending'],
            reviewedByName: p.reviewedByName ?? '',
            reviewNote: p.reviewNote ?? '',
            scheduleName: scheduleName(a),
            notes: a.note ?? '',
          }))
        })

    case 'qr_scans':
      return ctx.assignments
        .filter((a) => isoInRange(a.startedAt, range))
        .map((a) => {
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          return {
            date: dateOnly(a.startedAt),
            scanTime: formatClock(a.startedAt),
            ...branchCols(a.branchId),
            areaName: a.areaName,
            areaCode: a.areaCode,
            staffName: staffMember?.fullName ?? '—',
          }
        })

    case 'benchmarks':
      // A reference report: benchmarks are standing standards, so the date range doesn't filter them.
      return ctx.benchmarks.map((b) => {
        const area = b.areaId ? areasById.get(b.areaId) : undefined
        const category = b.categoryId ? categoriesById.get(b.categoryId) : undefined
        const covered = ctx.areas.filter(
          (a) =>
            (b.areaId ? a.id === b.areaId : !!b.categoryId && a.categoryId === b.categoryId) &&
            (b.branchId ? a.branchId === b.branchId : true),
        )
        return {
          name: b.name,
          scope: b.areaId ? 'Area' : b.branchId ? 'Branch' : b.isGlobal ? 'Global' : 'Category',
          ...branchCols(b.branchId),
          category: category?.name ?? '—',
          areaName: area?.name ?? '—',
          requiredCleans: b.requiredCleansPerDay,
          interval: b.intervalMinutes ? formatFrequency(b.intervalMinutes) : '—',
          photoRequired: b.photoRequired ? 'Yes' : 'No',
          status: b.archivedAt ? 'Archived' : b.isActive ? 'Active' : 'Inactive',
          areasCovered: covered.length,
          createdAt: dateOnly(b.createdAt),
        }
      })

    case 'audit_log':
      return ctx.auditLog
        .filter((e) => isoInRange(e.createdAt, range))
        .map((e) => ({
          date: dateOnly(e.createdAt),
          time: formatClock(e.createdAt),
          actorName: e.actorName,
          action: AUDIT_ACTION_LABELS[e.action],
          targetLabel: e.targetLabel,
          detail: e.detail ?? '',
        }))
  }
}

// --- Presets -----------------------------------------------------------

/** Pins a report to rows whose column matches exactly — how a preset says "only the missed ones"
 * without the user having to read a filter language. Shown as a chip they can drop. */
export interface ReportRowFilter {
  key: string
  value: string
  label: string
}

/** A ready-made report: the question, already configured. Unlike a saved template (an admin's own
 * work, stored in the backend), these ship with the app and are the same for everyone. */
export interface ReportPreset {
  id: string
  name: string
  description: string
  reportType: ReportType
  range: DateRangePreset
  fields?: string[]
  groupBy?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  filter?: ReportRowFilter
}

export const REPORT_PRESETS: ReportPreset[] = [
  {
    id: 'scheduled_today',
    name: "Today's scheduled cleans",
    description: 'Every occurrence due today and how it went',
    reportType: 'scheduled_clean',
    range: 'today',
    groupBy: 'scheduleName',
  },
  {
    id: 'missed_cleans',
    name: 'Missed scheduled cleans',
    description: 'Occurrences whose due time passed with the clean still open',
    reportType: 'scheduled_clean',
    range: 'this_week',
    // "Cleaned at" and "On time" are always blank on a miss — show how late it ran instead.
    fields: ['date', 'scheduleName', 'occurrence', 'areaName', 'areaCode', 'category', 'dueTime', 'minutesLate', 'staffName'],
    groupBy: 'scheduleName',
    sortBy: 'minutesLate',
    sortDir: 'desc',
    filter: { key: 'outcome', value: 'Missed', label: 'Missed only' },
  },
  {
    id: 'benchmark_compliance',
    name: 'Benchmark compliance',
    description: 'Per schedule: cleans done vs required, against the benchmark',
    reportType: 'schedule_compliance',
    range: 'this_week',
  },
  {
    id: 'proof_pack',
    name: "Today's proof pack",
    description: 'Completed cleans with their proof, for a daily sign-off',
    reportType: 'cleaning_proof',
    range: 'today',
    groupBy: 'staffName',
  },
  {
    id: 'photos_to_review',
    name: 'Photos awaiting review',
    description: 'Proof shots nobody has approved or rejected yet',
    reportType: 'photo_proof',
    range: 'this_week',
    filter: { key: 'reviewStatus', value: PHOTO_REVIEW_LABELS.pending, label: 'Pending review only' },
  },
  {
    id: 'late_finishes',
    name: 'Late finishes',
    description: 'Work that blew its due time, worst first',
    reportType: 'overdue_sla',
    range: 'this_week',
    sortBy: 'minutesLate',
    sortDir: 'desc',
  },
  {
    id: 'staff_scorecard',
    name: 'Staff scorecard',
    description: "Each cleaner's workload and on-time rate for the week",
    reportType: 'staff_performance',
    range: 'this_week',
    sortBy: 'onTimeRate',
    sortDir: 'asc',
  },
]
