import { useCallback, useEffect, useState } from "react"
import { TelegramLogoIcon, CopyIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Progress } from "@workspace/ui/components/progress"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { apiGet, apiJson } from "@/lib/api"
import { getSocket } from "@/lib/socket"
import { formatBytes } from "@/lib/format"
import { toast } from "@/store/toast"

type Status = {
  linked: boolean
  phone: string | null
  pendingLogin: boolean
  importing: boolean
  bot: { username: string | null; linked: boolean }
}

type ImportProgress = {
  imported: number
  skipped: number
  alreadyImported: number
  failed: number
  total: number | null
  current: { name: string; downloaded: number; total: number } | null
}

// Which credential the account-link flow is waiting on. Telegram only asks
// for the 2FA password if the account has one, so "password" is reached
// from "code" at verify time rather than being a fixed step.
type Step = "phone" | "code" | "password"

// Maps the API's error strings onto something a human can act on. Anything
// unrecognized (Telegram's own PHONE_CODE_INVALID etc.) is shown as-is —
// those strings are already reasonably descriptive.
const MESSAGES: Record<string, string> = {
  telegram_not_configured:
    "Telegram isn't configured on the server — TELEGRAM_API_ID and TELEGRAM_API_HASH need to be set.",
  telegram_bot_not_configured: "The bot isn't configured on the server.",
  no_pending_login: "That login expired. Start again.",
  not_linked: "Link your Telegram account first.",
  already_importing: "An import is already running.",
  quota_exceeded: "You're out of storage — free some space or raise your quota.",
  PHONE_CODE_INVALID: "That code isn't right.",
  PHONE_CODE_EXPIRED: "That code expired. Start again.",
  PASSWORD_HASH_INVALID: "That password isn't right.",
}
const humanize = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e)
  return MESSAGES[raw] ?? raw
}

export function TelegramDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [step, setStep] = useState<Step>("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiGet<Status>("/api/telegram/status"))
    } catch (e) {
      toast.error(humanize(e))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setStep("phone")
    setCode("")
    setPassword("")
    setDeepLink(null)
    setProgress(null)
    void refresh()
  }, [open, refresh])

  // The import runs server-side and outlives this dialog, so progress comes
  // over the socket rather than from the request that started it.
  useEffect(() => {
    if (!open) return
    const socket = getSocket()
    const onProgress = (p: ImportProgress) => setProgress(p)
    const onDone = (p: ImportProgress) => {
      setProgress(p)
      toast.success(`Telegram import finished — ${p.imported} imported.`)
      void refresh()
    }
    const onError = (e: { error: string }) => {
      toast.error(humanize(new Error(e.error)))
      void refresh()
    }
    socket.on("telegram:import:progress", onProgress)
    socket.on("telegram:import:done", onDone)
    socket.on("telegram:import:error", onError)
    return () => {
      socket.off("telegram:import:progress", onProgress)
      socket.off("telegram:import:done", onDone)
      socket.off("telegram:import:error", onError)
    }
  }, [open, refresh])

  async function run<T>(fn: () => Promise<T>, after?: (r: T) => void) {
    setBusy(true)
    try {
      after?.(await fn())
    } catch (e) {
      toast.error(humanize(e))
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () =>
    run(
      () => apiJson("/api/telegram/login/start", "POST", { phone: phone.trim() }),
      () => {
        setStep("code")
        toast.info("Telegram sent you a code.")
      }
    )

  // One endpoint serves both credentials; a 401 "password_required" is the
  // signal that this account has 2FA on and the code alone wasn't enough.
  async function verify(body: { code?: string; password?: string }) {
    setBusy(true)
    try {
      await apiJson("/api/telegram/login/verify", "POST", body)
      toast.success("Telegram account linked.")
      setStep("phone")
      await refresh()
    } catch (e) {
      if (e instanceof Error && e.message === "password_required") {
        setStep("password")
        toast.info("This account has 2FA — enter your Telegram password.")
      } else {
        toast.error(humanize(e))
      }
    } finally {
      setBusy(false)
    }
  }

  const startImport = () =>
    run(
      () => apiJson("/api/telegram/import", "POST", {}),
      () => {
        toast.info("Import started — this can take a while for large videos.")
        void refresh()
      }
    )

  const linkBot = () =>
    run(
      () => apiJson<{ deepLink: string }>("/api/telegram/bot/link-code", "POST", {}),
      (r) => setDeepLink(r.deepLink)
    )

  const pct =
    progress?.current && progress.current.total > 0
      ? (progress.current.downloaded / progress.current.total) * 100
      : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TelegramLogoIcon size={20} weight="fill" className="text-sky-500" />
            Telegram
          </DialogTitle>
        </DialogHeader>

        {!status ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            {/* --- account link: bulk-import old media from Saved Messages --- */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Your account
                </h3>
                {status.linked && (
                  <span className="text-[11px] text-emerald-500">Linked {status.phone}</span>
                )}
              </div>

              {status.linked ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Pulls every photo and video from your Saved Messages into My Photos.
                    Already-imported items are skipped, so it's safe to re-run.
                  </p>
                  {progress && (
                    <div className="space-y-1 rounded-md border p-2">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span className="truncate">{progress.current?.name ?? "Working…"}</span>
                        <span>
                          {progress.imported} in
                          {progress.alreadyImported > 0 && ` · ${progress.alreadyImported} already`}
                          {progress.failed > 0 && ` · ${progress.failed} failed`}
                        </span>
                      </div>
                      {progress.current && (
                        <>
                          <Progress value={pct ?? 0} />
                          <p className="text-[10px] text-muted-foreground">
                            {formatBytes(progress.current.downloaded)} /{" "}
                            {formatBytes(progress.current.total)}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={startImport} disabled={busy || status.importing}>
                      {status.importing ? "Importing…" : "Import Saved Messages"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => apiJson("/api/telegram/session", "DELETE"),
                          () => {
                            toast.success("Telegram account unlinked.")
                            void refresh()
                          }
                        )
                      }
                    >
                      Unlink
                    </Button>
                  </div>
                </>
              ) : step === "phone" ? (
                <>
                  <Input
                    placeholder="+15551234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void sendCode()}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={sendCode}
                    disabled={busy || !/^\+?[0-9]{5,15}$/.test(phone.trim())}
                  >
                    Send code
                  </Button>
                </>
              ) : step === "code" ? (
                <>
                  <Input
                    placeholder="Code from Telegram"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void verify({ code: code.trim() })}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => verify({ code: code.trim() })}
                      disabled={busy || !code.trim()}
                    >
                      Verify
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStep("phone")} disabled={busy}>
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Input
                    type="password"
                    placeholder="Telegram 2FA password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void verify({ password })}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => verify({ password })} disabled={busy || !password}>
                    Verify
                  </Button>
                </>
              )}
            </section>

            {/* --- bot link: forward anything to it, imported as it arrives --- */}
            <section className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Bot
                </h3>
                {status.bot.linked && <span className="text-[11px] text-emerald-500">Linked</span>}
              </div>

              {!status.bot.username ? (
                <p className="text-[11px] text-muted-foreground">
                  No bot configured on the server (TELEGRAM_BOT_TOKEN).
                </p>
              ) : status.bot.linked ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[11px] text-muted-foreground">
                    Forward photos or videos to @{status.bot.username} and they'll land in My
                    Photos automatically.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => apiJson("/api/telegram/bot/link", "DELETE"),
                        () => {
                          toast.success("Bot unlinked.")
                          void refresh()
                        }
                      )
                    }
                  >
                    Unlink
                  </Button>
                </div>
              ) : deepLink ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Open this link (or send the code to @{status.bot.username}) to finish. It
                    expires in 10 minutes.
                  </p>
                  <div className="flex gap-2">
                    <Input readOnly value={deepLink} className="text-[11px]" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(deepLink)
                        toast.success("Copied.")
                      }}
                    >
                      <CopyIcon size={14} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" asChild>
                      <a href={deepLink} target="_blank" rel="noreferrer">
                        Open Telegram
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void refresh()}>
                      I've done it
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Link @{status.bot.username} to forward media in as you go — no account login
                    needed.
                  </p>
                  <Button size="sm" variant="outline" onClick={linkBot} disabled={busy}>
                    Get link code
                  </Button>
                </>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
