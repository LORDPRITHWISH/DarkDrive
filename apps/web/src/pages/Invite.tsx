import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { apiJson } from "@/lib/api"

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This invite link doesn't exist.",
  expired: "This invite link has expired.",
  exhausted: "This invite link has reached its use limit.",
}

export function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    apiJson<{ spaceId: string }>(`/api/spaces/invites/${token}/accept`, "POST")
      .then((r) => navigate(`/spaces/${r.spaceId}`, { replace: true }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "failed"
        setError(ERROR_MESSAGES[msg] ?? "Couldn't accept this invite.")
      })
  }, [token, navigate])

  return (
    <div className="grid min-h-svh place-items-center p-4">
      <div className="text-center">
        {error ? (
          <>
            <WarningCircleIcon size={40} weight="fill" className="text-destructive mx-auto" />
            <p className="mt-3 text-sm font-medium">{error}</p>
            <Link to="/spaces" className="text-primary mt-4 inline-block text-sm hover:underline">
              Go to your spaces
            </Link>
          </>
        ) : (
          <>
            <CheckCircleIcon size={40} weight="fill" className="text-primary mx-auto animate-pulse" />
            <p className="text-muted-foreground mt-3 text-sm">Joining space…</p>
          </>
        )}
      </div>
    </div>
  )
}
