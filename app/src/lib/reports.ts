import { AUDIT_ACTION_LABELS, categorySlugLabel, effectiveStatus, formatClock, formatFrequency, ISSUE_SEVERITY_LABELS, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, taskProgress } from './domain'
import type { Area, Assignment, AuditLogEntry, Issue, ReportType, Staff } from './types'

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
  assignments: 'Assignment report',
  staff_performance: 'Staff performance report',
  locations: 'Location report',
  issues: 'Issue report',
  overdue_sla: 'Overdue / SLA report',
  qr_scans: 'QR scan report',
  audit_log: 'Audit log report',
}

export const REPORT_TYPES: ReportType[] = [
  'cleaning_proof',
  'assignments',
  'staff_performance',
  'locations',
  'issues',
  'overdue_sla',
  'qr_scans',
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
}

export const REPORT_FIELDS: Record<ReportType, ReportField[]> = {
  cleaning_proof: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'submittedTime', label: 'Submitted time', category: 'Date & time' },
    { key: 'dueTime', label: 'Due time', category: 'Date & time' },
    { key: 'durationMin', label: 'Time on task (min)', category: 'Date & time' },
    { key: 'onTime', label: 'On time', category: 'SLA' },
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
  assignments: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'dueTime', label: 'Due time', category: 'Date & time' },
    { key: 'submittedTime', label: 'Submitted time', category: 'Date & time' },
    { key: 'status', label: 'Status', category: 'Assignment' },
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
    { key: 'assignedCount', label: 'Assigned', category: 'SLA/performance' },
    { key: 'completedCount', label: 'Completed', category: 'SLA/performance' },
    { key: 'overdueCount', label: 'Overdue', category: 'SLA/performance' },
    { key: 'onTimeRate', label: 'On-time rate %', category: 'SLA/performance' },
  ],
  locations: [
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'category', label: 'Category', category: 'Location' },
    { key: 'frequency', label: 'Cleaning frequency', category: 'Location' },
    { key: 'status', label: 'Status', category: 'Location' },
    { key: 'lastCleanedAt', label: 'Last cleaned', category: 'Date & time' },
    { key: 'cleanedCount', label: 'Cleaned in range', category: 'SLA/performance' },
    { key: 'overdueCount', label: 'Overdue in range', category: 'SLA/performance' },
  ],
  issues: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'time', label: 'Time', category: 'Date & time' },
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Reported by', category: 'Staff' },
    { key: 'severity', label: 'Severity', category: 'Issues' },
    { key: 'status', label: 'Status', category: 'Issues' },
    { key: 'description', label: 'Description', category: 'Issues' },
    { key: 'resolvedTime', label: 'Resolved time', category: 'Issues' },
  ],
  overdue_sla: [
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
    { key: 'dueTime', label: 'Due time', category: 'Date & time' },
    { key: 'status', label: 'Status', category: 'SLA/performance' },
    { key: 'minutesLate', label: 'Minutes late', category: 'SLA/performance' },
  ],
  qr_scans: [
    { key: 'date', label: 'Date', category: 'Date & time' },
    { key: 'scanTime', label: 'Scan time', category: 'Date & time' },
    { key: 'areaName', label: 'Area', category: 'Location' },
    { key: 'areaCode', label: 'Area code', category: 'Location' },
    { key: 'staffName', label: 'Staff', category: 'Staff' },
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

export function defaultFieldsFor(type: ReportType): string[] {
  return REPORT_FIELDS[type].map((f) => f.key)
}

export function buildReportRows(type: ReportType, ctx: ReportContext, range: DateRange): ReportRow[] {
  const areasById = new Map(ctx.areas.map((a) => [a.id, a]))
  const staffById = new Map(ctx.staff.map((s) => [s.id, s]))
  const inRangeAssignments = ctx.assignments.filter((a) => assignmentInRange(a, range))

  switch (type) {
    case 'cleaning_proof':
      return ctx.assignments
        .filter((a) => a.status === 'done' && isoInRange(a.submittedAt, range))
        .map((a) => {
          const area = areasById.get(a.areaId)
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          const { done, total } = taskProgress(a.tasks)
          const onTime = !a.dueAt || (a.submittedAt && new Date(a.submittedAt).getTime() <= new Date(a.dueAt).getTime())
          const durationMin =
            a.startedAt && a.submittedAt ? Math.round((new Date(a.submittedAt).getTime() - new Date(a.startedAt).getTime()) / 60000) : ''
          return {
            date: dateOnly(a.submittedAt),
            submittedTime: formatClock(a.submittedAt),
            dueTime: formatClock(a.dueAt),
            durationMin,
            onTime: onTime ? 'Yes' : 'No',
            areaName: a.areaName,
            areaCode: a.areaCode,
            category: area ? categorySlugLabel(area.category) : '',
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

    case 'assignments':
      return inRangeAssignments.map((a) => {
        const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
        return {
          date: dateOnly(assignmentReportDate(a)),
          dueTime: formatClock(a.dueAt),
          submittedTime: formatClock(a.submittedAt),
          status: effectiveStatus(a),
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
          const onTimeCount = completed.filter((a) => !a.dueAt || (a.submittedAt && new Date(a.submittedAt).getTime() <= new Date(a.dueAt).getTime())).length
          return {
            staffName: s.fullName,
            staffCode: s.staffCode,
            role: s.role,
            assignedCount: mine.length,
            completedCount: completed.length,
            overdueCount: overdue.length,
            onTimeRate: completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 100,
          }
        })
        .filter((row) => row.assignedCount > 0)

    case 'locations':
      return ctx.areas.map((a) => {
        const mine = inRangeAssignments.filter((x) => x.areaId === a.id)
        return {
          areaName: a.name,
          areaCode: a.code,
          category: categorySlugLabel(a.category),
          frequency: formatFrequency(a.frequencyMinutes),
          status: a.active ? 'Active' : 'Inactive',
          lastCleanedAt: formatClock(a.lastCleanedAt),
          cleanedCount: mine.filter((x) => x.status === 'done').length,
          overdueCount: mine.filter((x) => effectiveStatus(x) === 'overdue').length,
        }
      })

    case 'issues':
      return ctx.issues
        .filter((i) => isoInRange(i.createdAt, range))
        .map((i) => ({
          date: dateOnly(i.createdAt),
          time: formatClock(i.createdAt),
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
          const referenceEnd = a.submittedAt ? new Date(a.submittedAt).getTime() : Date.now()
          const minutesLate = a.dueAt ? Math.round((referenceEnd - new Date(a.dueAt).getTime()) / 60000) : ''
          return {
            areaName: a.areaName,
            areaCode: a.areaCode,
            staffName: staffMember?.fullName ?? 'Unassigned',
            dueTime: formatClock(a.dueAt),
            status: effectiveStatus(a),
            minutesLate,
          }
        })

    case 'qr_scans':
      return ctx.assignments
        .filter((a) => isoInRange(a.startedAt, range))
        .map((a) => {
          const staffMember = a.staffId ? staffById.get(a.staffId) : undefined
          return {
            date: dateOnly(a.startedAt),
            scanTime: formatClock(a.startedAt),
            areaName: a.areaName,
            areaCode: a.areaCode,
            staffName: staffMember?.fullName ?? '—',
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
