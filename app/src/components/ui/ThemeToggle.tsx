import { useEffect, useState } from 'react'

const THEME_KEY = 'cpg_theme'

/** Apply the persisted theme before first paint — called once from main.tsx. */
export function initTheme() {
  if (localStorage.getItem(THEME_KEY) === 'dark') {
    document.documentElement.classList.add('dark')
  }
}

function isDarkNow() {
  return document.documentElement.classList.contains('dark')
}

/** Light/dark switch. The palette lives in CSS variables (see index.css), so toggling a
 * `.dark` class on <html> re-skins every screen — admin, staff, and public pages alike. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(isDarkNow)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark])

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-soft hover:text-ink ${className}`}
    >
      {dark ? (
        // sun
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // moon
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
