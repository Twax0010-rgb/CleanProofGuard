import * as XLSX from 'xlsx'
import type { ReportField, ReportRow } from './reports'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Fields whose values should stay text in Excel even if they look numeric, so leading zeros / dashes in codes survive. */
const CODE_LIKE_KEYS = new Set(['areaCode', 'staffCode', 'qrCodeId', 'area_code'])

export function exportRowsToXlsx(rows: ReportRow[], fields: ReportField[], fileBase: string) {
  const data = rows.map((row) => {
    const out: Record<string, string | number> = {}
    for (const f of fields) {
      const value = row[f.key]
      out[f.label] = CODE_LIKE_KEYS.has(f.key) ? `${value}` : value
    }
    return out
  })
  const sheet = XLSX.utils.json_to_sheet(data)
  // Force code-like columns to explicit text format so Excel doesn't strip leading zeros.
  const codeColIndexes = fields.map((f, i) => (CODE_LIKE_KEYS.has(f.key) ? i : -1)).filter((i) => i >= 0)
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (const c of codeColIndexes) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell) cell.t = 's'
    }
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report')
  XLSX.writeFile(workbook, `${fileBase}.xlsx`)
}

function csvEscape(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportRowsToCsv(rows: ReportRow[], fields: ReportField[], fileBase: string) {
  const header = fields.map((f) => csvEscape(f.label)).join(',')
  const lines = rows.map((row) => fields.map((f) => csvEscape(row[f.key])).join(','))
  const csv = [header, ...lines].join('\n')
  // UTF-8 BOM so Excel doesn't mangle non-ASCII characters.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, `${fileBase}.csv`)
}

export interface PdfReportMeta {
  title: string
  /** The branch the report was run against, e.g. "Southwest Hospital" or "All branches". */
  branchLabel: string
  dateRangeLabel: string
  /** Any filter/search narrowing applied on top of the report type. */
  filterLabel?: string
  generatedBy: string
  /** When set, rows are broken into sections under this column's value, mirroring the on-screen
   * grouping. Carries the key as well as the label because a report can be grouped by a column it
   * doesn't display — looking the key up among the visible fields would silently drop the grouping. */
  groupBy?: { key: string; label: string }
}

/** Splits rows into the same sections the builder shows on screen, keyed by the grouped column's value. */
function groupRows(rows: ReportRow[], key: string): [string, ReportRow[]][] {
  const groups = new Map<string, ReportRow[]>()
  for (const row of rows) {
    const k = String(row[key] ?? '—')
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  return [...groups.entries()]
}

/** Opens a print-friendly report in a new tab — the browser's own "Print > Save as PDF" produces the
 * actual file, avoiding a heavy PDF-rendering dependency. It's laid out as a signed-off compliance
 * document (letterhead, the filters it was run under, who ran it) because that's what gets filed. */
export function exportRowsToPdf(rows: ReportRow[], fields: ReportField[], fileBase: string, meta: PdfReportMeta) {
  const win = window.open('', '_blank')
  if (!win) return

  const cells = (row: ReportRow) => fields.map((f) => `<td>${escapeHtml(String(row[f.key] ?? ''))}</td>`).join('')
  const headerRow = `<tr>${fields.map((f) => `<th>${escapeHtml(f.label)}</th>`).join('')}</tr>`

  const body = meta.groupBy
    ? groupRows(rows, meta.groupBy.key)
        .map(
          ([group, groupRows_]) =>
            `<tr class="group"><td colspan="${fields.length}">${escapeHtml(group)} · ${groupRows_.length}</td></tr>` +
            groupRows_.map((row) => `<tr>${cells(row)}</tr>`).join(''),
        )
        .join('')
    : rows.map((row) => `<tr>${cells(row)}</tr>`).join('')

  const facts: [string, string][] = [
    ['Branch', meta.branchLabel],
    ['Period', meta.dateRangeLabel],
    ...(meta.filterLabel ? ([['Filter', meta.filterLabel]] as [string, string][]) : []),
    ...(meta.groupBy ? ([['Grouped by', meta.groupBy.label]] as [string, string][]) : []),
    ['Rows', String(rows.length)],
    ['Generated', `${new Date().toLocaleString()} · ${meta.generatedBy}`],
  ]

  win.document.write(`
    <!doctype html>
    <html>
    <head>
      <title>${escapeHtml(fileBase)}</title>
      <meta charset="utf-8" />
      <style>
        @page { size: A4 landscape; margin: 14mm; }
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1D231F; }
        .head { border-bottom: 2px solid #1D231F; padding-bottom: 10px; margin-bottom: 12px; }
        .brand { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #5E6B76; }
        h1 { font-size: 20px; margin: 2px 0 0; }
        .facts { display: flex; flex-wrap: wrap; gap: 4px 20px; margin-bottom: 14px; font-size: 11px; }
        .facts div { color: #5E6B76; }
        .facts b { color: #1D231F; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td { border: 1px solid #E6EAEC; padding: 5px 7px; text-align: left; vertical-align: top; }
        th { background: #F4F7F7; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; color: #5E6B76; }
        tr.group td { background: #EDF1F0; font-weight: 700; font-size: 10px; }
        tbody tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
        .foot { margin-top: 14px; font-size: 9px; color: #808B81; text-align: center; }
        @media print { body { padding: 0; } .foot { position: fixed; bottom: 0; left: 0; right: 0; } }
      </style>
    </head>
    <body>
      <div class="head">
        <div class="brand">Clean Proof Guard</div>
        <h1>${escapeHtml(meta.title)}</h1>
      </div>
      <div class="facts">
        ${facts.map(([k, v]) => `<div>${escapeHtml(k)}: <b>${escapeHtml(v)}</b></div>`).join('')}
      </div>
      <table>
        <thead>${headerRow}</thead>
        <tbody>${body}</tbody>
      </table>
      <div class="foot">Generated from Clean Proof Guard · Powered by Touchstone Facility Management Academy</div>
      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
