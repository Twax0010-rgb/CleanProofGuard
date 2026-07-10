import { useRef } from 'react'

interface PinDotsProps {
  value: string
  onChange: (value: string) => void
  length?: number
  autoFocus?: boolean
}

export function PinDots({ value, onChange, length = 6, autoFocus }: PinDotsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="relative flex cursor-text items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-4"
      style={{ height: 52 }}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="PIN"
        maxLength={length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full transition"
          style={{ background: i < value.length ? '#fff' : 'rgba(255,255,255,0.3)' }}
        />
      ))}
    </div>
  )
}
