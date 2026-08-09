import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
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
import { Input } from "@workspace/ui/components/input"
import { apiUrl } from "@/lib/config"
import { apiGet, apiJson } from "@/lib/api"

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
  delay: number
  duration: number
}

const TILES: Tile[] = [
  { Icon: FileVideoIcon, color: "text-sky-500", top: "22%", left: "6%", size: 56, rotate: -8, delay: 0, duration: 7 },
  { Icon: FileImageIcon, color: "text-emerald-500", top: "10%", left: "68%", size: 48, rotate: 6, delay: 1.2, duration: 8 },
  { Icon: FilePdfIcon, color: "text-rose-500", top: "22%", left: "22%", size: 62, rotate: -4, delay: 0.6, duration: 9 },
  { Icon: FileJsIcon, color: "text-yellow-400", top: "36%", left: "60%", size: 52, rotate: 10, delay: 2, duration: 10 },
  { Icon: FileDocIcon, color: "text-blue-500", top: "74%", left: "8%", size: 50, rotate: -12, delay: 0.3, duration: 8 },
  { Icon: FileXlsIcon, color: "text-emerald-600", top: "62%", left: "76%", size: 46, rotate: 3, delay: 1.6, duration: 11 },
  { Icon: FilePyIcon, color: "text-sky-600", top: "76%", left: "28%", size: 54, rotate: 8, delay: 0.9, duration: 9 },
  { Icon: FileTsIcon, color: "text-sky-500", top: "8%", left: "38%", size: 46, rotate: -6, delay: 2.3, duration: 10 },
  { Icon: FileCsvIcon, color: "text-emerald-500", top: "46%", left: "46%", size: 42, rotate: 4, delay: 1.1, duration: 8 },
  { Icon: FileZipIcon, color: "text-amber-500", top: "84%", left: "58%", size: 48, rotate: -10, delay: 0.4, duration: 9 },
  { Icon: FileHtmlIcon, color: "text-orange-500", top: "22%", left: "86%", size: 40, rotate: 12, delay: 1.8, duration: 11 },
  { Icon: FileCsvIcon, color: "text-emerald-500", top: "40%", left: "80%", size: 44, rotate: 7, delay: 1.5, duration: 9 },
  { Icon: FileDocIcon, color: "text-blue-500", top: "92%", left: "45%", size: 46, rotate: -8, delay: 0.7, duration: 10 },
  { Icon: FilePyIcon, color: "text-sky-600", top: "18%", left: "54%", size: 40, rotate: 5, delay: 2.1, duration: 8 },
  { Icon: FilePdfIcon, color: "text-rose-500", top: "87%", left: "14%", size: 44, rotate: -6, delay: 0.2, duration: 11 },
  { Icon: FileTsIcon, color: "text-sky-500", top: "74%", left: "52%", size: 40, rotate: 11, delay: 1.9, duration: 9 },
  { Icon: FileZipIcon, color: "text-amber-500", top: "14%", left: "14%", size: 38, rotate: 14, delay: 0.5, duration: 8 },
  { Icon: FileImageIcon, color: "text-emerald-500", top: "56%", left: "58%", size: 38, rotate: -11, delay: 2.4, duration: 10 },
  { Icon: FileJsIcon, color: "text-yellow-400", top: "82%", left: "82%", size: 42, rotate: 6, delay: 1.0, duration: 11 },
]

const ROTATING_CHIPS: { Icon: IconC; label: string }[] = [
  { Icon: LightningIcon, label: "Fast uploads" },
  { Icon: UsersThreeIcon, label: "Shared workspaces" },
  { Icon: SparkleIcon, label: "Inline previews" },
  { Icon: ShieldCheckIcon, label: "Quota controls" },
  { Icon: LockKeyIcon, label: "Self-hosted" },
]

type Offset = { dx: number; dy: number }

export function LoginPage() {
  const [chipIdx, setChipIdx] = useState(0)
  const [offsets, setOffsets] = useState<Record<number, Offset>>({})
  const [dragging, setDragging] = useState<number | null>(null)
  const dragRef = useRef<
    | { idx: number; startX: number; startY: number; baseDx: number; baseDy: number }
    | null
  >(null)

  // Dev-only login-by-email, shown when the API reports it's enabled
  // (NODE_ENV=development + ENABLE_DEV_LOGIN=true there).
  const [devLoginEnabled, setDevLoginEnabled] = useState(false)
  const [devEmail, setDevEmail] = useState("")
  const [devSubmitting, setDevSubmitting] = useState(false)
  const [devError, setDevError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/api/auth/dev-login/status")
      .then((r) => setDevLoginEnabled(r.enabled))
      .catch(() => setDevLoginEnabled(false))
  }, [])

  async function submitDevLogin(e: React.FormEvent) {
    e.preventDefault()
    setDevSubmitting(true)
    setDevError(null)
    try {
      await apiJson("/api/auth/dev-login", "POST", { email: devEmail })
      // Full reload, not react-router navigate: the Zustand auth store's
      // fetchMe() short-circuits once hasFetched is true (set by Root's
      // mount-time call), so a client-side nav here would land on Home
      // still holding the stale pre-login `user: null` and bounce back to
      // /login. The Google OAuth callback avoids this the same way — a
      // server-side redirect that reloads the page and resets the store.
      window.location.assign("/home")
    } catch {
      setDevError("Dev login failed")
    } finally {
      setDevSubmitting(false)
    }
  }

  // Cycle the feature chip every 2.4s.
  useEffect(() => {
    const t = setInterval(
      () => setChipIdx((i) => (i + 1) % ROTATING_CHIPS.length),
      2400
    )
    return () => clearInterval(t)
  }, [])

  // Global pointer listeners so drags keep tracking even when the cursor
  // leaves the tile bounds.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = d.baseDx + (e.clientX - d.startX)
      const dy = d.baseDy + (e.clientY - d.startY)
      setOffsets((prev) => ({ ...prev, [d.idx]: { dx, dy } }))
    }
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        setDragging(null)
      }
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [])

  function startDrag(i: number, e: React.PointerEvent) {
    e.preventDefault()
    const base = offsets[i] ?? { dx: 0, dy: 0 }
    dragRef.current = {
      idx: i,
      startX: e.clientX,
      startY: e.clientY,
      baseDx: base.dx,
      baseDy: base.dy,
    }
    setDragging(i)
  }

  const ActiveChip = ROTATING_CHIPS[chipIdx]

  return (
    <div className="bg-background relative flex min-h-svh overflow-hidden">
      <style>{`
        @keyframes dd-float {
          0%, 100% { transform: translateY(0) rotate(var(--r)); }
          50% { transform: translateY(-28px) rotate(calc(var(--r) + 5deg)); }
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

      {/* LEFT: hero with draggable floating tiles. No overflow clipping —
           tiles can be pulled past the hero bounds and over the sign-in
           column; the outer page container handles final viewport clipping. */}
      <div className="relative hidden md:block md:basis-3/5">
        {/* Decorative layer (grid + orbs) stays contained so it can't leak
             into the sign-in column. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
          <div
            aria-hidden
            className="bg-primary/30 absolute -top-32 -left-32 h-112 w-md rounded-full blur-3xl"
            style={{ animation: "dd-orb 12s ease-in-out infinite" }}
          />
          <div
            aria-hidden
            className="bg-sky-500/20 absolute top-1/3 right-0 h-96 w-96 rounded-full blur-3xl"
            style={{ animation: "dd-orb 14s ease-in-out infinite 2s" }}
          />
          <div
            aria-hidden
            className="bg-violet-500/20 absolute bottom-0 left-1/4 h-88 w-88 rounded-full blur-3xl"
            style={{ animation: "dd-orb 16s ease-in-out infinite 1s" }}
          />
        </div>

        {/* Draggable floating tiles */}
        {TILES.map((t, i) => {
          const Icon = t.Icon
          const off = offsets[i] ?? { dx: 0, dy: 0 }
          const isDragging = dragging === i
          return (
            <div
              key={i}
              className="absolute"
              style={{
                top: t.top,
                left: t.left,
                transform: `translate3d(${off.dx}px, ${off.dy}px, 0)`,
                zIndex: isDragging ? 60 : 40,
                touchAction: "none",
              }}
            >
              <div
                onPointerDown={(e) => startDrag(i, e)}
                className={`group grid cursor-grab place-items-center rounded-2xl border p-3 shadow-xl backdrop-blur-sm transition-shadow hover:scale-110 ${
                  isDragging
                    ? "cursor-grabbing bg-card shadow-2xl"
                    : "bg-card/55 hover:bg-card/90"
                }`}
                style={{
                  ["--r" as string]: `${t.rotate}deg`,
                  animation: `dd-float ${t.duration}s ease-in-out infinite ${t.delay}s`,
                  animationPlayState: isDragging ? "paused" : "running",
                  boxShadow: isDragging
                    ? "0 25px 70px -10px rgb(0 0 0 / 0.55), 0 0 0 2px var(--primary)"
                    : undefined,
                }}
              >
                <Icon size={t.size} weight="fill" className={t.color} />
              </div>
            </div>
          )
        })}

        {/* Copy — painted above the tiles but lets pointer events pass through
             so the entire left side stays draggable. */}
        <div className="pointer-events-none relative z-30 flex h-full flex-col justify-between p-10">
          <Link
            to="/landing"
            className="hover:text-primary pointer-events-auto inline-flex w-fit items-center gap-2 transition-colors"
            title="About DarkDrive"
          >
            <img
              src="/DarkDrive.png"
              alt="DarkDrive"
              className="h-9 w-9 rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">
              DarkDrive
            </span>
          </Link>

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

      {/* RIGHT: sign-in column — roomy, with layered content so it doesn't
           feel like a single small card floating in a void. */}
      <div className="relative flex w-full shrink-0 items-center justify-center p-8 md:w-auto md:basis-2/5">
        {/* Soft ambient glows behind the card */}
        <div
          aria-hidden
          className="bg-primary/20 absolute top-24 right-16 h-72 w-72 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="bg-sky-500/10 absolute bottom-24 left-8 h-64 w-64 rounded-full blur-3xl"
        />

        <div className="relative w-full max-w-md">
          <Link
            to="/"
            className="mb-10 flex w-fit items-center gap-2 md:hidden"
            title="Back to home"
          >
            <img
              src="/DarkDrive.png"
              alt="DarkDrive"
              className="h-9 w-9 rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">
              DarkDrive
            </span>
          </Link>

          <div className="bg-card relative overflow-hidden rounded-3xl border p-10 shadow-2xl">
            <div
              aria-hidden
              className="bg-primary/30 absolute -top-20 -right-20 h-52 w-52 rounded-full blur-3xl"
            />
            <div
              aria-hidden
              className="bg-violet-500/20 absolute -bottom-24 -left-20 h-52 w-52 rounded-full blur-3xl"
            />
            <div className="relative">
              <div className="text-muted-foreground text-sm font-medium">
                Welcome to
              </div>
              <Link
                to="/landing"
                title="About DarkDrive"
                className="hover:text-primary mt-4 flex w-fit items-center gap-3 transition-colors"
              >
                <img
                  src="/DarkDrive.png"
                  alt=""
                  className="h-12 w-12 rounded-lg"
                />
                <span className="text-[2.75rem] font-semibold leading-none tracking-tight">
                  DarkDrive
                </span>
              </Link>
              <p className="text-muted-foreground mt-5 text-sm leading-relaxed">
                Use your Google account to continue. New users start with 1 GB
                of storage — request more from your admin any time.
              </p>

              <Button
                size="lg"
                className="mt-8 h-12 w-full text-base"
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

              {devLoginEnabled && (
                <form
                  onSubmit={submitDevLogin}
                  className="mt-4 rounded-xl border border-dashed p-4"
                >
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
                    Dev login (local only)
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      className="min-w-0 flex-1 text-sm"
                    />
                    <Button type="submit" size="sm" disabled={devSubmitting}>
                      {devSubmitting ? "..." : "Go"}
                    </Button>
                  </div>
                  {devError && (
                    <div className="text-destructive mt-2 text-xs">{devError}</div>
                  )}
                </form>
              )}

              <div className="my-6 flex items-center gap-3">
                <div className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-widest">
                  what you get
                </span>
                <div className="bg-border h-px flex-1" />
              </div>

              <ul className="grid grid-cols-2 gap-3 text-xs">
                <Perk Icon={LightningIcon} label="Fast uploads" />
                <Perk Icon={SparkleIcon} label="Inline previews" />
                <Perk Icon={UsersThreeIcon} label="Shared spaces" />
                <Perk Icon={ShieldCheckIcon} label="Quota control" />
              </ul>
            </div>
          </div>

          <div className="text-muted-foreground mt-5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              API online
            </span>
            <span>Nothing leaves your server unless you say so.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Perk({ Icon, label }: { Icon: IconC; label: string }) {
  return (
    <li className="bg-muted/40 flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
      <Icon size={14} weight="fill" className="text-primary shrink-0" />
      <span className="truncate">{label}</span>
    </li>
  )
}
