/**
 * PWA plumbing for the staff app: captures Chrome's install prompt, detects
 * standalone/iOS, and registers the app-shell service worker (production only —
 * a caching worker in dev fights Vite's module server).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

/** Subscribe to install-state changes (for useSyncExternalStore). Returns unsubscribe. */
export function onInstallStateChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** True when already running as an installed app (Android standalone or iOS home-screen). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports as Mac, so also sniff for touch on "Mac".
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

/** Chrome/Edge on Android (and desktop) fire beforeinstallprompt; null elsewhere (all of iOS). */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null
}

export function isInstalled(): boolean {
  return installed
}

/** Re-fires the browser install prompt captured earlier. Resolves to the user's choice. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  const evt = deferredPrompt
  await evt.prompt()
  const choice = await evt.userChoice
  if (choice.outcome === 'accepted') deferredPrompt = null
  notify()
  return choice.outcome
}

export function initStaffPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own Install button
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    notify()
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* shell caching is best-effort — the app works without it */
    })
  }
}
