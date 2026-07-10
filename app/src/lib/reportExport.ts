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

/** Opens a print-friendly summary in a new tab — the browser's own "Print > Save as PDF" produces the actual file, avoiding a heavy PDF-rendering dependency for what's meant to be a simple summary layout. */
export function exportRowsToPdf(rows: ReportRow[], fields: ReportField[], fileBase: string, reportTitle: string, dateRangeLabel: string) {
  const win = window.open('', '_blank')
  if (!win) return
  const rowsHtml = rows
    .map((row) => `<tr>${fields.map((f) => `<td>${escapeHtml(String(row[f.key] ?? ''))}</td>`).join('')}</tr>`)
    .join('')
  win.document.write(`
    <!doctype html>
    <html>
    <head>
      <title>${escapeHtml(fileBase)}</title>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1D231F; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 12px; color: #5E6B76; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #E6EAEC; padding: 6px 8px; text-align: left; }
        th { background: #F4F7F7; text-transform: uppercase; font-size: 10px; color: #5E6B76; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(reportTitle)}</h1>
      <div class="meta">${escapeHtml(dateRangeLabel)} · ${rows.length} rows · Clean Proof Guard</div>
      <table>
        <thead><tr>${fields.map((f) => `<th>${escapeHtml(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
