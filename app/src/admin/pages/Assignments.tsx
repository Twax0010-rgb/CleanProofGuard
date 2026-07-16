import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { DateRangePicker } from '../../components/ui/DateRangePicker'
import { ModalShell } from '../../components/ui/Modal'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { canManageTemplates, activeStaff, canManageRoutes, effectiveStatus, formatClock, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '../../lib/domain'
import { repo } from '../../lib/repo'
import { filterAssignmentsInRange, formatDateRangeLabel, resolveDateRange } from '../../lib/reports'
import type { DateRange } from '../../lib/reports'
import { deriveTransitPeriods, formatTransit, idleNow } from '../../lib/transit'
import type { Area, Assignment, Benchmark, CleaningSchedule, LocationCategory, Staff, TaskPriority, TaskTemplate, TaskType } from '../../lib/types'
import { Field, inputCls } from '../../components/ui/Modal'
import { AdminLayout } from '../AdminLayout'
import { CreateTaskModal } from '../CreateTaskModal'
import { ManageTaskTemplatesModal } from '../ManageTaskTemplatesModal'
import { ScheduleTaskModal } from '../ScheduleTaskModal'
import { SchedulesPanel } from './SchedulesPanel'

const UNASSIGNED = '__unassigned__'

const TASK_TYPES: TaskType[] = ['cleaning', 'inspection', 'restock', 'maintenance', 'issue_followup', 'custom']
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

/** yyyy-mm-ddThh:mm in local time, for a datetime-local input; empty string if no due date. */
function toDateTimeInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface PendingReassign {
  assignment: Assignment
  targetStaffId: string | null
  targetName: string
}

export function Assignments() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch, branches } = useBranch()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [categories, setCategories] = useState<LocationCategory[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [schedules, setSchedules] = useState<CleaningSchedule[]>([])
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [view, setView] = useState<'board' | 'schedules'>('board')
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [published, setPublished] = useState(false)
  const [pendingReassign, setPendingReassign] = useState<PendingReassign | null>(null)
  const [range, setRange] = useState<DateRange>(() => resolveDateRange('today'))
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [scheduleTaskOpen, setScheduleTaskOpen] = useState(false)
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false)
  const [reopenTarget, setReopenTarget] = useState<Assignment | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [reopening, setReopening] = useState(false)
  const [editTarget, setEditTarget] = useState<Assignment | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Assignment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([
        repo.getSiteAssignments(admin!.siteId),
        repo.listStaffForSite(admin!.siteId),
        repo.listAreasForSite(admin!.siteId),
        repo.listTaskTemplates(admin!.siteId),
        repo.listCategories(admin!.siteId),
        repo.listBenchmarks(admin!.siteId),
        repo.listSchedules(admin!.siteId),
      ]).then(([a, s, ar, t, c, bm, sch]) => {
        setAssignments(a)
        setStaff(s)
        setAreas(ar)
        setTemplates(t)
        setCategories(c)
        setBenchmarks(bm)
        setSchedules(sch)
        setLoading(false)
      })
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  const branchStaff = useMemo(() => staff.filter((s) => inActiveBranch(s.branchId, activeBranchId)), [staff, activeBranchId])
  const branchAssignments = useMemo(() => assignments.filter((a) => inActiveBranch(a.branchId, activeBranchId)), [assignments, activeBranchId])
  const onShiftStaff = useMemo(() => activeStaff(branchStaff).filter((s) => s.status !== 'off_shift'), [branchStaff])
  const rangeAssignments = useMemo(() => filterAssignmentsInRange(branchAssignments, range), [branchAssignments, range])
  const unassigned = rangeAssignments.filter((a) => !a.staffId)
  const activeAssignment = rangeAssignments.find((a) => a.id === activeId) ?? null
  const isToday = range.preset === 'today'
  // For a past range, show whoever actually had work that day (even if now off-shift)
  // instead of the live on-shift roster, which wouldn't reflect historical assignees.
  const boardStaff = useMemo(() => {
    if (isToday) return onShiftStaff
    const assignedIds = new Set(rangeAssignments.map((a) => a.staffId).filter((id): id is string => !!id))
    return branchStaff.filter((s) => assignedIds.has(s.id)).sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [isToday, onShiftStaff, rangeAssignments, branchStaff])

  /** How long each staff member has been between areas right now, for the column headers. Only
   * meaningful on today's board — an idle stretch is a live fact, not something a past day has. */
  const idleByStaff = useMemo(() => {
    if (!isToday) return new Map<string, number>()
    return new Map(idleNow(deriveTransitPeriods(branchAssignments, branchStaff)).map((p) => [p.staffId, p.durationMs]))
  }, [isToday, branchAssignments, branchStaff])

  async function commitReassign(assignment: Assignment, targetStaffId: string | null) {
    setAssignments((prev) =>
      prev.map((a) => (a.id === assignment.id ? { ...a, staffId: targetStaffId } : a)),
    )
    await repo.assignStaffToArea(assignment.id, targetStaffId)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const targetStaffId = over.id === UNASSIGNED ? null : String(over.id)
    const assignment = assignments.find((a) => a.id === active.id)
    if (!assignment || assignment.staffId === targetStaffId) return
    // Reassigning work someone's actively cleaning is a real conflict — the current
    // cleaner could submit proof mid-move, or show up expecting an area that's no
    // longer theirs. Confirm before committing rather than silently overwriting it.
    if (assignment.status === 'in_progress') {
      const targetName = targetStaffId === null ? 'Unassigned' : staff.find((s) => s.id === targetStaffId)?.fullName ?? 'someone'
      setPendingReassign({ assignment, targetStaffId, targetName })
      return
    }
    await commitReassign(assignment, targetStaffId)
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function handleReopen() {
    if (!reopenTarget || !admin || !reopenReason.trim()) return
    setReopening(true)
    try {
      const updated = await repo.reopenAssignment(reopenTarget.id, reopenReason.trim())
      setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setReopenTarget(null)
      setReopenReason('')
    } finally {
      setReopening(false)
    }
  }

  async function handleSaveEdit(patch: { taskType: TaskType; priority: TaskPriority; dueAt: string | null }) {
    if (!editTarget) return
    const updated = await repo.updateTaskDetails(editTarget.id, patch)
    setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setEditTarget(null)
  }

  async function handleCancel() {
    if (!cancelTarget || !cancelReason.trim()) return
    setCancelling(true)
    try {
      await repo.cancelAssignment(cancelTarget.id, cancelReason.trim())
      setAssignments((prev) => prev.filter((a) => a.id !== cancelTarget.id))
      setCancelTarget(null)
      setCancelReason('')
    } finally {
      setCancelling(false)
    }
  }

  async function handlePublish() {
    if (!admin) return
    await repo.publishRoutes(admin.siteId)
    setPublished(true)
    setTimeout(() => setPublished(false), 2500)
  }

  if (!admin || loading) {
    return (
      <AdminLayout>
        <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>
      </AdminLayout>
    )
  }

  const canEdit = canManageRoutes(admin.role) && isToday

  return (
    <AdminLayout>
      <div className="flex h-16 flex-shrink-0 items-center gap-3.5 border-b border-line bg-white px-6">
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">
          {isToday ? "Assign today's routes" : 'Route history'}
        </h2>
        <span className="text-sm text-muted">{activeBranch ? activeBranch.name : 'All branches'} · {formatDateRangeLabel(range)}</span>
        <div className="ml-3 flex gap-1 rounded-full border border-line bg-app p-0.5">
          {(['board', 'schedules'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${view === v ? 'bg-white text-ink shadow-sm' : 'text-ink-soft'}`}
            >
              {v === 'board' ? 'Board' : 'Schedules'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {view === 'board' && published && <span className="text-sm font-semibold text-verified-ink">Routes published ✓</span>}
        {view === 'board' && (<>
        <DateRangePicker value={range} onChange={setRange} />
        {canManageRoutes(admin.role) && (
          <>
            <button
              onClick={() => setCreateTaskOpen(true)}
              className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create task
            </button>
            <button
              onClick={() => setScheduleTaskOpen(true)}
              className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 15l2 2 4-4" />
              </svg>
              Schedule task
            </button>
          </>
        )}
        {!isToday ? (
          <span className="text-xs text-ink-soft">Read-only — switch to Today to reassign.</span>
        ) : canEdit ? (
          <>
            <span className="flex items-center gap-1.75 text-xs text-muted">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6l3-3 3 3M11 3v12M16 18l-3 3-3-3M13 21V9" />
              </svg>
              Drag cards, or click Assign
            </span>
            <button
              onClick={handlePublish}
              className="h-9.5 rounded-[11px] bg-verified px-4 text-sm font-bold text-white"
            >
              Publish routes
            </button>
          </>
        ) : (
          <span className="text-xs text-ink-soft">Your role is read-only — viewing routes, can't reassign.</span>
        )}
        </>)}
      </div>

      {view === 'schedules' ? (
        <SchedulesPanel
          admin={admin}
          schedules={schedules}
          assignments={assignments}
          staff={staff}
          areas={areas}
          categories={categories}
          branches={branches}
          onChanged={() => {
            repo.listSchedules(admin.siteId).then(setSchedules)
            repo.getSiteAssignments(admin.siteId).then(setAssignments)
          }}
        />
      ) : (
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 items-start gap-4 overflow-auto p-5">
          {/* Sticky so the pool of unassigned work stays in view while scrolling across staff —
              and each card has a one-click Assign menu, so nobody has to drag across the board. */}
          <Column
            id={UNASSIGNED}
            title="Unassigned"
            count={unassigned.length}
            countTone="overdue"
            className="sticky left-0 z-20 shadow-[10px_0_18px_-12px_rgba(23,33,43,0.35)]"
          >
            {unassigned.length === 0 && (
              <div className="rounded-xl border border-dashed border-dash py-3 text-center text-xs text-muted">
                Everything is assigned.
              </div>
            )}
            {unassigned.map((a) => (
              <Card
                key={a.id}
                assignment={a}
                draggable={canEdit}
                onEdit={canEdit ? () => setEditTarget(a) : undefined}
                onCancel={canEdit ? () => { setCancelTarget(a); setCancelReason('') } : undefined}
                quickAssignStaff={canEdit ? onShiftStaff : undefined}
                onQuickAssign={canEdit ? (staffId) => commitReassign(a, staffId) : undefined}
              />
            ))}
          </Column>

          {boardStaff.map((s) => {
            const mine = rangeAssignments.filter((a) => a.staffId === s.id)
            const ongoing = mine.filter((a) => a.status === 'in_progress')
            const pending = mine.filter((a) => a.status === 'todo')
            const completed = mine.filter((a) => a.status === 'done')
            const idleMs = idleByStaff.get(s.id)
            return (
              <Column
                key={s.id}
                id={s.id}
                title={s.fullName}
                subtitle={
                  idleMs === undefined ? (
                    `${mine.length} ${mine.length === 1 ? 'area' : 'areas'} · ${
                      completed.length === mine.length && mine.length > 0 ? 'complete' : 'Day shift'
                    }`
                  ) : (
                    <>
                      {mine.length} {mine.length === 1 ? 'area' : 'areas'} ·{' '}
                      <span className="font-semibold text-attention">between areas {formatTransit(idleMs)}</span>
                    </>
                  )
                }
                avatar={<Avatar initials={s.initials} colorHex={s.colorHex} size={32} />}
              >
                {ongoing.length > 0 && (
                  <SectionLabel label="Ongoing" count={ongoing.length}>
                    {ongoing.map((a) => (
                      <Card
                        key={a.id}
                        assignment={a}
                        draggable={canEdit}
                        onEdit={canEdit ? () => setEditTarget(a) : undefined}
                        onCancel={canEdit ? () => { setCancelTarget(a); setCancelReason('') } : undefined}
                      />
                    ))}
                  </SectionLabel>
                )}
                {pending.length > 0 && (
                  <SectionLabel label="Pending" count={pending.length}>
                    {pending.map((a) => (
                      <Card
                        key={a.id}
                        assignment={a}
                        draggable={canEdit}
                        onEdit={canEdit ? () => setEditTarget(a) : undefined}
                        onCancel={canEdit ? () => { setCancelTarget(a); setCancelReason('') } : undefined}
                      />
                    ))}
                  </SectionLabel>
                )}
                {completed.length > 0 && (
                  <CompletedGroup
                    assignments={completed}
                    onReopen={
                      canManageRoutes(admin.role) && isToday
                        ? (a) => {
                            setReopenTarget(a)
                            setReopenReason('')
                          }
                        : undefined
                    }
                  />
                )}
              </Column>
            )
          })}
        </div>

        <DragOverlay>{activeAssignment && <Card assignment={activeAssignment} overlay />}</DragOverlay>
      </DndContext>
      )}

      {pendingReassign && (
        <ModalShell
          title="Reassign in-progress work?"
          subtitle={`${staff.find((s) => s.id === pendingReassign.assignment.staffId)?.fullName ?? 'Someone'} is currently cleaning ${pendingReassign.assignment.areaName}.`}
          onClose={() => setPendingReassign(null)}
        >
          <p className="text-sm text-ink-soft">
            Moving it to <strong className="font-bold text-ink">{pendingReassign.targetName}</strong> now could
            conflict with the proof they're already mid-way through submitting. Reassign anyway?
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                const { assignment, targetStaffId } = pendingReassign
                setPendingReassign(null)
                await commitReassign(assignment, targetStaffId)
              }}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-overdue text-sm font-bold text-white"
            >
              Reassign anyway
            </button>
            <button
              onClick={() => setPendingReassign(null)}
              className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </ModalShell>
      )}

      {reopenTarget && (
        <ModalShell
          title="Reopen this task?"
          subtitle={`${reopenTarget.areaName} was marked complete. Reopening moves it back to Pending.`}
          onClose={() => setReopenTarget(null)}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
            Reason for reopening
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. missed a spot, staff flagged it needs redoing…"
              className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-normal text-ink outline-none focus:border-verified"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleReopen}
              disabled={reopening || !reopenReason.trim()}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50"
            >
              {reopening ? 'Reopening…' : 'Reopen task'}
            </button>
            <button
              onClick={() => setReopenTarget(null)}
              className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </ModalShell>
      )}

      {editTarget && (
        <EditTaskModal
          assignment={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}

      {cancelTarget && (
        <ModalShell
          title="Cancel this task?"
          subtitle={`${cancelTarget.areaName} will be removed from the board. This can't be undone.`}
          onClose={() => setCancelTarget(null)}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
            Reason for cancelling
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. duplicate task, area closed for the day…"
              className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-normal text-ink outline-none focus:border-verified"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCancel}
              disabled={cancelling || !cancelReason.trim()}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-overdue text-sm font-bold text-white disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel task'}
            </button>
            <button
              onClick={() => setCancelTarget(null)}
              className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink"
            >
              Keep task
            </button>
          </div>
        </ModalShell>
      )}

      {createTaskOpen && admin && (
        <CreateTaskModal
          siteId={admin.siteId}
          createdByName={admin.name}
          areas={areas.filter((a) => inActiveBranch(a.branchId, activeBranchId))}
          staff={branchStaff}
          templates={templates}
          onClose={() => setCreateTaskOpen(false)}
          onCreated={(created) => {
            // Guard against the repo's subscribe()-triggered refetch already having
            // added these (same race as the duplicate-user bug fixed in Staff.tsx).
            setAssignments((prev) => {
              const existingIds = new Set(prev.map((a) => a.id))
              return [...prev, ...created.filter((a) => !existingIds.has(a.id))]
            })
            setCreateTaskOpen(false)
          }}
          onManageTemplates={
            canManageTemplates(admin.role)
              ? () => {
                  setCreateTaskOpen(false)
                  setManageTemplatesOpen(true)
                }
              : undefined
          }
        />
      )}

      {scheduleTaskOpen && admin && (
        <ScheduleTaskModal
          siteId={admin.siteId}
          createdByName={admin.name}
          branches={branches}
          defaultBranchId={activeBranchId ?? branches[0]?.id ?? ''}
          areas={areas}
          categories={categories}
          benchmarks={benchmarks}
          staff={staff}
          templates={templates}
          onClose={() => setScheduleTaskOpen(false)}
          onCreated={(created) => {
            setAssignments((prev) => {
              const ids = new Set(prev.map((a) => a.id))
              return [...prev, ...created.filter((a) => !ids.has(a.id))]
            })
            setScheduleTaskOpen(false)
          }}
        />
      )}

      {manageTemplatesOpen && admin && (
        <ManageTaskTemplatesModal
          siteId={admin.siteId}
          templates={templates}
          onClose={() => {
            setManageTemplatesOpen(false)
            setCreateTaskOpen(true)
          }}
          onSaved={(saved) => setTemplates((prev) => (prev.some((t) => t.id === saved.id) ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]))}
        />
      )}
    </AdminLayout>
  )
}

function Column({
  id,
  title,
  subtitle,
  count,
  countTone,
  avatar,
  className = '',
  children,
}: {
  id: string
  title: string
  subtitle?: React.ReactNode
  count?: number
  countTone?: 'overdue'
  avatar?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-shrink-0 flex-col rounded-2xl border p-3.5 ${
        isOver ? 'border-verified bg-verified-tint/40' : avatar ? 'border-line bg-panel' : 'border-line bg-white'
      } ${className}`}
      style={{ width: 250 }}
    >
      {avatar ? (
        <div className="mb-3 flex items-center gap-2.5">
          {avatar}
          <div className="flex-1">
            <div className="text-[13px] font-extrabold">{title}</div>
            <div className="text-[11px] text-muted">{subtitle}</div>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-extrabold">{title}</div>
          {count !== undefined && (
            <span
              className={`rounded-full px-2 py-0.75 text-[11px] font-bold ${
                countTone === 'overdue' ? 'bg-overdue-tint text-overdue' : 'bg-line-soft text-ink-soft'
              }`}
            >
              {count}
            </span>
          )}
        </div>
      )}
      <div className="flex min-h-16 flex-col gap-2.25">
        {children}
        {avatar && (
          <div className="rounded-xl border border-dashed border-dash py-2.5 text-center text-xs font-semibold text-ink-soft">
            Drop area here
          </div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.25">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label} · {count}
      </div>
      {children}
    </div>
  )
}

function CompletedGroup({
  assignments,
  onReopen,
}: {
  assignments: Assignment[]
  onReopen?: (assignment: Assignment) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2.25">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.25 text-[10px] font-bold uppercase tracking-wide text-muted"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        Completed · {assignments.length}
      </button>
      {open && (
        <div className="flex flex-col gap-2.25">
          {assignments.map((a) => (
            <Card key={a.id} assignment={a} draggable={false} onReopen={onReopen ? () => onReopen(a) : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

/** One-click assignment picker shown on unassigned cards — the no-drag path for handing
 * work to someone when their column is off-screen. */
function AssignMenu({ staff, onAssign }: { staff: Staff[]; onAssign: (staffId: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    // stopPropagation on pointer-down so the card's drag sensor never claims these clicks.
    <div ref={rootRef} className="relative flex-shrink-0" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-6.5 rounded-lg bg-verified px-2.5 text-[11px] font-bold text-white"
      >
        Assign
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_16px_40px_rgba(23,33,43,0.2)]">
          {staff.length === 0 && <div className="px-3 py-2 text-xs text-muted">Nobody is on shift.</div>}
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setOpen(false)
                onAssign(s.id)
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.75 text-left text-xs font-semibold hover:bg-app"
            >
              <Avatar initials={s.initials} colorHex={s.colorHex} size={20} />
              <span className="truncate">{s.fullName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Card({
  assignment,
  overlay = false,
  draggable = true,
  onReopen,
  onEdit,
  onCancel,
  quickAssignStaff,
  onQuickAssign,
}: {
  assignment: Assignment
  overlay?: boolean
  draggable?: boolean
  onReopen?: () => void
  onEdit?: () => void
  onCancel?: () => void
  quickAssignStaff?: Staff[]
  onQuickAssign?: (staffId: string) => void
}) {
  const status = effectiveStatus(assignment)
  const isDraggable = draggable && status !== 'done'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: assignment.id,
    disabled: !isDraggable,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const dotColor =
    status === 'done' ? '#216B4B' : status === 'in_progress' ? '#216B4B' : status === 'overdue' ? '#B3261E' : '#BEC5B2'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
      className={`flex items-center gap-2.25 rounded-xl border bg-white px-3 py-2.75 ${
        isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${status === 'overdue' ? 'border-overdue-border bg-[#FAF0EA]' : 'border-line'} ${
        isDragging && !overlay ? 'opacity-30' : ''
      } ${overlay ? 'rotate-2 shadow-lg' : ''}`}
    >
      {status === 'done' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#216B4B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: dotColor }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-[13px] font-bold">
          <span className="truncate">{assignment.areaName}</span>
          {assignment.occurrenceNumber && assignment.occurrenceTotal && (
            <span className="flex-shrink-0 rounded-full bg-info/10 px-1.5 py-0.25 text-[9px] font-bold text-info">
              {assignment.occurrenceNumber}/{assignment.occurrenceTotal}
            </span>
          )}
          {(assignment.priority === 'high' || assignment.priority === 'urgent') && (
            <span
              className={`flex-shrink-0 rounded-full px-1.5 py-0.25 text-[9px] font-bold uppercase tracking-wide ${
                assignment.priority === 'urgent' ? 'bg-overdue text-white' : 'bg-attention/15 text-attention'
              }`}
            >
              {TASK_PRIORITY_LABELS[assignment.priority]}
            </span>
          )}
          {/* The cleaner left a note. The card is too small to print it, but hiding it entirely is
              how it went unnoticed until now — the icon carries the text on hover. */}
          {assignment.note && (
            <span title={assignment.note} className="flex-shrink-0 text-verified-ink">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16M4 10h16M4 15h9" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted">
          <span
            className={`rounded px-1 py-0.25 text-[9px] font-bold uppercase tracking-wide ${
              assignment.scheduleId ? 'bg-verified-tint text-verified-ink' : 'bg-line-soft text-ink-soft'
            }`}
          >
            {assignment.scheduleId ? 'Scheduled' : 'One-off'}
          </span>
          <span className="truncate">
            {assignment.scheduleId && assignment.occurrenceNumber && assignment.occurrenceTotal
              ? `Clean ${assignment.occurrenceNumber} of ${assignment.occurrenceTotal}`
              : assignment.areaCode}
            {status === 'overdue' && ' · overdue'}
            {status === 'in_progress' && ' · active'}
            {status === 'done' && assignment.submittedAt && ` · done ${formatClock(assignment.submittedAt)}`}
          </span>
        </div>
      </div>
      {onReopen && (
        <button
          type="button"
          onClick={onReopen}
          className="flex-shrink-0 text-[11px] font-bold text-verified-ink"
        >
          Reopen
        </button>
      )}
      {!overlay && quickAssignStaff && onQuickAssign && (
        <AssignMenu staff={quickAssignStaff} onAssign={onQuickAssign} />
      )}
      {!overlay && (onEdit || onCancel) && (
        // stopPropagation on pointer-down so the card's drag sensor never claims these clicks.
        <div className="flex flex-shrink-0 items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit task"
              title="Edit task"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-line-soft hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel task"
              title="Cancel task"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-overdue-tint hover:text-overdue"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EditTaskModal({
  assignment,
  onClose,
  onSave,
}: {
  assignment: Assignment
  onClose: () => void
  onSave: (patch: { taskType: TaskType; priority: TaskPriority; dueAt: string | null }) => Promise<void>
}) {
  const [taskType, setTaskType] = useState<TaskType>(assignment.taskType)
  const [priority, setPriority] = useState<TaskPriority>(assignment.priority)
  const [dueDateTime, setDueDateTime] = useState(() => toDateTimeInputValue(assignment.dueAt))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSave({
        taskType,
        priority,
        dueAt: dueDateTime ? new Date(dueDateTime).toISOString() : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the task.')
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Edit task" subtitle={`${assignment.areaName} · ${assignment.areaCode}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Task type">
            <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)} className={inputCls}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Due date & time (leave blank for none)">
          <input
            type="datetime-local"
            value={dueDateTime}
            onChange={(e) => setDueDateTime(e.target.value)}
            className={inputCls}
          />
        </Field>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
