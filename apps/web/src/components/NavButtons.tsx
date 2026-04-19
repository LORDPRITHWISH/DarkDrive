import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useMe } from "@/store/me"

export function NavButtons() {
  const nav = useMe((s) => s.nav)
  const loadNav = useMe((s) => s.loadNav)
  const pushNav = useMe((s) => s.pushNav)
  const backNav = useMe((s) => s.backNav)
  const forwardNav = useMe((s) => s.forwardNav)
  const loc = useLocation()
  const navigate = useNavigate()

  // On first mount, pull server-side history state.
  useEffect(() => {
    void loadNav()
  }, [loadNav])

  // Only track folder navigation inside /drive. The server dedupes consecutive
  // identical entries so back/forward don't pollute the stack.
  useEffect(() => {
    if (loc.pathname.startsWith("/drive/")) void pushNav(loc.pathname)
  }, [loc.pathname, pushNav])

  async function onBack() {
    const s = await backNav()
    if (s.current && s.current !== loc.pathname) navigate(s.current)
  }
  async function onForward() {
    const s = await forwardNav()
    if (s.current && s.current !== loc.pathname) navigate(s.current)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={!nav?.canBack}
        onClick={onBack}
        title="Back"
        aria-label="Back"
      >
        <ArrowLeftIcon size={16} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!nav?.canForward}
        onClick={onForward}
        title="Forward"
        aria-label="Forward"
      >
        <ArrowRightIcon size={16} />
      </Button>
    </div>
  )
}
