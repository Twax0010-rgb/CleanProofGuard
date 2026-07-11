import { repo } from '../lib/repo'

/**
 * Offline outbox for staff proof submissions.
 *
 * When a submission can't reach the backend (offline, flaky signal), the whole
 * local state of the checklist — ticked tasks, photos, note — is queued here and
 * marked "Pending sync". Sync replays it once the connection returns, and
 * dedupes by re-reading the assignment first: anything already `done` on the
 * backend is dropped, and only ticks/photos the backend is missing are replayed,
 * so retries never double-submit.
 */

const KEY = 'cpg_staff_outbox_v1'

export interface OutboxItem {
  /** Client-generated id, stable across retries. */
  id: string
  assignmentId: string
  areaName: string
  areaCode: string
  completedTaskIds: string[]
  photos: Array<{ label: 'before' | 'after'; dataUrl: string }>
  note: string
  queuedAt: string
  lastError: string | null
}

const listeners = new Set<() => void>()
let snapshot: OutboxItem[] | null = null

function notify() {
  listeners.forEach((l) => l())
}

function read(): OutboxItem[] {
  if (snapshot) return snapshot
  try {
    snapshot = JSON.parse(localStorage.getItem(KEY) ?? '[]') as OutboxItem[]
  } catch {
    snapshot = []
  }
  return snapshot
}

function write(items: OutboxItem[]) {
  snapshot = items
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Quota exceeded (photos are data URLs) — keep the in-memory queue so the
    // session can still sync; it just won't survive a full app restart.
  }
  notify()
}

/** Stable-reference snapshot for useSyncExternalStore. */
export function getOutbox(): OutboxItem[] {
  return read()
}

export function onOutboxChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** True when err looks like a connectivity failure rather than a server rejection. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (err instanceof TypeError) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
}

/** Queue (or re-queue) a submission. One entry per assignment — re-submitting replaces it. */
export function enqueueSubmission(item: Omit<OutboxItem, 'id' | 'queuedAt' | 'lastError'>) {
  const rest = read().filter((i) => i.assignmentId !== item.assignmentId)
  write([
    ...rest,
    { ...item, id: crypto.randomUUID(), queuedAt: new Date().toISOString(), lastError: null },
  ])
}

export function removeOutboxItem(id: string) {
  write(read().filter((i) => i.id !== id))
}

let syncing = false

export function isSyncing() {
  return syncing
}

/**
 * Replays every queued submission. Safe to call repeatedly: a run is skipped
 * while one is in flight, and each item is verified against the backend before
 * anything is written.
 */
export async function syncOutbox(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  syncing = true
  notify()
  let synced = 0
  let failed = 0
  try {
    for (const item of [...read()]) {
      try {
        const fresh = await repo.getAssignment(item.assignmentId)
        if (!fresh) {
          // Assignment was cancelled/removed by an admin — nothing to sync to.
          removeOutboxItem(item.id)
          continue
        }
        if (fresh.status === 'done') {
          // Already submitted (an earlier retry, or another device) — drop, don't duplicate.
          removeOutboxItem(item.id)
          synced++
          continue
        }
        for (const t of fresh.tasks) {
          if (item.completedTaskIds.includes(t.id) && !t.completed) {
            await repo.toggleTask(item.assignmentId, t.id)
          }
        }
        for (const p of item.photos) {
          if (!fresh.photos.some((fp) => fp.label === p.label)) {
            await repo.addPhoto(item.assignmentId, p.label, p.dataUrl)
          }
        }
        if (item.note.trim()) await repo.setNote(item.assignmentId, item.note.trim())
        await repo.submitProof(item.assignmentId)
        removeOutboxItem(item.id)
        synced++
      } catch (err) {
        failed++
        write(
          read().map((i) =>
            i.id === item.id
              ? { ...i, lastError: err instanceof Error ? err.message : 'Sync failed' }
              : i,
          ),
        )
        if (isNetworkError(err)) break // still offline — stop and wait for the next 'online'
      }
    }
  } finally {
    syncing = false
    notify()
  }
  return { synced, failed }
}

/** Wire up automatic sync: on regaining connectivity, and once shortly after app start. */
export function initOutboxSync() {
  window.addEventListener('online', () => void syncOutbox())
  if (read().length > 0 && navigator.onLine) {
    setTimeout(() => void syncOutbox(), 2500)
  }
}
