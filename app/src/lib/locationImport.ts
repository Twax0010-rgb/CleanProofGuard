import { formatFrequency } from './domain'
import type { ReportField } from './reports'
import type { Area } from './types'

export interface AreaImportRow {
  rowNumber: number
  code: string
  name: string
  /** Category slug — any value is accepted; the repo links it to a matching category if one exists. */
  category: string
  frequencyMinutes: number | null
  taskTemplate: string[]
  active: boolean
  /** True if this code matches an existing area — the import will update it rather than create a new one. */
  isUpdate: boolean
}

export interface AreaImportError {
  rowNumber: number
  column: string
  message: string
}

export interface ParsedImport {
  valid: AreaImportRow[]
  errors: AreaImportError[]
}

const IMPORT_COLUMNS = ['area_code', 'area_name', 'category', 'cleaning_frequency', 'checklist_template', 'active_status'] as const

/** Minimal hand-written RFC4180-ish CSV parser — deliberately not using a third-party
 * spreadsheet-parsing library here, since that would mean running untrusted uploaded
 * file content through it (see the xlsx-package vulnerability note elsewhere in this repo). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildLocationImportTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(',')
  const example = [
    'CPG-3M-014',
    "L3 · Men's Restroom",
    'bathroom',
    '60',
    'Mop & disinfect floor;Refill soap & paper towels;Empty & reline bins',
    'active',
  ]
  return [header, example.map(csvEscape).join(',')].join('\n')
}

export function parseLocationImportCsv(text: string, existingCodes: Set<string>): ParsedImport {
  const table = parseCsv(text)
  if (table.length === 0) {
    return { valid: [], errors: [{ rowNumber: 0, column: 'file', message: 'The file is empty.' }] }
  }
  const header = table[0].map((h) => h.trim().toLowerCase())
  const colIndex = (key: string) => header.indexOf(key)
  for (const key of ['area_code', 'area_name', 'active_status']) {
    if (colIndex(key) < 0) {
      return {
        valid: [],
        errors: [{ rowNumber: 0, column: key, message: `Missing required column "${key}". Download the template to see the expected format.` }],
      }
    }
  }

  const valid: AreaImportRow[] = []
  const errors: AreaImportError[] = []
  const seenCodes = new Set<string>()

  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const rowNumber = i + 1 // 1-indexed, header counted as row 1
    const get = (key: string) => (colIndex(key) >= 0 ? (cells[colIndex(key)] ?? '').trim() : '')

    const code = get('area_code')
    const name = get('area_name')
    const categoryRaw = get('category').toLowerCase()
    const frequencyRaw = get('cleaning_frequency').toLowerCase()
    const templateRaw = get('checklist_template')
    const activeRaw = get('active_status').toLowerCase()

    if (!code) {
      errors.push({ rowNumber, column: 'area_code', message: 'Area code is required.' })
      continue
    }
    if (!name) {
      errors.push({ rowNumber, column: 'area_name', message: 'Area name is required.' })
      continue
    }
    if (seenCodes.has(code.toLowerCase())) {
      errors.push({ rowNumber, column: 'area_code', message: `Duplicate area code "${code}" within this file.` })
      continue
    }
    // Any category is accepted; it's slugified and linked to an existing category if one matches
    // (missing categories keep the label but stay unlinked until a superuser creates them).
    const category: string = categoryRaw ? categoryRaw.trim().toLowerCase().replace(/\s+/g, '-') : 'other'
    let frequencyMinutes: number | null = null
    if (frequencyRaw && frequencyRaw !== 'manual') {
      const parsed = Number(frequencyRaw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errors.push({ rowNumber, column: 'cleaning_frequency', message: `"${frequencyRaw}" must be a positive number of minutes, or "manual".` })
        continue
      }
      frequencyMinutes = parsed
    }
    if (activeRaw !== 'active' && activeRaw !== 'inactive') {
      errors.push({ rowNumber, column: 'active_status', message: `"${activeRaw}" must be "active" or "inactive".` })
      continue
    }

    seenCodes.add(code.toLowerCase())
    valid.push({
      rowNumber,
      code,
      name,
      category,
      frequencyMinutes,
      taskTemplate: templateRaw
        ? templateRaw
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      active: activeRaw === 'active',
      isUpdate: existingCodes.has(code.toLowerCase()),
    })
  }

  return { valid, errors }
}

export function buildErrorReportCsv(errors: AreaImportError[]): string {
  const header = 'row,column,error'
  const lines = errors.map((e) => [String(e.rowNumber), e.column, e.message].map(csvEscape).join(','))
  return [header, ...lines].join('\n')
}

export const AREA_EXPORT_FIELDS: ReportField[] = [
  { key: 'area_code', label: 'area_code', category: 'Location' },
  { key: 'area_name', label: 'area_name', category: 'Location' },
  { key: 'category', label: 'category', category: 'Location' },
  { key: 'cleaning_frequency', label: 'cleaning_frequency', category: 'Location' },
  { key: 'checklist_template', label: 'checklist_template', category: 'Location' },
  { key: 'active_status', label: 'active_status', category: 'Location' },
]

export function buildAreaExportRows(areas: Area[]): Record<string, string | number>[] {
  return areas.map((a) => ({
    area_code: a.code,
    area_name: a.name,
    category: a.category,
    cleaning_frequency: a.frequencyMinutes ?? 'manual',
    checklist_template: a.taskTemplate.join(';'),
    active_status: a.active ? 'active' : 'inactive',
  }))
}

// Re-exported for a friendly display string elsewhere (e.g. import preview table).
export { formatFrequency }
