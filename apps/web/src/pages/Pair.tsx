import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CopyIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { apiJson } from "@/lib/api"
import { useAuth } from "@/store/auth"
import { toast } from "@/store/toast"

const failMessage = (e: unknown) =>
  (e as { status?: number }).status === 403
    ? "A temporary session can't pair devices. Sign in with Google instead."
    : "Something went wrong. Try again."

// Reached via the API's /api/devices/pair redirect. The desktop app adds
// ?port=&state=&name= and gets a one-click "Allow" that hands a one-time code
// to its loopback listener (RFC 8252); everyone else gets a token to copy.
export function PairPage() {
  const [params] = useSearchParams()
  const email = useAuth((s) => s.user?.email)
  const port = Number(params.get("port"))
  const state = params.get("state") ?? ""
  // Strict, and the URL is built from the parsed number: a raw port like
  // "80@evil.com" would turn 127.0.0.1 into userinfo and ship the code away.
  const desktop =
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535 &&
    /^[A-Za-z0-9_-]{16,128}$/.test(state)
  const appName = (params.get("name") ?? "").trim().slice(0, 60) || "Computer"

  const [name, setName] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function allow() {
    setBusy(true)
    setErr(null)
    try {
      const { code } = await apiJson<{ code: string }>("/api/devices/pair-code", "POST", {
        name: appName,
      })
      window.location.href = `http://127.0.0.1:${port}/callback?${new URLSearchParams({ code, state })}`
    } catch (e) {
      setErr(failMessage(e))
      setBusy(false)
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const d = await apiJson<{ token: string }>("/api/devices", "POST", {
        name: name.trim() || "Device",
      })
      setToken(d.token)
    } catch (e) {
      setErr(failMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-background grid min-h-svh place-items-center p-4">
      <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <img src="/DarkDrive.png" alt="" className="h-8 w-8 rounded-md" />
          <span className="font-semibold tracking-tight">DarkDrive</span>
        </div>

        {desktop ? (
          <>
            <h1 className="mt-5 text-lg font-semibold">Sign in to DarkDrive</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Let the DarkDrive app on <b className="text-foreground">{appName}</b> sync the
              files of <b className="text-foreground">{email}</b>?
            </p>
            <Button className="mt-4 w-full" onClick={allow} disabled={busy} autoFocus>
              {busy ? "Allowing…" : "Allow"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-lg font-semibold">Pair a device</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Signed in as {email}. Name the device, then paste the token into the
              DarkDrive app or sync client.
            </p>
            {token ? (
              <div className="mt-4 space-y-2">
                <code className="bg-muted block rounded-md p-3 font-mono text-xs break-all select-all">
                  {token}
                </code>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    void navigator.clipboard?.writeText(token).then(() => toast.success("Copied."))
                  }
                >
                  <CopyIcon size={14} />
                  Copy token
                </Button>
                <p className="text-xs text-amber-500">Shown once — copy it now.</p>
              </div>
            ) : (
              <form onSubmit={create}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Laptop"
                  maxLength={60}
                  autoFocus
                  className="mt-4"
                />
                <Button type="submit" className="mt-3 w-full" disabled={busy}>
                  {busy ? "Creating…" : "Create token"}
                </Button>
              </form>
            )}
          </>
        )}
        {err && <p className="text-destructive mt-2 text-xs">{err}</p>}
      </div>
    </div>
  )
}
