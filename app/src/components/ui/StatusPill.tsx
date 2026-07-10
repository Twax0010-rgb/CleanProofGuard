import type { ReactNode } from 'react'

export type PillTone = 'verified' | 'todo' | 'overdue' | 'info' | 'attention' | 'ink'

const TONES: Record<PillTone, string> = {
  verified: 'bg-verified-tint text-verified-ink',
  todo: 'bg-line-soft text-ink-soft',
  overdue: 'bg-overdue-tint text-overdue',
  info: 'bg-info-tint text-info-ink',
  attention: 'bg-attention/15 text-attention',
  ink: 'bg-verified text-white',
}

interface StatusPillProps {
  tone: PillTone
  children: ReactNode
  dot?: boolean
  className?: string
}

export function StatusPill({ tone, children, dot = false, className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${TONES[tone]} ${className}`}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              tone === 'verified'
                ? '#216B4B'
                : tone === 'overdue'
                  ? '#B3261E'
                  : tone === 'info'
                    ? '#35668C'
                    : tone === 'attention'
                      ? '#B27A0F'
                      : '#808B81',
          }}
        />
      )}
      {children}
    </span>
  )
}
