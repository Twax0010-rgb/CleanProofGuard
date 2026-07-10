import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  tone?: 'light' | 'dark'
}

export function IconButton({ children, tone = 'dark', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      className={`flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition ${
        tone === 'dark' ? 'bg-white/12 text-white hover:bg-white/20' : 'bg-app text-ink hover:bg-line-soft'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
