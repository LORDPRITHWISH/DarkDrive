import { useEffect, useRef, useState } from "react"

const BG_KEY = "dd.backgroundPlay"

export const backgroundPlayEnabled = () => localStorage.getItem(BG_KEY) !== "0"

/**
 * Audio preview that survives leaving the app.
 *
 * Browsers already keep an <audio> element playing when the tab is
 * backgrounded — what they don't do on their own is tell the OS what's
 * playing. Without MediaSession metadata you get no lock-screen card, no
 * bluetooth/headset buttons, and Android is far more willing to kill the
 * stream. Setting metadata + handlers is the whole difference between
 * "audio from a website" and "audio from an app".
 */
export function AudioPlayer({ src, name }: { src: string; name: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [background, setBackground] = useState(backgroundPlayEnabled)

  useEffect(() => {
    localStorage.setItem(BG_KEY, background ? "1" : "0")
  }, [background])

  // When background play is off, honour it literally: stop on the way out.
  useEffect(() => {
    if (background) return
    const onHide = () => {
      if (document.hidden) ref.current?.pause()
    }
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [background])

  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms) return
    ms.metadata = new MediaMetadata({
      title: name,
      artist: "DarkDrive",
      artwork: [{ src: "/pwa-512.png", sizes: "512x512", type: "image/png" }],
    })
    const el = ref.current
    ms.setActionHandler("play", () => void el?.play())
    ms.setActionHandler("pause", () => el?.pause())
    ms.setActionHandler("seekbackward", () => {
      if (el) el.currentTime = Math.max(0, el.currentTime - 10)
    })
    ms.setActionHandler("seekforward", () => {
      if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + 10)
    })
    return () => {
      ms.metadata = null
      for (const a of ["play", "pause", "seekbackward", "seekforward"] as const) {
        ms.setActionHandler(a, null)
      }
    }
  }, [name])

  return (
    <div className="flex w-md max-w-[90vw] flex-col gap-3 p-6">
      <div className="selectable truncate text-center text-sm font-medium">{name}</div>
      <audio ref={ref} src={src} controls autoPlay className="w-full" />
      <label className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={background}
          onChange={(e) => setBackground(e.target.checked)}
          className="accent-primary size-3.5"
        />
        Keep playing in the background
      </label>
    </div>
  )
}
