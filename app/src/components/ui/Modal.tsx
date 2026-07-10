import type { ReactNode } from 'react'

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <div className="text-lg font-extrabold">{title}</div>
          {subtitle && <div className="mt-0.5 text-sm text-ink-soft">{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-ink-soft">{label}</div>
      {children}
    </div>
  )
}

export const inputCls = 'w-full rounded-xl border border-line bg-app px-3.5 py-2.5 text-sm outline-none focus:border-stroke-soft'
