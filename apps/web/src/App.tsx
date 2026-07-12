import { useEffect } from "react"
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom"
import { useAuth } from "@/store/auth"
import { LoginPage } from "@/pages/Login"
import { DrivePage } from "@/pages/Drive"
import { SpacePage } from "@/pages/Space"
import { SpacesPage } from "@/pages/Spaces"
import { InvitePage } from "@/pages/Invite"
import { SharePage } from "@/pages/SharePage"
import { RecentPage } from "@/pages/Recent"
import { SearchPage } from "@/pages/Search"
import { AdminPage } from "@/pages/Admin"
import { HomePage } from "@/pages/Home"
import { BinPage } from "@/pages/Bin"
import { LandingPage } from "@/pages/Landing"
import { StarredPage } from "@/pages/Starred"
import { UploadToaster } from "@/components/UploadToaster"
import { Toaster } from "@/components/Toaster"
import { getSocket } from "@/lib/socket"
import { useNotifications } from "@/store/notifications"
import { toast } from "@/store/toast"
import type { AppNotification } from "@/lib/types"

// Login is a hard server/page redirect (Google OAuth callback, dev-login),
// so a normal router return-URL doesn't survive it. We stash the path in
// localStorage instead — only for /invite links, the one case where landing
// back on /home after login would silently drop what the user came to do.
const RETURN_TO_KEY = "dd.returnTo"

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, fetchMe } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    void fetchMe()
  }, [fetchMe])
  useEffect(() => {
    if (loading) return
    if (!user) {
      if (loc.pathname.startsWith("/invite/")) {
        localStorage.setItem(RETURN_TO_KEY, loc.pathname)
      }
      return
    }
    const returnTo = localStorage.getItem(RETURN_TO_KEY)
    if (returnTo && returnTo !== loc.pathname) {
      localStorage.removeItem(RETURN_TO_KEY)
      nav(returnTo, { replace: true })
    }
  }, [user, loading, loc.pathname, nav])
  if (loading) return <div className="grid min-h-svh place-items-center">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Root() {
  const { user, loading, fetchMe } = useAuth()
  const nav = useNavigate()
  useEffect(() => {
    void fetchMe()
  }, [fetchMe])
  useEffect(() => {
    if (!loading && user) nav("/home", { replace: true })
  }, [user, loading, nav])
  if (loading)
    return <div className="grid min-h-svh place-items-center">Loading…</div>
  if (user) return null
  return <LandingPage />
}

export function App() {
  useEffect(() => {
    const s = getSocket()
    const onNotification = (n: AppNotification) => {
      useNotifications.getState().receive(n)
      toast.info(n.title)
    }
    s.on("notification:new", onNotification)
    return () => {
      s.off("notification:new", onNotification)
      s.disconnect()
    }
  }, [])
  return (
    <BrowserRouter>
      <Toaster />
      <UploadToaster />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:token" element={<SharePage />} />
        <Route
          path="/home"
          element={
            <Protected>
              <HomePage />
            </Protected>
          }
        />
        <Route
          path="/drive/:folderId"
          element={
            <Protected>
              <DrivePage />
            </Protected>
          }
        />
        <Route
          path="/spaces"
          element={
            <Protected>
              <SpacesPage />
            </Protected>
          }
        />
        <Route
          path="/spaces/:id"
          element={
            <Protected>
              <SpacePage />
            </Protected>
          }
        />
        <Route
          path="/invite/:token"
          element={
            <Protected>
              <InvitePage />
            </Protected>
          }
        />
        <Route
          path="/recent"
          element={
            <Protected>
              <RecentPage />
            </Protected>
          }
        />
        <Route
          path="/search"
          element={
            <Protected>
              <SearchPage />
            </Protected>
          }
        />
        <Route
          path="/starred"
          element={
            <Protected>
              <StarredPage />
            </Protected>
          }
        />
        <Route
          path="/bin"
          element={
            <Protected>
              <BinPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <AdminPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
