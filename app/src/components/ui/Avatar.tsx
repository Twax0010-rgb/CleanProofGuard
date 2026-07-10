interface AvatarProps {
  initials: string
  colorHex: string
  size?: number
  ring?: boolean
}

export function Avatar({ initials, colorHex, size = 36, ring = false }: AvatarProps) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: colorHex,
        fontSize: Math.round(size * 0.36),
        border: ring ? '2px solid #fff' : undefined,
      }}
    >
      {initials}
    </div>
  )
}
