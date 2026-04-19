import { useEffect, useRef, useState } from "react"
import {
  FileCsvIcon,
  FileDocIcon,
  FileHtmlIcon,
  FileImageIcon,
  FileJsIcon,
  FilePdfIcon,
  FilePyIcon,
  FileTsIcon,
  FileVideoIcon,
  FileXlsIcon,
  FileZipIcon,
  LightningIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"
import type { ComponentType } from "react"
import { Button } from "@workspace/ui/components/button"
import { apiUrl } from "@/lib/config"

type IconC = ComponentType<{
  size?: number
  weight?: "fill" | "regular" | "bold"
  className?: string
}>

type Tile = {
  Icon: IconC
  color: string
  top: string
  left: string
  size: number
  rotate: number
  depth: number // parallax strength: higher = moves more with cursor
  delay: number
  duration: number
}

const TILES: Tile[] = [
  { Icon: FileVideoIcon, color: "text-sky-500", top: "6%", left: "4%", size: 56, rotate: -8, depth: 4, delay: 0, duration: 8 },
  { Icon: FileImageIcon, color: "text-emerald-500", top: "14%", left: "72%", size: 48, rotate: 6, depth: 3, delay: 1.2, duration: 9 },
  { Icon: FilePdfIcon, color: "text-rose-500", top: "28%", left: "18%", size: 62, rotate: -4, depth: 5, delay: 0.6, duration: 10 },
  { Icon: FileJsIcon, color: "text-yellow-400", top: "40%", left: "64%", size: 52, rotate: 10, depth: 4, delay: 2, duration: 11 },
  { Icon: FileDocIcon, color: "text-blue-500", top: "60%", left: "8%", size: 50, rotate: -12, depth: 3, delay: 0.3, duration: 9 },
  { Icon: FileXlsIcon, color: "text-emerald-600", top: "68%", left: "78%", size: 46, rotate: 3, depth: 5, delay: 1.6, duration: 12 },
  { Icon: FilePyIcon, color: "text-sky-600", top: "80%", left: "30%", size: 54, rotate: 8, depth: 4, delay: 0.9, duration: 10 },
  { Icon: FileTsIcon, color: "text-sky-500", top: "10%", left: "42%", size: 46, rotate: -6, depth: 2, delay: 2.3, duration: 11 },
  { Icon: FileCsvIcon, color: "text-emerald-500", top: "50%", left: "38%", size: 42, rotate: 4, depth: 3, delay: 1.1, duration: 9 },
  { Icon: FileZipIcon, color: "text-amber-500", top: "86%", left: "62%", size: 48, rotate: -10, depth: 2, delay: 0.4, duration: 10 },
  { Icon: FileHtmlIcon, color: "text-orange-500", top: "24%", left: "88%", size: 40, rotate: 12, depth: 5, delay: 1.8, duration: 12 },
]

const ROTATING_CHIPS: { Icon: IconC; label: string }[] = [
  { Icon: LightningIcon, label: "Fast uploads" },
  { Icon: UsersThreeIcon, label: "Shared workspaces" },
  { Icon: SparkleIcon, label: "Inline previews" },
  { Icon: ShieldCheckIcon, label: "Quota controls" },
  { Icon: LockKeyIcon, label: "Self-hosted" },
]

export function LoginPage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const [mx, setMx] = useState(0)
  const [my, setMy] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const [chipIdx, setChipIdx] = useState(0)

  // Cycle the feature chip every 2.4s.
  useEffect(() => {
    const t = setInterval(
      () => setChipIdx((i) => (i + 1) % ROTATING_CHIPS.length),
      2400
    )
    return () => clearInterval(t)
  }, [])

  // Cursor-driven parallax: -0.5..0.5 on both axes, eased via rAF.
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    let raf = 0
    let targetX = 0
    let targetY = 0
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      targetX = (e.clientX - r.left) / r.width - 0.5
      targetY = (e.clientY - r.top) / r.height - 0.5
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onLeave = () => {
      targetX = 0
      targetY = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }
    let curX = 0
    let curY = 0
    const tick = () => {
      curX += (targetX - curX) * 0.1
      curY += (targetY - curY) * 0.1
      setMx(curX)
      setMy(curY)
      if (Math.abs(curX - targetX) > 0.002 || Math.abs(curY - targetY) > 0.002) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = 0
      }
    }
    el.addEventListener("mousemove", onMove)
    el.addEventListener("mouseleave", onLeave)
    return () => {
      el.removeEventListener("mousemove", onMove)
      el.removeEventListener("mouseleave", onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const ActiveChip = ROTATING_CHIPS[chipIdx]

  return (
    <div className="bg-background relative flex min-h-svh overflow-hidden">
      <style>{`
        @keyframes dd-float {
          0%, 100% { transform: translateY(0) rotate(var(--r)); }
          50% { transform: translateY(-14px) rotate(calc(var(--r) + 2deg)); }
        }
        @keyframes dd-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -30px) scale(1.08); }
        }
        @keyframes dd-shine {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes dd-chip-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dd-grid-drift {
          from { background-position: 0 0; }
          to   { background-position: 40px 40px; }
        }
      `}</style>

      {/* LEFT: interactive hero */}
      <div
        ref={heroRef}
        className="relative hidden flex-1 overflow-hidden md:block"
      >
        {/* Animated grid backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            animation: "dd-grid-drift 20s linear infinite",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />

        {/* Gradient orbs that respond to cursor */}
        <div
          aria-hidden
          className="bg-primary/30 absolute -top-32 -left-32 h-112 w-md rounded-full blur-3xl"
          style={{
            animation: "dd-orb 12s ease-in-out infinite",
            transform: `translate(${mx * 40}px, ${my * 40}px)`,
          }}
        />
        <div
          aria-hidden
          className="bg-sky-500/20 absolute top-1/3 right-0 h-96 w-96 rounded-full blur-3xl"
          style={{
            animation: "dd-orb 14s ease-in-out infinite 2s",
            transform: `translate(${mx * -30}px, ${my * -30}px)`,
          }}
        />
        <div
          aria-hidden
          className="bg-violet-500/20 absolute bottom-0 left-1/4 h-88 w-88 rounded-full blur-3xl"
          style={{
            animation: "dd-orb 16s ease-in-out infinite 1s",
            transform: `translate(${mx * 25}px, ${my * -20}px)`,
          }}
        />

        {/* Floating tiles — each layer translates by depth × cursor position */}
        {TILES.map((t, i) => {
          const Icon = t.Icon
          const isActive = active === i
          return (
            <div
              key={i}
              className="absolute transition-transform duration-300 ease-out"
              style={{
                top: t.top,
                left: t.left,
                transform: `translate3d(${mx * t.depth * 18}px, ${my * t.depth * 18}px, 0)`,
              }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div
                aria-hidden
                className="grid place-items-center rounded-2xl border p-3 shadow-xl backdrop-blur-sm transition-all duration-300"
                style={{
                  ["--r" as string]: `${t.rotate}deg`,
                  animation: `dd-float ${t.duration}s ease-in-out infinite ${t.delay}s`,
                  transform: isActive
                    ? `scale(1.15) rotate(${t.rotate}deg)`
                    : undefined,
                  background: isActive
                    ? "rgb(var(--card) / 0.95)"
                    : "rgb(var(--card) / 0.55)",
                  boxShadow: isActive
                    ? "0 20px 60px -10px rgb(0 0 0 / 0.45), 0 0 0 2px var(--primary)"
                    : undefined,
                }}
              >
                <Icon size={t.size} weight="fill" className={t.color} />
              </div>
            </div>
          )
        })}

        {/* Copy */}
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2">
            <img
              src="/DarkDrive.png"
              alt="DarkDrive"
              className="h-9 w-9 rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">
              DarkDrive
            </span>
          </div>

          <div className="max-w-xl">
            <div
              key={chipIdx}
              className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium backdrop-blur-md"
              style={{ animation: "dd-chip-in 320ms ease-out" }}
            >
              <ActiveChip.Icon
                size={12}
                weight="fill"
                className="text-primary"
              />
              <span>{ActiveChip.label}</span>
            </div>
            <h1
              className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
              style={{
                backgroundImage:
                  "linear-gradient(110deg, var(--foreground) 10%, var(--primary) 40%, var(--foreground) 70%, var(--primary) 95%)",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                animation: "dd-shine 6s ease-in-out infinite",
              }}
            >
              Your files,
              <br />
              your space,
              <br />
              your drive.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-md text-base">
              A private, self-hosted drive for you and your team — real storage
              controls, shared workspaces, and inline previews that just work.
            </p>
          </div>

          <div className="text-muted-foreground text-xs">
            © DarkDrive · Nothing leaves your server unless you say so.
          </div>
        </div>
      </div>

      {/* RIGHT: sign-in card */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 md:hidden">
            <img
              src="/DarkDrive.png"
              alt="DarkDrive"
              className="h-9 w-9 rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">
              DarkDrive
            </span>
          </div>

          <div className="bg-card relative overflow-hidden rounded-2xl border p-8 shadow-xl">
            <div
              aria-hidden
              className="bg-primary/30 absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl"
            />
            <div className="relative">
              <div className="text-muted-foreground text-sm font-medium">
                Welcome to
              </div>
              <div className="mt-1 flex items-center gap-2">
                <img
                  src="/DarkDrive.png"
                  alt=""
                  className="h-10 w-10 rounded-md"
                />
                <span className="text-4xl font-semibold tracking-tight">
                  DarkDrive
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm">
                Use your Google account to continue. New users start with 1 GB
                of storage.
              </p>

              <Button
                size="lg"
                className="mt-6 w-full"
                onClick={() =>
                  (window.location.href = apiUrl("/api/auth/google"))
                }
              >
                <img
                  src="/Google_Favicon_2025.svg"
                  alt=""
                  className="h-5 w-5"
                />
                Continue with Google
              </Button>

              <div className="text-muted-foreground mt-4 text-center text-[11px]">
                By continuing you agree to keep your files on your server,
                where they belong.
              </div>
            </div>
          </div>

          <div className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            API online
          </div>
        </div>
      </div>
    </div>
  )
}
