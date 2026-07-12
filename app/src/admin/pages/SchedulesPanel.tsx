import { useMemo, useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Field, inputCls, ModalShell } from '../../components/ui/Modal'
import { repo } from '../../lib/repo'
import type { UpdateScheduleInput } from '../../lib/repo/types'
import type { AdminUser, Area, Assignment, Branch, CleaningSchedule, LocationCategory, Staff } from '../../lib/types'

const RECUR_LABELS: Record<CleaningSchedule['recurrenceType'], string> = {
  today: 'Today only', daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends', custom: 'Custom days',
}

function canManageSchedules(role: AdminUser['role']): boolean {
  return role === 'superuser' || role === 'super_admin' || role === 'manager'
}

function nextGeneration(s: CleaningSchedule): string {
  if (!s.isActive || s.archivedAt) return '—'
  if (s.recurrenceType === 'today') return 'One-off'
  const d = new Date()
  d.setDate(d.getDate() + 1)
  if (s.recurrenceType === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  if (s.recurrenceType === 'weekends') while (d.getDay() !== 0 && d.getDay() !== 6) d.setDate(d.getDate() + 1)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function SchedulesPanel({
  admin,
  schedules,
  assignments,
  staff,
  areas,
  categories,
  branches,
  onChanged,
}: {
  admin: AdminUser
  schedules: CleaningSchedule[]
  assignments: Assignment[]
  staff: Staff[]
  areas: Area[]
  categories: LocationCategory[]
  branches: Branch[]
  onChanged: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'archived' | 'all'>('active')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CleaningSchedule | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const canManage = canManageSchedules(admin.role)

  async function generateToday() {
    setGenerating(true)
    setError(null)
    setGenMsg(null)
    try {
      const n = await repo.generateScheduleOccurrences(admin.siteId)
      setGenMsg(n > 0 ? `Generated ${n} new occurrence${n === 1 ? '' : 's'} for today.` : 'Today’s occurrences are already up to date.')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate occurrences.')
    } finally {
      setGenerating(false)
    }
  }
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? '—' : '—')
  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? '—' : 'All branches')

  const completion = (s: CleaningSchedule) => {
    const occ = assignments.filter((a) => a.scheduleId === s.id)
    const done = occ.filter((a) => a.status === 'done').length
    return { done, total: occ.length }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schedules
      .filter((s) => {
        if (statusFilter === 'active') return s.isActive && !s.archivedAt
        if (statusFilter === 'paused') return !s.isActive && !s.archivedAt
        if (statusFilter === 'archived') return !!s.archivedAt
        return true
      })
      .filter((s) => !q || s.name.toLowerCase().includes(q) || catName(s.categoryId).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, statusFilter, query])

  async function run<T>(fn: () => Promise<T>) {
    setError(null)
    try { const r = await fn(); onChanged(); return r } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); return null }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search schedules" className="h-9 w-56 rounded-[11px] border border-line bg-app px-3 text-sm outline-none focus:border-stroke-soft" />
        {(['active', 'paused', 'archived', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize ${statusFilter === f ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}>{f}</button>
        ))}
        {canManage && (
          <button onClick={generateToday} disabled={generating} className="ml-auto flex h-9 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft disabled:opacity-50" title="Runs the same generation as the daily job">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-3-6.7M21 3v6h-6" /></svg>
            {generating ? 'Generating…' : 'Generate today'}
          </button>
        )}
      </div>

      {genMsg && <div className="mb-3 rounded-xl border border-verified-tint bg-verified-tint/40 px-4 py-2.5 text-[13px] font-medium text-verified-ink">{genMsg}</div>}
      {error && <div className="mb-3 rounded-xl border border-overdue/30 bg-overdue/5 px-4 py-2.5 text-[13px] font-medium text-overdue">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="grid grid-cols-[1.6fr_1fr_0.8fr_1fr_0.9fr_auto] gap-3 border-b border-line-soft bg-app px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted">
          <div>Schedule</div><div>Assigned</div><div>Frequency</div><div>Recurrence · next</div><div>Today</div><div className="text-right">Manage</div>
        </div>
        {filtered.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">No schedules match this view.</div>}
        {filtered.map((s) => {
          const c = completion(s)
          const person = s.assignedUserId ? staffById.get(s.assignedUserId) : null
          const paused = !s.isActive && !s.archivedAt
          return (
            <div key={s.id} className={`grid grid-cols-[1.6fr_1fr_0.8fr_1fr_0.9fr_auto] items-center gap-3 border-b border-line-softer px-5 py-3.5 last:border-b-0 ${s.archivedAt || paused ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                  {s.name}
                  {s.archivedAt ? <Badge tone="muted">Archived</Badge> : paused ? <Badge tone="amber">Paused</Badge> : <Badge tone="green">Active</Badge>}
                </div>
                <div className="truncate font-mono text-[11px] text-muted">{branchName(s.branchId)} · {catName(s.categoryId)} · {s.areaIds.length} area{s.areaIds.length === 1 ? '' : 's'}</div>
              </div>
              <div className="min-w-0 text-sm">
                {person ? (
                  <span className="flex items-center gap-1.5 truncate"><Avatar initials={person.initials} colorHex={person.colorHex} size={20} /><span className="truncate">{person.fullName}</span></span>
                ) : <span className="text-muted">Unassigned</span>}
              </div>
              <div className="text-sm font-semibold">{s.requiredCleansPerDay}×/day</div>
              <div className="text-xs text-ink-soft">{RECUR_LABELS[s.recurrenceType]}<div className="font-mono text-[11px] text-muted">next: {nextGeneration(s)}</div></div>
              <div className="text-xs">
                {c.total > 0 ? (
                  <span className={`font-bold ${c.done === c.total ? 'text-verified-ink' : 'text-ink'}`}>{c.done}/{c.total}</span>
                ) : <span className="text-muted">—</span>}
                <div className="text-[11px] text-muted">clean{c.total === 1 ? '' : 's'} today</div>
              </div>
              <div className="flex justify-end gap-1.5">
                {canManage && !s.archivedAt && (
                  <>
                    <button onClick={() => setEditing(s)} className="h-8 rounded-lg border border-line px-2.5 text-xs font-bold text-ink-soft">Edit</button>
                    <button onClick={() => run(() => repo.setScheduleStatus(s.id, !s.isActive, false))} className="h-8 rounded-lg border border-line px-2.5 text-xs font-bold text-ink-soft">{s.isActive ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => run(() => repo.duplicateSchedule(s.id))} className="h-8 rounded-lg border border-line px-2.5 text-xs font-bold text-ink-soft">Duplicate</button>
                    <button onClick={() => run(() => repo.setScheduleStatus(s.id, false, true))} className="h-8 rounded-lg border border-line px-2.5 text-xs font-bold text-overdue">Archive</button>
                  </>
                )}
                {canManage && s.archivedAt && (
                  <button onClick={() => run(() => repo.setScheduleStatus(s.id, true, false))} className="h-8 rounded-lg border border-line px-2.5 text-xs font-bold text-verified-ink">Restore</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <EditScheduleModal
          schedule={editing}
          staff={staff.filter((s) => s.accountStatus === 'active' && s.branchId === editing.branchId)}
          areas={areas.filter((a) => a.branchId === editing.branchId && a.active)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged() }}
        />
      )}
    </div>
  )
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'muted'; children: React.ReactNode }) {
  const cls = tone === 'green' ? 'bg-verified-tint text-verified-ink' : tone === 'amber' ? 'bg-attention/15 text-attention' : 'bg-line-soft text-ink-soft'
  return <span className={`flex-shrink-0 rounded-full px-1.75 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>
}

const UNASSIGNED = '__unassigned__'

function EditScheduleModal({
  schedule,
  staff,
  areas,
  onClose,
  onSaved,
}: {
  schedule: CleaningSchedule
  staff: Staff[]
  areas: Area[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(schedule.name)
  const [assignedUserId, setAssignedUserId] = useState(schedule.assignedUserId ?? UNASSIGNED)
  const [cleans, setCleans] = useState(schedule.requiredCleansPerDay)
  const [recurrence, setRecurrence] = useState(schedule.recurrenceType)
  const [startTime, setStartTime] = useState(schedule.startTime)
  const [endTime, setEndTime] = useState(schedule.endTime)
  const [requirePhoto, setRequirePhoto] = useState(schedule.requirePhoto)
  const [notes, setNotes] = useState(schedule.notes ?? '')
  const [areaIds, setAreaIds] = useState<string[]>(schedule.areaIds)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleArea(id: string) {
    setAreaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function save() {
    if (!name.trim()) { setError('Give the schedule a name.'); return }
    if (areaIds.length === 0) { setError('Keep at least one area.'); return }
    setSaving(true)
    setError(null)
    try {
      const patch: UpdateScheduleInput = {
        name: name.trim(),
        assignedUserId: assignedUserId === UNASSIGNED ? null : assignedUserId,
        requiredCleansPerDay: cleans,
        frequencyType: 'custom',
        recurrenceType: recurrence,
        startTime,
        endTime,
        requirePhoto,
        notes: notes.trim() || null,
        areaIds,
      }
      await repo.updateSchedule(schedule.id, patch)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the schedule.')
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Edit schedule" subtitle="Changes apply to future generations." onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto pr-1">
        <Field label="Schedule name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assigned staff">
            <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className={inputCls}>
              <option value={UNASSIGNED}>Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </Field>
          <Field label="Cleans per day">
            <input type="number" min={1} max={24} value={cleans} onChange={(e) => setCleans(Math.max(1, Number(e.target.value)))} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recurrence">
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as CleaningSchedule['recurrenceType'])} className={inputCls}>
              {(Object.keys(RECUR_LABELS) as CleaningSchedule['recurrenceType'][]).map((r) => <option key={r} value={r}>{RECUR_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label="Photo proof">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft">
              <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} /> Required
            </label>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} /></Field>
          <Field label="End time"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label={`Areas (${areaIds.length} selected)`}>
          <div className="max-h-40 overflow-auto rounded-xl border border-line">
            {areas.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.75 text-sm hover:bg-app">
                <input type="checkbox" checked={areaIds.includes(a.id)} onChange={() => toggleArea(a.id)} />
                <span className="flex-1 font-semibold">{a.name}</span>
                <span className="font-mono text-xs text-muted">{a.code}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Notes (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} py-2`} />
        </Field>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={saving} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
        <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
      </div>
    </ModalShell>
  )
}
