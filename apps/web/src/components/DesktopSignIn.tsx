import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { desktop, type DesktopState } from "@/lib/desktop"
import { toast } from "@/store/toast"

// The login page's sign-in in the desktop app. Google sign-in happens in the
// browser the user already trusts (the app opens its /pair page), which hands
// this computer a device token; the app then reloads this page signed in.
export function DesktopSignIn() {
  const [waiting, setWaiting] = useState(false)
  const [state, setState] = useState<DesktopState | null>(null)
  useEffect(() => void desktop!.getState().then(setState), [])

  // Left clickable while waiting: if the browser tab got closed, clicking
  // again just starts over.
  async function signIn() {
    setWaiting(true)
    try {
      await desktop!.signIn()
    } catch (e) {
      toast.error((e as Error).message)
      setWaiting(false)
    }
  }

  // A different server is a different account, so it's set here, signed out.
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    try {
      await desktop!.saveServer({ apiUrl: f.apiUrl, webUrl: f.webUrl, device: f.device })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <Button size="lg" className="mt-8 h-12 w-full text-base" onClick={signIn}>
        <img src="/Google_Favicon_2025.svg" alt="" className="h-5 w-5" />
        Continue with Google
      </Button>
      {waiting && (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Finish signing in in your browser…
        </p>
      )}
      {state && (
        <details className="mt-4 text-xs">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
            Server settings
          </summary>
          <form onSubmit={save} className="mt-3 grid gap-3">
            <label className="text-muted-foreground grid gap-1">
              Server
              <Input name="apiUrl" type="url" required defaultValue={state.apiUrl} />
            </label>
            <label className="text-muted-foreground grid gap-1">
              Web app
              <Input name="webUrl" type="url" required defaultValue={state.webUrl} />
            </label>
            <label className="text-muted-foreground grid gap-1">
              This computer's name
              <Input name="device" maxLength={60} defaultValue={state.device} />
            </label>
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </form>
        </details>
      )}
    </>
  )
}
