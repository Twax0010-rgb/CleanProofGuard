import { Fragment, useEffect, useMemo, useState } from 'react'
import { DateRangePicker } from '../components/ui/DateRangePicker'
import { repo } from '../lib/repo'
import {
  buildReportRows,
  dateRangeFileTag,
  defaultFieldsFor,
  formatDateRangeLabel,
  REPORT_FIELDS,
  REPORT_TYPE_LABELS,
  REPORT_TYPES,
  resolveDateRange,
} from '../lib/reports'
import type { DateRange, ReportRow } from '../lib/reports'
import type { AdminUser, Area, Assignment, AuditLogEntry, Issue, ReportTemplate, ReportType, Staff } from '../lib/types'
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from '../lib/reportExport'

const PAGE_SIZE = 25

export function ReportBuilderPanel({
  admin,
  assignments,
  areas,
  staff,
  issues,
  auditLog,
}: {
  admin: AdminUser
  assignments: Assignment[]
  areas: Area[]
  staff: Staff[]
  issues: Issue[]
  auditLog: AuditLogEntry[]
}) {
  const [reportType, setReportType] = useState<ReportType>('cleaning_proof')
  const [range, setRange] = useState<DateRange>(() => resolveDateRange('today'))
  const [selectedFields, setSelectedFields] = useState<string[]>(() => defaultFieldsFor('cleaning_proof'))
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [groupBy, setGroupBy] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [shareTemplate, setShareTemplate] = useState(false)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)

  useEffect(() => {
    repo.listReportTemplates(admin.siteId, admin.id).then(setTemplates)
  }, [admin.siteId, admin.id])

  const allFields = REPORT_FIELDS[reportType]
  const fieldsByCategory = useMemo(() => {
    const groups = new Map<string, typeof allFields>()
    for (const f of allFields) {
      const list = groups.get(f.category) ?? []
      list.push(f)
      groups.set(f.category, list)
    }
    return [...groups.entries()]
  }, [allFields])

  function changeReportType(type: ReportType) {
    setReportType(type)
    setSelectedFields(defaultFieldsFor(type))
    setSortKey(null)
    setGroupBy(null)
    setPage(1)
    setActiveTemplateId(null)
    setTemplateName('')
  }

  function toggleField(key: string) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    setPage(1)
  }

  function moveField(key: string, dir: -1 | 1) {
    setSelectedFields((prev) => {
      const i = prev.indexOf(key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const rows = useMemo(
    () => buildReportRows(reportType, { assignments, areas, staff, issues, auditLog }, range),
    [reportType, assignments, areas, staff, issues, auditLog, range],
  )

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
  }, [rows, search])

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredRows, sortKey, sortDir])

  const groupedRows = useMemo(() => {
    if (!groupBy) return null
    const groups = new Map<string, ReportRow[]>()
    for (const row of sortedRows) {
      const key = String(row[groupBy] ?? '—')
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }
    return groups
  }, [sortedRows, groupBy])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const pagedRows = groupedRows ? sortedRows : sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  async function saveTemplate() {
    if (!templateName.trim() || selectedFields.length === 0) return
    setSavingTemplate(true)
    try {
      const saved = await repo.saveReportTemplate(admin.siteId, admin.id, {
        id: activeTemplateId ?? undefined,
        name: templateName.trim(),
        reportType,
        fields: selectedFields,
        sortBy: sortKey,
        groupBy,
        shared: shareTemplate,
      })
      setTemplates((prev) => (prev.some((t) => t.id === saved.id) ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]))
      setActiveTemplateId(saved.id)
    } finally {
      setSavingTemplate(false)
    }
  }

  function loadTemplate(t: ReportTemplate) {
    setReportType(t.reportType)
    setSelectedFields(t.fields)
    setSortKey(t.sortBy)
    setGroupBy(t.groupBy)
    setTemplateName(t.name)
    setShareTemplate(t.shared)
    setActiveTemplateId(t.id)
    setPage(1)
  }

  async function deleteTemplate(id: string) {
    await repo.deleteReportTemplate(id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    if (activeTemplateId === id) {
      setActiveTemplateId(null)
      setTemplateName('')
    }
  }

  const fileBase = `${REPORT_TYPE_LABELS[reportType].replace(/[^A-Za-z0-9]+/g, '_')}_${dateRangeFileTag(range)}`
  const displayFields = allFields.filter((f) => selectedFields.includes(f.key))

  async function doExport(format: 'xlsx' | 'csv' | 'pdf') {
    const exportRows = sortedRows
    if (format === 'xlsx') exportRowsToXlsx(exportRows, displayFields, fileBase)
    else if (format === 'csv') exportRowsToCsv(exportRows, displayFields, fileBase)
    else exportRowsToPdf(exportRows, displayFields, fileBase, REPORT_TYPE_LABELS[reportType], formatDateRangeLabel(range))
    await repo.logReportExport(
      admin.siteId,
      REPORT_TYPE_LABELS[reportType],
      `${format.toUpperCase()} · ${displayFields.length} fields · ${formatDateRangeLabel(range)}`,
    )
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Report type</div>
          <div className="flex flex-col gap-1">
            {REPORT_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => changeReportType(type)}
                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  reportType === type ? 'bg-ink text-white' : 'text-ink hover:bg-app'
                }`}
              >
                {REPORT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Date range</div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Fields</div>
            <div className="flex gap-2 text-[11px] font-bold">
              <button onClick={() => setSelectedFields(allFields.map((f) => f.key))} className="text-verified-ink">
                All
              </button>
              <button onClick={() => setSelectedFields([])} className="text-ink-soft">
                Clear
              </button>
              <button onClick={() => setSelectedFields(defaultFieldsFor(reportType))} className="text-ink-soft">
                Default
              </button>
            </div>
          </div>
          <div className="flex max-h-56 flex-col gap-2.5 overflow-auto pr-1">
            {fieldsByCategory.map(([category, fields]) => (
              <div key={category}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{category}</div>
                {fields.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" checked={selectedFields.includes(f.key)} onChange={() => toggleField(f.key)} />
                    {f.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {selectedFields.length === 0 && <p className="mt-2 text-[11px] text-overdue">Select at least one field to export.</p>}
        </div>

        {displayFields.length > 0 && (
          <div className="rounded-2xl border border-line bg-white p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Column order</div>
            <div className="flex flex-col gap-1">
              {displayFields.map((f, i) => (
                <div key={f.key} className="flex items-center gap-1.5 rounded-lg bg-app px-2 py-1 text-xs">
                  <span className="flex-1 truncate font-semibold">{f.label}</span>
                  <button disabled={i === 0} onClick={() => moveField(f.key, -1)} className="disabled:opacity-30">
                    ↑
                  </button>
                  <button disabled={i === displayFields.length - 1} onClick={() => moveField(f.key, 1)} className="disabled:opacity-30">
                    ↓
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Group by</div>
          <select
            value={groupBy ?? ''}
            onChange={(e) => setGroupBy(e.target.value || null)}
            className="w-full rounded-lg border border-line bg-app px-2.5 py-2 text-sm"
          >
            <option value="">No grouping</option>
            {allFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Saved templates</div>
          <div className="mb-2 flex flex-col gap-1">
            {templates.length === 0 && <p className="text-xs text-muted">No saved templates yet.</p>}
            {templates
              .filter((t) => t.reportType === reportType)
              .map((t) => (
                <div key={t.id} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${activeTemplateId === t.id ? 'bg-verified-tint' : 'bg-app'}`}>
                  <button onClick={() => loadTemplate(t)} className="flex-1 truncate text-left font-semibold">
                    {t.name} {t.shared && <span className="text-muted">· shared</span>}
                  </button>
                  {t.ownerAdminId === admin.id && (
                    <button onClick={() => deleteTemplate(t.id)} className="text-overdue">
                      ×
                    </button>
                  )}
                </div>
              ))}
          </div>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            className="mb-1.5 w-full rounded-lg border border-line bg-app px-2.5 py-2 text-xs outline-none"
          />
          <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={shareTemplate} onChange={(e) => setShareTemplate(e.target.checked)} />
            Share with team
          </label>
          <button
            onClick={saveTemplate}
            disabled={!templateName.trim() || selectedFields.length === 0 || savingTemplate}
            className="h-8 w-full rounded-lg bg-ink text-xs font-bold text-white disabled:opacity-40"
          >
            {activeTemplateId ? 'Update template' : 'Save as template'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-white p-3.5">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-app px-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search results"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <span className="text-xs text-muted">{sortedRows.length} rows</span>
          <div className="h-6 w-px bg-line" />
          <button
            onClick={() => doExport('xlsx')}
            disabled={displayFields.length === 0}
            className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft disabled:opacity-40"
          >
            Excel
          </button>
          <button
            onClick={() => doExport('csv')}
            disabled={displayFields.length === 0}
            className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft disabled:opacity-40"
          >
            CSV
          </button>
          <button
            onClick={() => doExport('pdf')}
            disabled={displayFields.length === 0}
            className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft disabled:opacity-40"
          >
            PDF
          </button>
        </div>

        <div className="flex-1 overflow-auto rounded-2xl border border-line bg-white">
          {displayFields.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">Select at least one field to see results.</div>
          ) : sortedRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">No data for this report type in the selected range.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-app text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  {displayFields.map((f) => (
                    <th key={f.key} onClick={() => handleSort(f.key)} className="cursor-pointer whitespace-nowrap px-3.5 py-2.5">
                      {f.label}
                      {sortKey === f.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows
                  ? [...groupedRows.entries()].map(([group, groupRows]) => (
                      <Fragment key={`group-${group}`}>
                        <tr className="bg-app/60">
                          <td colSpan={displayFields.length} className="px-3.5 py-1.5 text-xs font-bold text-ink-soft">
                            {group} · {groupRows.length}
                          </td>
                        </tr>
                        {groupRows.map((row, i) => (
                          <tr key={`${group}-${i}`} className="border-t border-line-softer">
                            {displayFields.map((f) => (
                              <td key={f.key} className="whitespace-nowrap px-3.5 py-2 text-ink">
                                {row[f.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  : pagedRows.map((row, i) => (
                      <tr key={i} className="border-t border-line-softer">
                        {displayFields.map((f) => (
                          <td key={f.key} className="whitespace-nowrap px-3.5 py-2 text-ink">
                            {row[f.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          )}
        </div>

        {!groupedRows && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="text-xs font-bold text-ink-soft disabled:opacity-30">
              ← Prev
            </button>
            <span className="text-xs text-muted">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs font-bold text-ink-soft disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
