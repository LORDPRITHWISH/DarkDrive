import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { apiJson } from "@/lib/api"

// Returns an error message, or null once it's navigating away signed in.
async function claim(code: string): Promise<string | null> {
  try {
    await apiJson("/api/temp-sessions/claim", "POST", { code })
    // Full reload, not navigate — same reason as dev login in Login.tsx.
    window.location.assign("/home")
    return null
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 409) {
      return "This browser is already signed in to DarkDrive. Login links are for another device; sign out first to use it here."
    }
    if (status === 429) return "Too many attempts. Wait a few minutes and try again."
    return "That code is wrong, already used, or expired."
  }
}

// Where a temporary session is redeemed: a login link / scanned QR
// (/t/<code>) signs in on arrival; a bare /t takes a typed code.
export function TempLoginPage() {
  const { code: fromLink } = useParams()
  const [code, setCode] = useState(fromLink ?? "")
  const [busy, setBusy] = useState(!!fromLink)
  const [err, setErr] = useState<string | null>(null)
  const started = useRef(false)

  // From JS on purpose, not a GET on the API: chat-app link previews fetch
  // the HTML but don't run scripts, so a preview doesn't spend the one-time
  // code. The ref stops StrictMode's double effect from 404ing on the
  // already-used code and flashing an error.
  useEffect(() => {
    if (!fromLink || started.current) return
    started.current = true
    void claim(fromLink).then((error) => {
      if (!error) return
      setErr(error)
      setBusy(false)
    })
  }, [fromLink])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const error = await claim(code)
    if (!error) return
    setErr(error)
    setBusy(false)
  }

  return (
    <div className="bg-background grid min-h-svh place-items-center p-4">
      <form
        onSubmit={submit}
        className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <img src="/DarkDrive.png" alt="" className="h-8 w-8 rounded-md" />
          <span className="font-semibold tracking-tight">DarkDrive</span>
        </div>
        <h1 className="mt-5 text-lg font-semibold">Temporary sign-in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          For a device you don't own. It signs out on its own when the session ends, or
          as soon as you end it from your profile.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXXX-XXXXX"
          aria-label="Sign-in code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          className="mt-4 h-11 text-center font-mono text-lg tracking-widest uppercase"
        />
        {err && <p className="text-destructive mt-2 text-xs">{err}</p>}
        <Button type="submit" className="mt-4 w-full" disabled={busy || !code.trim()}>
          {busy ? "Signing in…" : "Sign in on this device"}
        </Button>
        <Link
          to="/login"
          className="text-muted-foreground hover:text-foreground mt-4 block text-center text-xs hover:underline"
        >
          Sign in with Google instead
        </Link>
      </form>
    </div>
  )
}
