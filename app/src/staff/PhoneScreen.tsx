import type { ReactNode } from 'react'

interface PhoneScreenProps {
  children: ReactNode
  className?: string
  bg?: string
}

/** Full-height, phone-first page shell shared by every staff screen. */
export function PhoneScreen({ children, className = '', bg = 'bg-app' }: PhoneScreenProps) {
  return (
    <div className={`mx-auto flex min-h-dvh w-full max-w-[480px] flex-col ${bg} ${className}`}>
      {children}
    </div>
  )
}
