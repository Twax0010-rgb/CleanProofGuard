import { activeStaff, formatDuration } from './domain'
import type { Assignment, Staff } from './types'

/**
 * Transit is derived from assignment timestamps, never stored. The app only knows where someone is
 * when they scan a tag, so "scanned out of one area, not yet scanned into the next" is the only
 * honest measure of time spent between rooms — and it's the same reasoning that makes activity feed
 * events and schedule occurrences derived rather than kept in their own tables.
 *
 * What this can't tell you: a gap is a gap. Walking, a tea break, a lift queue, a supply run and
 * standing still all look identical from here. The threshold doesn't decide who was slacking; it
 * decides which gaps are worth asking about.
 */

/** How long a gap can run before it stops looking like walking between rooms. A starting point, not
 * a rule — every caller can override it, so it can be wired to a per-branch setting later without
 * reworking the engine. */
export const TRANSIT_THRESHOLD_MS = 15 * 60_000

export interface TransitPeriod {
  id: string
  staffId: string
  staffName: string
  staffInitials: string
  staffColorHex: string
  branchId: string
  /** The clean they finished before the gap opened. */
  fromAreaName: string
  fromAreaCode: string
  /** Where they turned up next — null while the gap is still open. */
  toAreaName: string | null
  toAreaCode: string | null
  startedAt: string
  endedAt: string | null
  durationMs: number
  /** Longer than plausible walking time, so worth a question. */
  overThreshold: boolean
  /** Still running: they finished a clean and haven't scanned into anything since. */
  open: boolean
}

/** One worked stretch inside an area: scanned in at `start`, proof submitted at `end`. `end` is null
 * while they're still in there, which is exactly when no gap can follow. */
interface WorkedBlock {
  start: number
  end: number | null
  areaName: string
  areaCode: string
}

export function deriveTransitPeriods(
  assignments: Assignment[],
  staff: Staff[],
  opts: { now?: number; thresholdMs?: number } = {},
): TransitPeriod[] {
  const now = opts.now ?? Date.now()
  const thresholdMs = opts.thresholdMs ?? TRANSIT_THRESHOLD_MS
  const periods: TransitPeriod[] = []
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  for (const s of activeStaff(staff)) {
    const blocks: WorkedBlock[] = assignments
      // No startedAt means they never scanned in, so the area tells us nothing about where they were.
      .filter((a) => a.staffId === s.id && a.startedAt)
      .map((a) => ({
        start: new Date(a.startedAt!).getTime(),
        end: a.submittedAt ? new Date(a.submittedAt).getTime() : null,
        areaName: a.areaName,
        areaCode: a.areaCode,
      }))
      .sort((x, y) => x.start - y.start)

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      if (block.end === null) continue // still inside this area — nothing to measure yet
      const next = blocks[i + 1]

      if (next) {
        // Overlapping scans (scanned into the next area before submitting this one) mean there was
        // no gap at all — clamping to zero would invent a period that never happened.
        if (next.start <= block.end) continue
        periods.push(
          buildPeriod(s, block, { start: block.end, end: next.start, toName: next.areaName, toCode: next.areaCode }, thresholdMs),
        )
      } else if (s.status === 'on_shift' && block.end >= startOfToday.getTime() && now > block.end) {
        // A gap that's still open is a claim about where someone is *now*, so it only holds if they
        // finished that clean today and are still on shift. Without the same-day bound, anyone whose
        // last scan was days ago reads as standing in a corridor ever since — the honest reading is
        // that the data doesn't say where they are, and a stale on_shift flag isn't evidence.
        periods.push(buildPeriod(s, block, { start: block.end, end: now, toName: null, toCode: null }, thresholdMs))
      }
    }
  }

  return periods.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

function buildPeriod(
  s: Staff,
  from: WorkedBlock,
  gap: { start: number; end: number; toName: string | null; toCode: string | null },
  thresholdMs: number,
): TransitPeriod {
  const durationMs = gap.end - gap.start
  const open = gap.toName === null
  return {
    id: `${s.id}-${gap.start}`,
    staffId: s.id,
    staffName: s.fullName,
    staffInitials: s.initials,
    staffColorHex: s.colorHex,
    branchId: s.branchId,
    fromAreaName: from.areaName,
    fromAreaCode: from.areaCode,
    toAreaName: gap.toName,
    toAreaCode: gap.toCode,
    startedAt: new Date(gap.start).toISOString(),
    endedAt: open ? null : new Date(gap.end).toISOString(),
    durationMs,
    overThreshold: durationMs > thresholdMs,
    open,
  }
}

export interface TransitSummary {
  staffId: string
  staffName: string
  staffInitials: string
  staffColorHex: string
  /** Completed gaps only — an open one is still growing, so folding it into a total would make the
   * number climb on its own and never settle. It's reported separately as `openMs`. */
  totalMs: number
  count: number
  longestMs: number
  averageMs: number
  overThresholdCount: number
  /** How long they've been between areas right now, if they are. */
  openMs: number | null
}

export function summarizeTransit(periods: TransitPeriod[]): TransitSummary[] {
  const byStaff = new Map<string, TransitPeriod[]>()
  for (const p of periods) byStaff.set(p.staffId, [...(byStaff.get(p.staffId) ?? []), p])

  return [...byStaff.values()]
    .map((list) => {
      const closed = list.filter((p) => !p.open)
      const totalMs = closed.reduce((sum, p) => sum + p.durationMs, 0)
      const openPeriod = list.find((p) => p.open)
      const first = list[0]
      return {
        staffId: first.staffId,
        staffName: first.staffName,
        staffInitials: first.staffInitials,
        staffColorHex: first.staffColorHex,
        totalMs,
        count: closed.length,
        longestMs: closed.reduce((max, p) => Math.max(max, p.durationMs), 0),
        averageMs: closed.length > 0 ? Math.round(totalMs / closed.length) : 0,
        overThresholdCount: list.filter((p) => p.overThreshold).length,
        openMs: openPeriod ? openPeriod.durationMs : null,
      }
    })
    .sort((a, b) => (b.openMs ?? -1) - (a.openMs ?? -1) || b.totalMs - a.totalMs)
}

/** Whoever is between areas right now and past the threshold — the people a supervisor could
 * redeploy, longest wait first. */
export function idleNow(periods: TransitPeriod[]): TransitPeriod[] {
  return periods.filter((p) => p.open && p.overThreshold).sort((a, b) => b.durationMs - a.durationMs)
}

export function formatTransit(ms: number): string {
  return ms < 60_000 ? 'under a minute' : formatDuration(ms)
}
