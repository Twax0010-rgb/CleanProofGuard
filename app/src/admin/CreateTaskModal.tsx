import { useEffect, useState } from 'react'
import { Field, inputCls, ModalShell } from '../components/ui/Modal'
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '../lib/domain'
import { repo } from '../lib/repo'
import type { CreateTaskInput } from '../lib/repo/types'
import type { Area, Assignment, Staff, TaskPriority, TaskTemplate, TaskType } from '../lib/types'

const TASK_TYPES: TaskType[] = ['cleaning', 'inspection', 'restock', 'maintenance', 'issue_followup', 'custom']
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

function toLocalDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CreateTaskModal({
  siteId,
  createdByName,
  areas,
  staff,
  templates,
  onClose,
  onCreated,
  onManageTemplates,
}: {
  siteId: string
  createdByName: string
  areas: Area[]
  staff: Staff[]
  templates: TaskTemplate[]
  onClose: () => void
  onCreated: (assignments: Assignment[]) => void
  onManageTemplates?: () => void
}) {
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [taskType, setTaskType] = useState<TaskType>('cleaning')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [requirePhoto, setRequirePhoto] = useState(false)
  const [checklist, setChecklist] = useState<string[]>([''])
  const [dueDateTime, setDueDateTime] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [areaSearch, setAreaSearch] = useState('')
  const [areaId, setAreaId] = useState<string | null>(null)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffIds, setStaffIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const activeTemplates = templates.filter((t) => t.status === 'active')
  const activeAreas = areas.filter((a) => a.active)
  const activeStaffList = staff.filter((s) => s.accountStatus === 'active')

  useEffect(() => {
    if (!templateId) return
    const t = templates.find((x) => x.id === templateId)
    if (!t) return
    setTaskType(t.taskType)
    setPriority(t.defaultPriority)
    setRequirePhoto(t.requirePhoto)
    setChecklist(t.checklistItems.length > 0 ? [...t.checklistItems] : [''])
  }, [templateId, templates])

  const filteredAreas = activeAreas.filter(
    (a) => !areaSearch.trim() || a.name.toLowerCase().includes(areaSearch.toLowerCase()) || a.code.toLowerCase().includes(areaSearch.toLowerCase()),
  )
  const filteredStaff = activeStaffList.filter((s) => !staffSearch.trim() || s.fullName.toLowerCase().includes(staffSearch.toLowerCase()))
  const selectedArea = areas.find((a) => a.id === areaId) ?? null

  function toggleStaff(id: string) {
    setStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function updateChecklistItem(i: number, value: string) {
    setChecklist((prev) => prev.map((c, j) => (j === i ? value : c)))
  }
  function removeChecklistItem(i: number) {
    setChecklist((prev) => prev.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!areaId) {
      setError('Choose a location for this task.')
      return
    }
    setSubmitting(true)
    try {
      const template = templateId ? templates.find((t) => t.id === templateId) : null
      const input: CreateTaskInput = {
        areaId,
        staffIds,
        taskType,
        priority,
        dueAt: dueDateTime ? new Date(dueDateTime).toISOString() : null,
        checklistItems: checklist.map((c) => c.trim()).filter(Boolean),
        templateId: template?.id ?? null,
        templateName: template?.name ?? null,
        requirePhoto,
      }
      const created = await repo.createTask(siteId, input, createdByName)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the task.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Create task" subtitle="Assigns immediately — the selected staff will see it right away." onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Task template (optional)">
            <select
              value={templateId ?? ''}
              onChange={(e) => setTemplateId(e.target.value || null)}
              className={inputCls}
            >
              <option value="">Ad hoc (no template)</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {onManageTemplates && (
              <button type="button" onClick={onManageTemplates} className="mt-1 text-[11px] font-bold text-verified-ink">
                Manage templates →
              </button>
            )}
          </Field>
          <Field label="Task type">
            <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)} className={inputCls}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Location">
          {selectedArea ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-app px-3.5 py-2.5 text-sm">
              <span className="font-semibold">
                {selectedArea.name} <span className="font-mono text-xs text-muted">{selectedArea.code}</span>
              </span>
              <button type="button" onClick={() => setAreaId(null)} className="text-xs font-bold text-overdue">
                Change
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-line">
              <input
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                placeholder="Search locations by name or code…"
                className="w-full rounded-t-xl border-b border-line px-3.5 py-2.5 text-sm outline-none"
              />
              <div className="max-h-36 overflow-auto">
                {filteredAreas.length === 0 && <div className="px-3.5 py-3 text-xs text-muted">No matching active locations.</div>}
                {filteredAreas.slice(0, 40).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAreaId(a.id)}
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-app"
                  >
                    <span>{a.name}</span>
                    <span className="font-mono text-xs text-muted">{a.code}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label={`Assigned staff (${staffIds.length ? `${staffIds.length} selected` : 'none — creates unassigned task'})`}>
          <div className="rounded-xl border border-line">
            <input
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder="Search staff by name…"
              className="w-full rounded-t-xl border-b border-line px-3.5 py-2.5 text-sm outline-none"
            />
            <div className="max-h-36 overflow-auto">
              {filteredStaff.length === 0 && <div className="px-3.5 py-3 text-xs text-muted">No matching active staff.</div>}
              {filteredStaff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3.5 py-2 text-sm hover:bg-app">
                  <input type="checkbox" checked={staffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                  {s.fullName}
                  <span className="text-xs text-muted">{s.staffCode}</span>
                </label>
              ))}
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date & time">
            <input
              type="datetime-local"
              value={dueDateTime}
              onChange={(e) => setDueDateTime(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Checklist / task actions">
          <div className="flex flex-col gap-1.5">
            {checklist.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={item}
                  onChange={(e) => updateChecklistItem(i, e.target.value)}
                  className={inputCls}
                  placeholder="Checklist item"
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(i)}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setChecklist((prev) => [...prev, ''])} className="self-start text-xs font-bold text-verified-ink">
              + Add item
            </button>
          </div>
        </Field>

        <label className="flex items-center gap-2.5 rounded-xl border border-line bg-app px-3.5 py-2.5 text-sm">
          <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
          <span className="flex-1">
            <span className="font-semibold">Require proof photos</span>
            <span className="ml-1.5 text-xs text-muted">Staff must add before &amp; after photos to mark it clean.</span>
          </span>
        </label>

        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={submitting || !areaId}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'Creating…' : staffIds.length > 1 ? `Create ${staffIds.length} tasks` : 'Create task'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
