import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { QrModal } from '../../components/QrModal'
import { Field, inputCls, ModalShell } from '../../components/ui/Modal'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { FREQUENCY_PRESETS, canManageAreas, canManageBenchmarks, canManageCategories, categorySlugLabel, formatClock, formatDuration, formatFrequency, frequencyCountdown } from '../../lib/domain'
import {
  AREA_EXPORT_FIELDS,
  buildAreaExportRows,
  buildErrorReportCsv,
  buildLocationImportTemplateCsv,
  parseLocationImportCsv,
} from '../../lib/locationImport'
import type { AreaImportError, AreaImportRow } from '../../lib/locationImport'
import { exportRowsToCsv, exportRowsToXlsx } from '../../lib/reportExport'
import { toLocalDateStamp } from '../../lib/reports'
import { repo } from '../../lib/repo'
import type { CreateAreaInput, ImportAreaRow, UpdateAreaInput } from '../../lib/repo/types'
import type { Area, Benchmark, Branch, ImportBatch, LocationCategory } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'
import { ManageCategoriesModal } from './ManageCategories'
import { ManageBenchmarksModal } from './ManageBenchmarks'

export function Locations() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch, branches } = useBranch()
  const [areas, setAreas] = useState<Area[]>([])
  const [categories, setCategories] = useState<LocationCategory[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [manageBenchmarksOpen, setManageBenchmarksOpen] = useState(false)
  const [qrArea, setQrArea] = useState<Area | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editArea, setEditArea] = useState<Area | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [manageCatsOpen, setManageCatsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Area | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([repo.listAreasForSite(admin!.siteId), repo.listCategories(admin!.siteId), repo.listBenchmarks(admin!.siteId)]).then(([a, c, bm]) => {
        setAreas(a)
        setCategories(c)
        setBenchmarks(bm)
        setLoading(false)
      })
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  useEffect(() => {
    if (!admin) return
    repo.listImportBatches(admin.siteId).then(setImportBatches)
  }, [admin])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const categoryLabel = (area: Area) =>
    (area.categoryId && categoriesById.get(area.categoryId)?.name) || categorySlugLabel(area.category)
  const categoryColor = (area: Area) => (area.categoryId && categoriesById.get(area.categoryId)?.color) || null

  // Filter pills come from the backend: active categories, plus any archived category still in use.
  const activeCategories = useMemo(() => categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [categories])

  const filtered = useMemo(
    () =>
      areas
        .filter((a) => inActiveBranch(a.branchId, activeBranchId))
        .filter((a) => filter === 'all' || a.categoryId === filter)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [areas, filter, activeBranchId],
  )

  // New areas / imports land in the currently-selected branch; fall back to the first allowed one.
  const targetBranchId = activeBranch?.id ?? branches[0]?.id ?? ''

  async function handleFrequencyChange(area: Area, value: string) {
    const minutes = value === 'null' ? null : Number(value)
    const updated = await repo.setAreaFrequency(area.id, minutes)
    setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  function upsertArea(updated: Area) {
    setAreas((prev) => (prev.some((a) => a.id === updated.id) ? prev.map((a) => (a.id === updated.id ? updated : a)) : [...prev, updated]))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await repo.deleteArea(deleteTarget.id)
      setAreas((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      // Most commonly the history guard: areas with proof/photos/issues must be deactivated instead.
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the area.')
    } finally {
      setDeleting(false)
    }
  }

  function handleExport(format: 'csv' | 'xlsx') {
    const rows = buildAreaExportRows(filtered)
    const fileBase = `Locations_export_${toLocalDateStamp(new Date())}`
    if (format === 'csv') exportRowsToCsv(rows, AREA_EXPORT_FIELDS, fileBase)
    else exportRowsToXlsx(rows, AREA_EXPORT_FIELDS, fileBase)
  }

  if (!admin || loading) {
    return (
      <AdminLayout>
        <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>
      </AdminLayout>
    )
  }

  const canEdit = canManageAreas(admin.role)
  const canManageCats = canManageCategories(admin)
  const canManageBench = canManageBenchmarks(admin)

  return (
    <AdminLayout>
      <div className="flex h-16 flex-shrink-0 items-center gap-3.5 border-b border-line bg-white px-6">
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Locations</h2>
        <span className="text-sm text-muted">{filtered.length} areas · {activeBranch ? activeBranch.name : 'All branches'}</span>
        {!canEdit && (
          <span className="ml-auto text-xs text-ink-soft">Your role can view locations but not edit them.</span>
        )}
        <div className={canEdit ? 'ml-auto flex items-center gap-2' : 'flex items-center gap-2'}>
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
          >
            Import history
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
          >
            Export Excel
          </button>
          {canManageCats && (
            <button
              onClick={() => setManageCatsOpen(true)}
              className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
            >
              Manage categories
            </button>
          )}
          {canManageBench && (
            <button
              onClick={() => setManageBenchmarksOpen(true)}
              className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
            >
              Benchmarks
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => setImportOpen(true)}
                className="flex h-9.5 items-center gap-1.5 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft"
              >
                Import
              </button>
              <button
                onClick={() => setAddOpen(true)}
                className="flex h-9.5 items-center gap-2 rounded-[11px] bg-verified px-4 text-sm font-bold text-white"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New area
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              filter === 'all' ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'
            }`}
          >
            All areas
          </button>
          {activeCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                filter === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'
              }`}
            >
              {c.color && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
              {c.name}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid grid-cols-[1.4fr_0.9fr_1fr_1fr_auto_auto] gap-3 border-b border-line-soft bg-app px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted">
            <div>Area</div>
            <div>Category</div>
            <div>Frequency</div>
            <div>Status</div>
            <div className="text-right">QR tag</div>
            <div className="text-right">Manage</div>
          </div>
          {filtered.map((area) => {
            const countdown = frequencyCountdown(area, now)
            return (
              <div
                key={area.id}
                className={`grid grid-cols-[1.4fr_0.9fr_1fr_1fr_auto_auto] items-center gap-3 border-b border-line-softer px-5 py-3.5 last:border-b-0 ${
                  area.active ? '' : 'opacity-55'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {area.name}
                    {!area.active && (
                      <span className="flex-shrink-0 rounded-full bg-line-soft px-1.75 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted">{area.code}</div>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-ink-soft">
                  {categoryColor(area) && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: categoryColor(area)! }} />}
                  {categoryLabel(area)}
                </div>
                {canEdit ? (
                  <select
                    value={area.frequencyMinutes ?? 'null'}
                    onChange={(e) => handleFrequencyChange(area, e.target.value)}
                    className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm"
                  >
                    {FREQUENCY_PRESETS.map((p) => (
                      <option key={String(p.minutes)} value={p.minutes ?? 'null'}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-ink-soft">{formatFrequency(area.frequencyMinutes)}</span>
                )}
                <div className="text-xs">
                  {area.lastCleanedAt ? (
                    <div className="text-ink-soft">
                      Cleaned {formatClock(area.lastCleanedAt)}
                      {countdown && (
                        <div className={countdown.overdue ? 'font-semibold text-overdue' : 'text-muted'}>
                          {countdown.overdue ? 'Overdue ' : 'Due in '}
                          {formatDuration(Math.abs(countdown.remainingMs))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">Not yet recorded</span>
                  )}
                </div>
                <button
                  onClick={() => setQrArea(area)}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5E6B76" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 14h3v3M20 14v.01M20 20v-3M14 20h3" strokeLinecap="round" />
                  </svg>
                  View
                </button>
                {canEdit ? (
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setEditArea(area)}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(area)}
                      title="Delete area"
                      className="flex h-9 items-center rounded-lg border border-line px-3 text-xs font-bold text-overdue"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <div />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {qrArea && (
        <QrModal
          areaName={qrArea.name}
          url={`${window.location.origin}/verify/${qrArea.code}`}
          onClose={() => setQrArea(null)}
        />
      )}

      {addOpen && admin && (
        <AddAreaModal
          siteId={admin.siteId}
          branches={branches}
          defaultBranchId={targetBranchId}
          categories={activeCategories}
          canManageCategories={canManageCats}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
          onClose={() => setAddOpen(false)}
          onCreated={(a) => { upsertArea(a); setAddOpen(false) }}
        />
      )}

      {editArea && (
        <EditAreaModal
          area={editArea}
          categories={activeCategories}
          onClose={() => setEditArea(null)}
          onSaved={(a) => { upsertArea(a); setEditArea(null) }}
        />
      )}

      {manageCatsOpen && admin && (
        <ManageCategoriesModal
          siteId={admin.siteId}
          branches={branches}
          categories={categories}
          areas={areas}
          onClose={() => setManageCatsOpen(false)}
          onChanged={(cats) => setCategories(cats)}
          onAreasChanged={() => repo.listAreasForSite(admin.siteId).then(setAreas)}
        />
      )}

      {manageBenchmarksOpen && admin && (
        <ManageBenchmarksModal
          siteId={admin.siteId}
          branches={branches}
          categories={categories}
          benchmarks={benchmarks}
          onClose={() => setManageBenchmarksOpen(false)}
          onChanged={(bm) => setBenchmarks(bm)}
        />
      )}

      {deleteTarget && (
        <ModalShell
          title="Delete this area?"
          subtitle={`${deleteTarget.name} (${deleteTarget.code}) will be permanently removed, along with its open assignments.`}
          onClose={() => { setDeleteTarget(null); setDeleteError(null) }}
        >
          <p className="text-sm text-ink-soft">
            This can't be undone. Areas with completed proof, photos, or reported issues can't be
            deleted — deactivate those instead so their history stays auditable.
          </p>
          {deleteError && <div className="mt-3 rounded-xl bg-overdue-tint px-3.5 py-2.5 text-[13px] font-medium text-overdue">{deleteError}</div>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-overdue text-sm font-bold text-white disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete area'}
            </button>
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError(null) }}
              className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink"
            >
              Keep area
            </button>
          </div>
        </ModalShell>
      )}

      {importOpen && admin && (
        <ImportLocationsModal
          siteId={admin.siteId}
          branchId={targetBranchId}
          branchName={activeBranch?.name ?? branches.find((b) => b.id === targetBranchId)?.name ?? '—'}
          existingCodes={new Set(areas.map((a) => a.code.toLowerCase()))}
          onClose={() => setImportOpen(false)}
          onImported={(batch) => {
            setImportBatches((prev) => [batch, ...prev])
            repo.listAreasForSite(admin.siteId).then(setAreas)
          }}
        />
      )}

      {historyOpen && (
        <ModalShell title="Import history" subtitle="Who imported what, and when." onClose={() => setHistoryOpen(false)}>
          {importBatches.length === 0 ? (
            <p className="text-sm text-muted">No imports yet.</p>
          ) : (
            <div className="flex max-h-96 flex-col gap-2 overflow-auto">
              {importBatches.map((b) => (
                <div key={b.id} className="rounded-xl border border-line bg-app p-3">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-bold">{b.fileName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        b.status === 'success'
                          ? 'bg-verified-tint text-verified-ink'
                          : b.status === 'partial'
                            ? 'bg-attention/15 text-attention'
                            : 'bg-overdue-tint text-overdue'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-soft">
                    {b.importedByName} · {formatClock(b.importedAt)} · {b.successCount} succeeded, {b.failedCount} failed
                  </div>
                </div>
              ))}
            </div>
          )}
        </ModalShell>
      )}
    </AdminLayout>
  )
}

function downloadTextFile(text: string, filename: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ImportLocationsModal({
  siteId,
  branchId,
  branchName,
  existingCodes,
  onClose,
  onImported,
}: {
  siteId: string
  branchId: string
  branchName: string
  existingCodes: Set<string>
  onClose: () => void
  onImported: (batch: ImportBatch) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [valid, setValid] = useState<AreaImportRow[]>([])
  const [errors, setErrors] = useState<AreaImportError[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportBatch | null>(null)

  function handleFile(file: File) {
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseLocationImportCsv(text, existingCodes)
      setValid(parsed.valid)
      setErrors(parsed.errors)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!fileName || valid.length === 0) return
    setImporting(true)
    try {
      const rows: ImportAreaRow[] = valid.map((v) => ({
        code: v.code,
        name: v.name,
        category: v.category,
        frequencyMinutes: v.frequencyMinutes,
        taskTemplate: v.taskTemplate,
        active: v.active,
        branchId,
        isUpdate: v.isUpdate,
      }))
      const batch = await repo.importAreas(siteId, fileName, rows, errors.length)
      setResult(batch)
      onImported(batch)
    } finally {
      setImporting(false)
    }
  }

  return (
    <ModalShell title="Import locations" subtitle={`New areas import into ${branchName}. Existing areas match by code.`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => downloadTextFile(buildLocationImportTemplateCsv(), 'location_import_template.csv')}
          className="self-start text-xs font-bold text-verified-ink"
        >
          Download CSV template
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
          className="text-sm"
        />

        {fileName && !result && (
          <div className="rounded-xl border border-line bg-app p-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="font-bold text-verified-ink">{valid.length} valid rows</span>
              {errors.length > 0 && <span className="font-bold text-overdue">{errors.length} rows with errors</span>}
            </div>
            {valid.some((v) => v.isUpdate) && (
              <p className="mt-1 text-xs text-ink-soft">
                {valid.filter((v) => v.isUpdate).length} will update existing areas (matched by code); the rest will be created.
              </p>
            )}
          </div>
        )}

        {errors.length > 0 && !result && (
          <div className="max-h-40 overflow-auto rounded-xl border border-overdue-border bg-[#FAF0EA] p-2">
            {errors.slice(0, 30).map((e, i) => (
              <div key={i} className="border-b border-overdue-border/50 px-2 py-1.5 text-xs last:border-b-0">
                <span className="font-mono font-bold text-overdue">Row {e.rowNumber}</span>{' '}
                <span className="text-ink-soft">({e.column})</span> — {e.message}
              </div>
            ))}
            <button
              type="button"
              onClick={() => downloadTextFile(buildErrorReportCsv(errors), 'import_errors.csv')}
              className="mt-1 px-2 text-xs font-bold text-overdue"
            >
              Download error report
            </button>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-verified-tint bg-verified-tint p-3 text-sm text-verified-ink">
            Imported {result.successCount} location{result.successCount === 1 ? '' : 's'}
            {result.failedCount > 0 && ` — ${result.failedCount} rows were skipped due to errors`}.
          </div>
        )}

        <div className="mt-1 flex gap-2">
          {!result ? (
            <>
              <button
                onClick={handleImport}
                disabled={!fileName || valid.length === 0 || importing}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50"
              >
                {importing ? 'Importing…' : `Import ${valid.length} valid row${valid.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={onClose} className="h-11 flex-1 rounded-xl bg-ink text-sm font-bold text-white">
              Done
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function TaskListEditor({ tasks, onChange }: { tasks: string[]; onChange: (tasks: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {tasks.map((task, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={task}
            onChange={(e) => onChange(tasks.map((t, j) => (j === i ? e.target.value : t)))}
            className={inputCls}
            placeholder="Task label"
          />
          <button
            type="button"
            onClick={() => onChange(tasks.filter((_, j) => j !== i))}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft"
            title="Remove task"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...tasks, ''])}
        className="mt-1 self-start text-xs font-bold text-verified-ink"
      >
        + Add task
      </button>
    </div>
  )
}

/** Category dropdown with an inline "+" that opens a small new-category form (superuser/manage only).
 * On save the new category is added to the list and auto-selected. Shared by the area modals. */
function CategoryPicker({
  siteId,
  categories,
  value,
  onChange,
  canManage,
  onCategoryCreated,
  branchId,
}: {
  siteId: string
  categories: LocationCategory[]
  value: string | null
  onChange: (categoryId: string) => void
  canManage: boolean
  onCategoryCreated?: (c: LocationCategory) => void
  branchId: string
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#35668C')
  const [newIcon, setNewIcon] = useState('')
  const [scope, setScope] = useState<'global' | 'branch'>('global')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveCategory() {
    if (!newName.trim() || busy) return
    setErr(null)
    setBusy(true)
    try {
      const created = await repo.createCategory(siteId, {
        name: newName.trim(),
        color: newColor,
        icon: newIcon.trim() || null,
        isGlobal: scope === 'global',
        branchId: scope === 'branch' ? branchId : null,
      })
      onCategoryCreated?.(created)
      onChange(created.id)
      setAdding(false)
      setNewName('')
      setNewIcon('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {value === null && <option value="">Select a category</option>}
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canManage && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            title="New category"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 rounded-xl border border-line bg-app p-3">
          <div className="mb-1.5 text-xs font-bold text-ink-soft">New category</div>
          <div className="flex flex-col gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} placeholder="Category name (e.g. Isolation Ward)" />
            <div className="flex items-center gap-2">
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-12 rounded-lg border border-line" title="Color" />
              <input value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className={`${inputCls} flex-1`} placeholder="Icon (optional, e.g. 🧴)" />
              <select value={scope} onChange={(e) => setScope(e.target.value as 'global' | 'branch')} className={inputCls}>
                <option value="global">All branches</option>
                <option value="branch">This branch</option>
              </select>
            </div>
            {err && <div className="text-[12px] font-medium text-overdue">{err}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={saveCategory} disabled={busy || !newName.trim()} className="h-9 flex-1 rounded-lg bg-verified text-xs font-bold text-white disabled:opacity-50">
                {busy ? 'Saving…' : 'Save category'}
              </button>
              <button type="button" onClick={() => { setAdding(false); setErr(null) }} className="h-9 flex-1 rounded-lg border border-stroke text-xs font-bold text-ink">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddAreaModal({
  siteId,
  branches,
  defaultBranchId,
  categories,
  canManageCategories,
  onCategoryCreated,
  onClose,
  onCreated,
}: {
  siteId: string
  branches: Branch[]
  defaultBranchId: string
  categories: LocationCategory[]
  canManageCategories: boolean
  onCategoryCreated: (c: LocationCategory) => void
  onClose: () => void
  onCreated: (area: Area) => void
}) {
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [localCategories, setLocalCategories] = useState<LocationCategory[]>(categories)
  const [categoryId, setCategoryId] = useState<string | null>(
    categories.find((c) => c.slug === 'office')?.id ?? categories[0]?.id ?? null,
  )
  const [frequencyMinutes, setFrequencyMinutes] = useState<number | null>(null)
  const [tasks, setTasks] = useState<string[]>(['Wipe & disinfect surfaces', 'Empty & reline bins'])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!branchId) {
      setError('Choose a branch for this area.')
      return
    }
    if (!categoryId) {
      setError('Choose a category for this area.')
      return
    }
    const category = localCategories.find((c) => c.id === categoryId)
    setSubmitting(true)
    try {
      const input: CreateAreaInput = {
        name: name.trim(),
        category: category?.slug ?? 'other',
        categoryId,
        frequencyMinutes,
        taskTemplate: tasks.map((t) => t.trim()).filter(Boolean),
        branchId,
      }
      const created = await repo.createArea(siteId, input)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create area.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="New area" subtitle="It'll appear unassigned in today's route board right away." onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="L3 · Men's Restroom" />
        </Field>
        <Field label="Branch">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <CategoryPicker
              siteId={siteId}
              categories={localCategories}
              value={categoryId}
              onChange={setCategoryId}
              canManage={canManageCategories}
              branchId={branchId}
              onCategoryCreated={(c) => { setLocalCategories((prev) => [...prev, c]); onCategoryCreated(c) }}
            />
          </Field>
          <Field label="Frequency">
            <select
              value={frequencyMinutes ?? 'null'}
              onChange={(e) => setFrequencyMinutes(e.target.value === 'null' ? null : Number(e.target.value))}
              className={inputCls}
            >
              {FREQUENCY_PRESETS.map((p) => (
                <option key={String(p.minutes)} value={p.minutes ?? 'null'}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Checklist template">
          <TaskListEditor tasks={tasks} onChange={setTasks} />
        </Field>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-2 flex gap-2">
          <button type="submit" disabled={submitting || !name.trim()} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create area'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function EditAreaModal({
  area,
  categories,
  onClose,
  onSaved,
}: {
  area: Area
  categories: LocationCategory[]
  onClose: () => void
  onSaved: (area: Area) => void
}) {
  const [name, setName] = useState(area.name)
  const [categoryId, setCategoryId] = useState<string | null>(area.categoryId ?? categories.find((c) => c.slug === area.category)?.id ?? null)
  const [tasks, setTasks] = useState<string[]>(area.taskTemplate)
  const [active, setActive] = useState(area.active)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Include the area's current category even if it was archived, so the label doesn't vanish.
  const options = useMemo(() => {
    const list = [...categories]
    if (area.categoryId && !list.some((c) => c.id === area.categoryId)) {
      const stray = categories.find((c) => c.id === area.categoryId)
      if (stray) list.push(stray)
    }
    return list
  }, [categories, area.categoryId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const category = options.find((c) => c.id === categoryId)
      const patch: UpdateAreaInput = {
        name: name.trim(),
        category: category?.slug ?? area.category,
        categoryId: categoryId ?? undefined,
        taskTemplate: tasks.map((t) => t.trim()).filter(Boolean),
        active,
      }
      const updated = await repo.updateArea(area.id, patch)
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Edit area" subtitle={area.code} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)} className={inputCls}>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')} className={inputCls}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        {active !== area.active && (
          <p className="-mt-1.5 text-[11px] text-ink-soft">
            {active
              ? 'Reactivating opens a fresh unassigned cleaning task for this area.'
              : "Deactivating removes this area's unfinished cleaning tasks from the board. Staff won't be able to submit proof for it."}
          </p>
        )}
        <Field label="Checklist template">
          <TaskListEditor tasks={tasks} onChange={setTasks} />
        </Field>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-1 flex gap-2">
          <button type="submit" disabled={submitting || !name.trim()} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Close
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
