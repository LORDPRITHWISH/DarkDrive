import { useEffect, useState } from "react"
import { CopyIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { desktop, type DesktopState } from "@/lib/desktop"
import { useAuth } from "@/store/auth"
import { toast } from "@/store/toast"

// The login page's sign-in in the desktop app. Google sign-in happens in the
// browser the user already trusts (the app opens its /pair page), which hands
// this computer a device token; the app then reloads this page signed in.
export function DesktopSignIn() {
  const [state, setState] = useState<DesktopState | null>(null)
  // Set when /api/auth/me failed for a reason other than "signed out": then
  // no sign-in will help, and the reason is what to show.
  const reachError = useAuth((s) => s.error)

  useEffect(() => {
    const load = () => void desktop!.getState().then(setState)
    load()
    return desktop!.onChange(load)
  }, [])

  // Left clickable while waiting: if the browser tab got closed, clicking
  // again just starts over.
  function signIn() {
    desktop!.signIn().catch((e: Error) => toast.error(e.message))
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

  function copy(url: string) {
    void navigator.clipboard.writeText(url).then(() => toast.success("Link copied."))
  }

  return (
    <>
      {reachError && state && (
        <p className="text-destructive mt-6 text-xs">
          Can't reach {new URL(state.apiUrl).host} ({reachError}). Check the server
          below, or that it allows this app.
        </p>
      )}
      <Button size="lg" className="mt-6 h-12 w-full text-base" onClick={signIn}>
        <img src="/Google_Favicon_2025.svg" alt="" className="h-5 w-5" />
        Continue with Google
      </Button>
      {state?.signInUrl && (
        <div className="mt-3 grid gap-2 text-xs">
          <p className="text-muted-foreground">
            Finish signing in in your browser. Didn't open, or opened the wrong one?
            Paste this link into the browser you use DarkDrive in:
          </p>
          <div className="flex gap-2">
            <Input readOnly value={state.signInUrl} aria-label="Sign-in link" className="h-8 text-[11px]" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" onClick={() => copy(state.signInUrl!)}>
              <CopyIcon size={14} />
              Copy
            </Button>
          </div>
        </div>
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
