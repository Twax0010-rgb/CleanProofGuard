import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function useQrDataUrl(url: string, size = 160): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { width: size, margin: 1, color: { dark: '#1D231F', light: '#FFFFFF' } })
      .then((d) => !cancelled && setDataUrl(d))
      .catch(() => !cancelled && setDataUrl(null))
    return () => {
      cancelled = true
    }
  }, [url, size])

  return dataUrl
}

/** Renders a QR code that opens the public /verify page for an area. */
export function QrTag({ url, size = 160 }: { url: string; size?: number }) {
  const dataUrl = useQrDataUrl(url, size)

  if (!dataUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-line-soft text-xs text-muted"
        style={{ width: size, height: size }}
      >
        Generating…
      </div>
    )
  }

  return <img src={dataUrl} alt="QR tag" width={size} height={size} className="rounded-lg" />
}
