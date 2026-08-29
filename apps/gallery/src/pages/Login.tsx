import { GoogleLogo } from "@phosphor-icons/react"
import { apiUrl } from "@/lib/api"

export function LoginPage() {
  // Comes back here rather than to the drive UI — the API validates this
  // against its own allowlist before honouring it.
  const href = `${apiUrl("/api/auth/google")}?return=${encodeURIComponent(window.location.origin)}`

  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-4xl tracking-tight">
          Dark<span className="text-primary">Gallery</span>
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Your photos and videos, on your own DarkDrive. Same account, same storage — kept
          apart from your files, under&nbsp;My&nbsp;Photos.
        </p>

        <a
          href={href}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-8 flex items-center justify-center gap-3 rounded-full px-5 py-3 text-sm font-medium transition-colors"
        >
          <GoogleLogo size={18} weight="bold" />
          Continue with Google
        </a>

        <p className="text-muted-foreground/60 mt-6 text-xs">
          Already signed in to DarkDrive on this browser? This will go straight through.
        </p>
      </div>
    </main>
  )
}
