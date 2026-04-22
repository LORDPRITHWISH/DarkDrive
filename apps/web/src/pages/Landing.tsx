import { useEffect } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CloudIcon,
  UsersThreeIcon,
  EyeIcon,
  ShieldCheckIcon,
  LightningIcon,
  SparkleIcon,
  CodeIcon,
  GithubLogoIcon,
  GlobeIcon,
  RocketLaunchIcon,
  FileArrowUpIcon,
  GaugeIcon,
  LockKeyIcon,
  ShareNetworkIcon,
  DatabaseIcon,
  HeartIcon,
  StarIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { useAuth } from "@/store/auth"
import GradientText from "@/components/reactbits/GradientText"
import ShinyText from "@/components/reactbits/ShinyText"
import BlurText from "@/components/reactbits/BlurText"
import SplitText from "@/components/reactbits/SplitText"
import SpotlightCard from "@/components/reactbits/SpotlightCard"
import ClickSpark from "@/components/reactbits/ClickSpark"
import StarBorder from "@/components/reactbits/StarBorder"

export function LandingPage() {
  const { user, fetchMe } = useAuth()
  useEffect(() => {
    void fetchMe()
  }, [fetchMe])
  const ctaHref = user ? "/home" : "/login"
  const ctaLabel = user ? "Open DarkDrive" : "Get started free"

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 30px) scale(0.95); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-25px, -35px); }
        }
        @keyframes float-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(40px, 20px) scale(1.08); }
          50% { transform: translate(10px, -30px) scale(0.96); }
          75% { transform: translate(-30px, 15px) scale(1.04); }
        }
        @keyframes aurora-rotate {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes beam-sweep {
          0% { transform: translateX(-30%) rotate(-18deg); opacity: 0; }
          30% { opacity: 0.55; }
          70% { opacity: 0.55; }
          100% { transform: translateX(130%) rotate(-18deg); opacity: 0; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50%      { opacity: 0.9;  transform: scale(1.3); }
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes tilt {
          0%, 100% { transform: rotate(-1deg); }
          50% { transform: rotate(1deg); }
        }
        .float-slow { animation: float-slow 18s ease-in-out infinite; }
        .float-medium { animation: float-medium 12s ease-in-out infinite; }
        .float-drift { animation: float-drift 24s ease-in-out infinite; }
        .aurora-rotate { animation: aurora-rotate 40s linear infinite; }
        .beam-sweep { animation: beam-sweep 14s ease-in-out infinite; }
        .twinkle { animation: twinkle 4s ease-in-out infinite; }
        .gradient-text {
          background: linear-gradient(90deg, var(--primary), oklch(0.715 0.143 215.221), var(--primary));
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: gradient-shift 6s ease-in-out infinite;
        }
        .marquee-track { animation: marquee 30s linear infinite; }
        .tilt-hover:hover { animation: tilt 1.2s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .float-slow, .float-medium, .float-drift,
          .aurora-rotate, .beam-sweep, .twinkle,
          .marquee-track { animation: none !important; }
        }
      `}</style>

      {/* Decorative animated background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {/* Slow-rotating aurora — the ambient base layer */}
        <div
          className="aurora-rotate absolute top-1/2 left-1/2 h-[160vmax] w-[160vmax] opacity-60"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, oklch(0.52 0.105 223.128 / 0.18) 60deg, transparent 140deg, oklch(0.715 0.143 215.221 / 0.14) 220deg, transparent 300deg, oklch(0.45 0.085 224.283 / 0.16) 340deg, transparent 360deg)",
            filter: "blur(90px)",
          }}
        />

        {/* Floating color orbs */}
        <div className="float-slow absolute -top-40 -left-40 h-120 w-120 rounded-full bg-primary/25 blur-3xl" />
        <div className="float-medium absolute top-1/3 -right-32 h-105 w-105 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="float-slow absolute -bottom-40 left-1/4 h-95 w-95 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="float-drift absolute top-1/2 left-1/2 h-80 w-80 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="float-drift absolute top-2/3 right-1/4 h-72 w-72 rounded-full bg-teal-400/15 blur-3xl" />

        {/* Diagonal light beam sweeping across */}
        <div
          className="beam-sweep absolute top-[-20%] left-[-30%] h-[140%] w-[30%] opacity-0"
          style={{
            background:
              "linear-gradient(90deg, transparent, oklch(0.865 0.127 207.078 / 0.18), transparent)",
            filter: "blur(30px)",
          }}
        />

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Twinkling stars */}
        <div
          className="twinkle absolute top-[12%] left-[22%] h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_2px_currentColor]"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="twinkle absolute top-[28%] left-[78%] h-1 w-1 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_currentColor]"
          style={{ animationDelay: "1.2s" }}
        />
        <div
          className="twinkle absolute top-[55%] left-[8%] h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_2px_currentColor]"
          style={{ animationDelay: "2.5s" }}
        />
        <div
          className="twinkle absolute top-[72%] left-[62%] h-1 w-1 rounded-full bg-primary shadow-[0_0_8px_2px_currentColor]"
          style={{ animationDelay: "0.8s" }}
        />
        <div
          className="twinkle absolute top-[84%] left-[35%] h-1 w-1 rounded-full bg-teal-300 shadow-[0_0_8px_2px_currentColor]"
          style={{ animationDelay: "3.2s" }}
        />
        <div
          className="twinkle absolute top-[18%] left-[52%] h-1 w-1 rounded-full bg-blue-300 shadow-[0_0_8px_2px_currentColor]"
          style={{ animationDelay: "1.8s" }}
        />
      </div>

      <header className="relative z-10 flex animate-in items-center justify-between border-b px-6 py-4 duration-700 fade-in slide-in-from-top-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/DarkDiveBrand.png"
            alt="DarkDrive"
            className="h-9 w-9 rounded-md ring-2 ring-primary/20 transition-transform duration-300 hover:scale-110 hover:rotate-6"
          />
          <span className="text-xl font-black tracking-tight">DarkDrive</span>
          <span className="ml-1 hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase sm:inline">
            Self-Hosted
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/LORDPRITHWISH"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <GithubLogoIcon size={16} weight="bold" />
            GitHub
          </a>
          <Button size="sm" render={<Link to={ctaHref} />}>
            {ctaLabel}
            <ArrowRightIcon size={14} weight="bold" />
          </Button>
        </div>
      </header>

      <ClickSpark
        sparkColor="currentColor"
        sparkSize={8}
        sparkRadius={18}
        sparkCount={10}
        duration={500}
      >
        <main className="relative z-10 flex-1">
          {/* HERO */}
          <section className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-32">
            <img
              src="/DarkDrive.png"
              alt="DarkDrive"
              className="mx-auto mb-6 h-20 w-20 animate-in duration-700 zoom-in-95 fade-in sm:h-24 sm:w-24"
            />

            <div className="mb-6 inline-flex animate-in items-center gap-2 rounded-full border bg-background/60 px-4 py-1.5 text-xs font-semibold backdrop-blur-sm duration-500 zoom-in-95 fade-in">
              <SparkleIcon
                size={14}
                weight="fill"
                className="animate-pulse text-primary"
              />
              <ShinyText
                text="Built by an indie dev · Fully self-hostable"
                speed={4}
              />
            </div>

            <h1 className="text-3xl leading-[1.1] font-black tracking-tight sm:text-5xl lg:text-6xl">
              <SplitText text="Your files." delay={30} />
              <br />
              <SplitText text="Your space." delay={30} />
              <br />
              <GradientText
                colors={["#60a5fa", "#22d3ee", "#3b82f6", "#06b6d4", "#60a5fa"]}
                animationSpeed={6}
                className="mx-0! inline-block max-w-none! p-0! font-black"
              >
                Your drive.
              </GradientText>
            </h1>

            <BlurText
              text="A private, self-hosted drive for you and your team. Upload anything, preview it inline, and share it into collaborative workspaces — with real storage controls and a dashboard that actually tells you what's going on."
              delay={30}
              animateBy="words"
              className="mx-auto mt-7 max-w-2xl justify-center text-lg font-medium text-muted-foreground sm:text-xl"
            />

            <div className="mt-10 flex animate-in flex-col items-center justify-center gap-3 delay-300 duration-700 fade-in slide-in-from-bottom-4 sm:flex-row">
              <FancyCTAButton to={ctaHref} label={ctaLabel} />
              <StarBorder
                as="a"
                href="https://github.com/LORDPRITHWISH"
                target="_blank"
                rel="noreferrer"
                color="var(--primary)"
                speed="5s"
                className="rounded-xl! transition-transform"
                innerClassName="flex h-12 items-center justify-center rounded-xl px-7"
              >
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <GithubLogoIcon size={16} weight="bold" />
                  Star on GitHub
                  <StarIcon
                    size={14}
                    weight="fill"
                    className="text-yellow-500"
                  />
                </span>
              </StarBorder>
            </div>

            <p className="mt-4 animate-in text-xs font-medium text-muted-foreground delay-500 duration-1000 fade-in">
              New accounts start with{" "}
              <span className="font-bold text-foreground">1 GB</span> of storage
              · No credit card · Runs on your hardware
            </p>

            {/* Stat strip */}
            <div className="mt-16 grid animate-in grid-cols-2 gap-6 delay-500 duration-1000 fade-in sm:grid-cols-4">
              <Stat value="100" suffix="files" label="per upload batch" />
              <Stat value="∞" label="storage (your disk)" />
              <Stat value="<50" suffix="ms" label="preview render" />
              <Stat value="0" suffix="$" label="per user / month" />
            </div>
          </section>

          {/* MARQUEE TECH BAR */}
          <section className="relative overflow-hidden border-y bg-muted/30 py-6">
            <div className="marquee-track flex w-max gap-10 text-sm font-bold tracking-widest whitespace-nowrap text-muted-foreground uppercase">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-10">
                  <span className="flex items-center gap-2">
                    <CodeIcon size={18} weight="bold" /> React 19
                  </span>
                  <span className="text-primary">◆</span>
                  <span className="flex items-center gap-2">
                    <LightningIcon size={18} weight="fill" /> Vite 7
                  </span>
                  <span className="text-primary">◆</span>
                  <span className="flex items-center gap-2">
                    <DatabaseIcon size={18} weight="bold" /> Chunked Uploads
                  </span>
                  <span className="text-primary">◆</span>
                  <span className="flex items-center gap-2">
                    <ShareNetworkIcon size={18} weight="bold" /> Socket.IO
                  </span>
                  <span className="text-primary">◆</span>
                  <span className="flex items-center gap-2">
                    <LockKeyIcon size={18} weight="bold" /> Self-Hosted
                  </span>
                  <span className="text-primary">◆</span>
                  <span className="flex items-center gap-2">
                    <GaugeIcon size={18} weight="bold" /> Live Dashboard
                  </span>
                  <span className="text-primary">◆</span>
                </div>
              ))}
            </div>
          </section>

          {/* FEATURES */}
          <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-3 text-xs font-black tracking-widest text-primary uppercase">
                Everything you need
              </p>
              <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
                Features that actually{" "}
                <span className="gradient-text">ship</span>.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Not a landing page with a waitlist. Every feature below is live,
                working, and documented.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature
                icon={<CloudIcon size={22} weight="duotone" />}
                title="Fast, chunked uploads"
                body="Drag-and-drop up to 100 files at once. Chunked uploads resume on network hiccups. Quota-aware — rejected before bandwidth is wasted."
                accent="sky"
              />
              <Feature
                icon={<EyeIcon size={22} weight="duotone" />}
                title="Inline preview for everything"
                body="Images, video, audio, PDF, CSV, text and code render in-place. Office docs fall back cleanly to the Microsoft viewer."
                accent="cyan"
              />
              <Feature
                icon={<UsersThreeIcon size={22} weight="duotone" />}
                title="Shared collaborative spaces"
                body="Invite teammates into a workspace. Uploads into a shared space stay in your own drive and surface there as shortcuts."
                accent="emerald"
              />
              <Feature
                icon={<ShieldCheckIcon size={22} weight="duotone" />}
                title="Admin controls"
                body="Per-user storage quotas, role management, disable/enable accounts, and a dashboard with live CPU, RAM, and disk telemetry."
                accent="violet"
              />
              <Feature
                icon={<FileArrowUpIcon size={22} weight="duotone" />}
                title="Public share links"
                body="Generate shareable links for any file. Control expiry, revoke access, and track who opened what — without giving up your drive."
                accent="amber"
              />
              <Feature
                icon={<GaugeIcon size={22} weight="duotone" />}
                title="Real-time updates"
                body="Socket.IO pipes live changes to every session. Upload progress, shared-space activity, and dashboard metrics stream instantly."
                accent="rose"
              />
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section className="border-y bg-muted/20 py-20 sm:py-28">
            <div className="mx-auto max-w-6xl px-6">
              <div className="mx-auto mb-14 max-w-2xl text-center">
                <p className="mb-3 text-xs font-black tracking-widest text-primary uppercase">
                  How it works
                </p>
                <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
                  Three steps. <span className="gradient-text">That's it.</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <Step
                  n={1}
                  title="Sign in"
                  body="Create an account — or spin up your own DarkDrive server from the GitHub repo and own the whole stack."
                />
                <Step
                  n={2}
                  title="Upload & organize"
                  body="Drag files in, create workspaces, invite collaborators. Everything previews inline, nothing gets siloed behind a plugin."
                />
                <Step
                  n={3}
                  title="Share with control"
                  body="Public links, teammate access, admin-enforced quotas. You decide what's public, what's private, and what's gone."
                />
              </div>
            </div>
          </section>

          {/* AUTHOR SECTION */}
          <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="mb-3 text-xs font-black tracking-widest text-primary uppercase">
                The person behind it
              </p>
              <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
                Built by <span className="gradient-text">Prithwish</span>.
              </h2>
            </div>

            <SpotlightCard
              spotlightColor="color-mix(in oklab, var(--primary) 40%, transparent)"
              className="border-2 p-0 transition-all hover:shadow-2xl hover:shadow-primary/10"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 opacity-60"
                style={{
                  background:
                    "radial-gradient(circle at 20% 0%, var(--primary), transparent 50%), radial-gradient(circle at 80% 100%, oklch(0.715 0.143 215.221 / 0.4), transparent 50%)",
                }}
              />
              <div className="p-8 sm:p-10">
                <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                  <div className="tilt-hover flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-sky-400 text-white shadow-lg shadow-primary/30">
                    <span className="text-3xl font-black">P</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-black tracking-tight sm:text-3xl">
                      Prithwish
                      <span className="ml-2 text-lg font-semibold text-muted-foreground">
                        · Indie builder
                      </span>
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      Full-stack developer shipping self-hostable software for
                      people who'd rather own their data than rent it. DarkDrive
                      is part of{" "}
                      <span className="font-bold text-foreground">Zenux</span> —
                      a collection of open, privacy-first tools. If you like
                      this one, there's more where it came from.
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <AuthorLink
                    href="https://prithwish.me/"
                    icon={<GlobeIcon size={18} weight="bold" />}
                    label="prithwish.me"
                    sub="Portfolio & blog"
                  />
                  <AuthorLink
                    href="https://zenux.live/"
                    icon={<SparkleIcon size={18} weight="fill" />}
                    label="zenux.live"
                    sub="All projects"
                  />
                  <AuthorLink
                    href="https://github.com/LORDPRITHWISH"
                    icon={<GithubLogoIcon size={18} weight="bold" />}
                    label="GitHub"
                    sub="@LORDPRITHWISH"
                  />
                </div>
              </div>
            </SpotlightCard>
          </section>

          {/* FINAL CTA */}
          <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
            <div className="relative overflow-hidden rounded-3xl border-2 border-primary/20 bg-primary/5 p-10 sm:p-16">
              <div
                aria-hidden
                className="float-slow absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/20 blur-3xl"
              />
              <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
                Ready to own your <span className="gradient-text">drive</span>?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-muted-foreground">
                One click to start. Zero vendor lock-in. Your files, on your
                terms — forever.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <FancyCTAButton to={ctaHref} label={ctaLabel} />
                <a
                  href="https://zenux.live/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-md border-2 px-5 text-base font-semibold transition-all hover:scale-105 hover:bg-accent"
                >
                  Explore Zenux
                  <ArrowUpRightIcon size={16} weight="bold" />
                </a>
              </div>
            </div>
          </section>
        </main>
      </ClickSpark>

      <footer className="relative z-10 border-t px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2 font-semibold">
            <img src="/DarkDrive.png" alt="" className="h-5 w-5 rounded" />
            <span className="font-black text-foreground">DarkDrive</span>
            <span className="text-muted-foreground">· part of Zenux</span>
          </div>
          <div className="flex items-center gap-5 text-xs font-semibold">
            <a
              href="https://prithwish.me/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              prithwish.me
            </a>
            <a
              href="https://zenux.live/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              zenux.live
            </a>
            <a
              href="https://github.com/LORDPRITHWISH"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            Made with{" "}
            <HeartIcon
              size={12}
              weight="fill"
              className="animate-pulse text-rose-500"
            />{" "}
            by Prithwish
          </div>
        </div>
      </footer>
    </div>
  )
}

function FancyCTAButton({
  to,
  label,
  className = "",
}: {
  to: string
  label: string
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-xl px-7 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] ${className}`}
    >
      {/* Subtle gradient background */}
      <span
        aria-hidden
        className="animate-cta-gradient absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(110deg, #0ea5e9, #22d3ee, #3b82f6, #0ea5e9)",
          backgroundSize: "220% 100%",
        }}
      />

      {/* Gentle shine — only on hover */}
      <span
        aria-hidden
        className="absolute inset-y-0 w-1/3 opacity-0 transition-opacity duration-300 group-hover:animate-cta-shine group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
        }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        <RocketLaunchIcon
          size={16}
          weight="fill"
          className="transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:-rotate-6"
        />
        <span>{label}</span>
        <ArrowRightIcon
          size={14}
          weight="bold"
          className="transition-transform duration-300 group-hover:translate-x-1"
        />
      </span>
    </Link>
  )
}

const accentMap: Record<string, string> = {
  sky: "from-sky-500/20 to-sky-500/5 text-sky-600 dark:text-sky-400",
  cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-600 dark:text-cyan-400",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  violet: "from-violet-500/20 to-violet-500/5 text-violet-600 dark:text-violet-400",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-500",
  rose: "from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-400",
}

function Feature({
  icon,
  title,
  body,
  accent = "sky",
}: {
  icon: React.ReactNode
  title: string
  body: string
  accent?: keyof typeof accentMap | string
}) {
  const cls = accentMap[accent] ?? accentMap.sky
  return (
    <Card className="group relative overflow-hidden border-2 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
      <div
        aria-hidden
        className={`absolute -top-16 -right-16 h-40 w-40 rounded-full bg-linear-to-br ${cls} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base font-black">
          <span
            className={`bg-linear-to-br ${cls} flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
          >
            {icon}
          </span>
          {title}
        </CardTitle>
        <CardDescription className="mt-2 text-sm leading-relaxed">
          {body}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="group relative rounded-2xl border-2 bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
      <div className="from-primary to-sky-400 text-primary-foreground mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br text-xl font-black shadow-lg shadow-primary/20 transition-transform group-hover:scale-110 group-hover:-rotate-6">
        {n}
      </div>
      <h3 className="text-xl font-black tracking-tight">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  )
}

function Stat({
  value,
  suffix,
  label,
}: {
  value: string
  suffix?: string
  label: string
}) {
  return (
    <div className="group">
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-3xl font-black tracking-tight transition-transform duration-300 group-hover:scale-110 sm:text-4xl">
          {value}
        </span>
        {suffix && (
          <span className="text-primary text-lg font-black">{suffix}</span>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-xs font-semibold uppercase tracking-wider">
        {label}
      </p>
    </div>
  )
}

function AuthorLink({
  href,
  icon,
  label,
  sub,
}: {
  href: string
  icon: React.ReactNode
  label: string
  sub: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group bg-background/80 hover:border-primary/40 hover:bg-background flex items-center gap-3 rounded-xl border-2 p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10"
    >
      <span className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-110 group-hover:rotate-6">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm font-black">
          {label}
          <ArrowUpRightIcon
            size={12}
            weight="bold"
            className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
          />
        </div>
        <div className="text-muted-foreground truncate text-xs font-medium">{sub}</div>
      </div>
    </a>
  )
}
