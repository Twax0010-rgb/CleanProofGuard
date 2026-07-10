import { QrTag, useQrDataUrl } from './QrTag'

export function QrModal({
  areaName,
  url,
  onClose,
}: {
  areaName: string
  url: string
  onClose: () => void
}) {
  const dataUrl = useQrDataUrl(url, 240)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xs flex-col items-center rounded-2xl bg-white p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-extrabold">{areaName}</div>
        <p className="mt-1 text-xs text-ink-soft">
          Print this and stick it at the entrance. Anyone can scan it to see when this area was
          last cleaned.
        </p>
        <div className="mt-4">
          <QrTag url={url} size={240} />
        </div>
        <div className="mt-3 break-all font-mono text-[11px] text-muted">{url}</div>
        <div className="mt-4 flex w-full gap-2">
          {dataUrl && (
            <a
              href={dataUrl}
              download={`${areaName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`}
              className="flex h-10 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white"
            >
              Download
            </a>
          )}
          <button
            onClick={onClose}
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-stroke text-sm font-bold text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
