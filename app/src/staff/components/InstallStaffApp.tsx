import { useState, useSyncExternalStore } from 'react'
import {
  canPromptInstall,
  isInstalled,
  isIos,
  isStandalone,
  onInstallStateChange,
  promptInstall,
} from '../pwa'

/**
 * "Install Staff App" affordance for the staff sign-in screen and profile menu.
 * - Android/Chrome: re-fires the captured beforeinstallprompt.
 * - iOS Safari (no install prompt API): shows Add-to-Home-Screen instructions.
 * - Hidden entirely once installed or when already running standalone.
 */
export function InstallStaffApp({ dark = false }: { dark?: boolean }) {
  const state = useSyncExternalStore(onInstallStateChange, () =>
    `${canPromptInstall()}|${isInstalled()}`,
  )
  const [showIosHelp, setShowIosHelp] = useState(false)
  const canPrompt = state.startsWith('true')

  if (isStandalone() || isInstalled()) return null
  if (!canPrompt && !isIos()) return null

  const buttonClass = `flex h-[46px] w-full items-center justify-center gap-2 rounded-xl border text-[14px] font-bold ${
    dark
      ? 'border-white/25 bg-white/10 text-white hover:bg-white/15'
      : 'border-line bg-white text-ink hover:bg-line-softer'
  }`

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (canPrompt) void promptInstall()
          else setShowIosHelp((v) => !v)
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 10l5 5 5-5" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        Install Staff App
      </button>
      {showIosHelp && !canPrompt && (
        <p className={`text-center text-[12px] leading-relaxed ${dark ? 'text-white/70' : 'text-muted'}`}>
          Open this page in <strong>Safari</strong>, tap <strong>Share</strong>, then{' '}
          <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  )
}
