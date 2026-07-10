import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'dark' | 'ghost-dark'
type Size = 'lg' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  fullWidth?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-verified text-white shadow-[0_10px_22px_-8px_rgba(33,107,75,0.5)] hover:brightness-105 disabled:opacity-50 disabled:shadow-none',
  secondary: 'bg-white text-ink border border-stroke hover:bg-line-soft',
  dark: 'bg-ink text-white hover:brightness-110',
  'ghost-dark':
    'bg-white/10 text-white border border-white/25 hover:bg-white/15',
}

const SIZES: Record<Size, string> = {
  lg: 'h-14 px-6 text-[16px] rounded-2xl',
  md: 'h-11 px-4 text-[14px] rounded-xl',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 font-extrabold transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
