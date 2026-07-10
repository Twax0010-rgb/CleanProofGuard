import { useEffect, useRef, useState } from 'react'
import { DATE_RANGE_PRESET_LABELS, DATE_RANGE_PRESETS, formatDateRangeLabel, resolveDateRange, toLocalDateStamp } from '../../lib/reports'
import type { DateRange, DateRangePreset } from '../../lib/reports'

function toInputDate(d: Date): string {
  return toLocalDateStamp(d)
}

/** Parse a yyyy-mm-dd input value as *local* midnight. `new Date('2026-07-09')` would parse
 * as UTC midnight, which lands on the previous day in western timezones. */
function fromInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(() => toInputDate(value.start))
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date(value.end.getTime() - 1)))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function pick(preset: DateRangePreset) {
    if (preset === 'custom') {
      onChange(resolveDateRange('custom', fromInputDate(customStart), fromInputDate(customEnd)))
    } else {
      onChange(resolveDateRange(preset))
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9.5 items-center gap-2 rounded-[11px] border border-line bg-white px-3.5 text-sm font-semibold text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5E6B76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        {DATE_RANGE_PRESET_LABELS[value.preset]}
        {value.preset === 'custom' && <span className="text-muted">· {formatDateRangeLabel(value)}</span>}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_40px_rgba(23,33,43,0.18)]">
          <div className="flex flex-col p-1.5">
            {DATE_RANGE_PRESETS.filter((p) => p !== 'custom').map((preset) => (
              <button
                key={preset}
                onClick={() => pick(preset)}
                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  value.preset === preset ? 'bg-ink text-white' : 'text-ink hover:bg-app'
                }`}
              >
                {DATE_RANGE_PRESET_LABELS[preset]}
              </button>
            ))}
          </div>
          <div className="border-t border-line-soft p-3">
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">Custom range</div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded-lg border border-line bg-app px-2 py-1.5 text-xs outline-none"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded-lg border border-line bg-app px-2 py-1.5 text-xs outline-none"
              />
            </div>
            <button
              onClick={() => {
                pick('custom')
                setOpen(false)
              }}
              className="mt-2 h-8 w-full rounded-lg bg-verified text-xs font-bold text-white"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
