import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'

interface QrScannerProps {
  onDecode: (text: string) => void
  paused?: boolean
  onTorchChange?: (state: { supported: boolean; on: boolean; toggle: () => void }) => void
}

type CameraState = 'requesting' | 'ready' | 'denied' | 'unavailable'

export function QrScanner({ onDecode, paused = false, onTorchChange }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [state, setState] = useState<CameraState>('requesting')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const onDecodeRef = useRef(onDecode)
  onDecodeRef.current = onDecode

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const track = stream.getVideoTracks()[0]
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
        setTorchSupported(Boolean(caps?.torch))
        setState('ready')
        tick()
      } catch (err) {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        setState(name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'unavailable' : 'denied')
      }
    }

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code?.data) {
            onDecodeRef.current(code.data)
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    start()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (paused && rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [paused])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn((v) => !v)
    } catch {
      // torch not supported on this device — silently ignore
    }
  }

  const onTorchChangeRef = useRef(onTorchChange)
  onTorchChangeRef.current = onTorchChange
  useEffect(() => {
    onTorchChangeRef.current?.({ supported: torchSupported, on: torchOn, toggle: toggleTorch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torchSupported, torchOn])

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-full w-full object-cover"
        style={{ display: state === 'ready' ? 'block' : 'none' }}
      />
      <canvas ref={canvasRef} className="hidden" />
      {state !== 'ready' && (
        <div className="flex h-full w-full items-center justify-center px-10 text-center text-sm text-white/70">
          {state === 'requesting' && 'Requesting camera access…'}
          {state === 'denied' &&
            'Camera access was denied. Enable it in your browser settings, or enter the code manually below.'}
          {state === 'unavailable' && 'No camera available on this device — enter the code manually below.'}
        </div>
      )}
    </div>
  )
}
