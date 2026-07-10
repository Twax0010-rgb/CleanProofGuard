import { useState } from 'react'
import { Field, inputCls, ModalShell } from '../components/ui/Modal'
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '../lib/domain'
import { repo } from '../lib/repo'
import type { SaveTaskTemplateInput } from '../lib/repo/types'
import type { TaskPriority, TaskTemplate, TaskTemplateStatus, TaskType } from '../lib/types'

const TASK_TYPES: TaskType[] = ['cleaning', 'inspection', 'restock', 'maintenance', 'issue_followup', 'custom']
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
const STATUSES: TaskTemplateStatus[] = ['active', 'inactive', 'draft']

function emptyForm() {
  return {
    id: undefined as string | undefined,
    name: '',
    taskType: 'cleaning' as TaskType,
    checklistItems: [''] as string[],
    defaultPriority: 'medium' as TaskPriority,
    requirePhoto: false,
    status: 'draft' as TaskTemplateStatus,
  }
}

export function ManageTaskTemplatesModal({
  siteId,
  templates,
  onClose,
  onSaved,
}: {
  siteId: string
  templates: TaskTemplate[]
  onClose: () => void
  onSaved: (template: TaskTemplate) => void
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function loadTemplate(t: TaskTemplate) {
    setForm({
      id: t.id,
      name: t.name,
      taskType: t.taskType,
      checklistItems: t.checklistItems.length > 0 ? [...t.checklistItems] : [''],
      defaultPriority: t.defaultPriority,
      requirePhoto: t.requirePhoto,
      status: t.status,
    })
    setError(null)
  }

  function updateChecklistItem(i: number, value: string) {
    setForm((prev) => ({ ...prev, checklistItems: prev.checklistItems.map((c, j) => (j === i ? value : c)) }))
  }
  function removeChecklistItem(i: number) {
    setForm((prev) => ({ ...prev, checklistItems: prev.checklistItems.filter((_, j) => j !== i) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const input: SaveTaskTemplateInput = {
        id: form.id,
        name: form.name.trim(),
        taskType: form.taskType,
        checklistItems: form.checklistItems.map((c) => c.trim()).filter(Boolean),
        defaultPriority: form.defaultPriority,
        requirePhoto: form.requirePhoto,
        status: form.status,
      }
      const saved = await repo.saveTaskTemplate(siteId, input)
      onSaved(saved)
      loadTemplate(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Manage task templates" subtitle="Active templates appear in the Create Task dropdown for every permitted admin." onClose={onClose}>
      <div className="grid grid-cols-[160px_1fr] gap-4">
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setForm(emptyForm())}
            className="mb-1 rounded-lg bg-ink px-2.5 py-2 text-left text-xs font-bold text-white"
          >
            + New template
          </button>
          <div className="flex max-h-80 flex-col gap-1 overflow-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => loadTemplate(t)}
                className={`rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${
                  form.id === t.id ? 'bg-verified-tint text-verified-ink' : 'text-ink-soft hover:bg-app'
                }`}
              >
                {t.name}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.25 text-[9px] font-bold uppercase ${
                    t.status === 'active'
                      ? 'bg-verified-tint text-verified-ink'
                      : t.status === 'draft'
                        ? 'bg-attention/15 text-attention'
                        : 'bg-line-soft text-muted'
                  }`}
                >
                  {t.status}
                </span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Template name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className={inputCls}
              placeholder="Restroom Deep Clean"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Task type">
              <select value={form.taskType} onChange={(e) => setForm((prev) => ({ ...prev, taskType: e.target.value as TaskType }))} className={inputCls}>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default priority">
              <select
                value={form.defaultPriority}
                onChange={(e) => setForm((prev) => ({ ...prev, defaultPriority: e.target.value as TaskPriority }))}
                className={inputCls}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as TaskTemplateStatus }))} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={form.requirePhoto}
              onChange={(e) => setForm((prev) => ({ ...prev, requirePhoto: e.target.checked }))}
            />
            Require proof photos (before &amp; after)
          </label>
          <Field label="Checklist items">
            <div className="flex flex-col gap-1.5">
              {form.checklistItems.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input value={item} onChange={(e) => updateChecklistItem(i, e.target.value)} className={inputCls} placeholder="Checklist item" />
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
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, checklistItems: [...prev.checklistItems, ''] }))}
                className="self-start text-xs font-bold text-verified-ink"
              >
                + Add item
              </button>
            </div>
          </Field>

          {form.status === 'inactive' && form.id && (
            <p className="text-[11px] text-ink-soft">Inactive templates won't appear for new tasks but stay linked to any tasks already created from them.</p>
          )}

          {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}

          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={submitting || !form.name.trim()}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : form.id ? 'Save changes' : 'Create template'}
            </button>
            <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
              Close
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}
