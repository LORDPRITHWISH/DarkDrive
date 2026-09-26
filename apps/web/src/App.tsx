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
import { UploadHistoryPage } from "@/pages/UploadHistory"
import { SearchPage } from "@/pages/Search"
import { AdminPage } from "@/pages/Admin"
import { HomePage } from "@/pages/Home"
import { BinPage } from "@/pages/Bin"
import { LandingPage } from "@/pages/Landing"
import { StarredPage } from "@/pages/Starred"
import { StoragePage } from "@/pages/Storage"
import { ProfilePage } from "@/pages/Profile"
import { ShareTargetPage } from "@/pages/ShareTarget"
import { TempLoginPage } from "@/pages/TempLogin"
import { PairPage } from "@/pages/Pair"
import { SyncPage } from "@/pages/Sync"
import { desktop } from "@/lib/desktop"
import { UploadToaster } from "@/components/UploadToaster"
import { Toaster } from "@/components/Toaster"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { getSocket } from "@/lib/socket"
import { useNotifications } from "@/store/notifications"
import { useDrive } from "@/store/drive"
import { toast } from "@/store/toast"
import { formatDate } from "@/lib/format"
import type { AppNotification } from "@/lib/types"

// Login is a hard server/page redirect (Google OAuth callback, dev-login),
// so a normal router return-URL doesn't survive it. We stash the path in
// localStorage instead — for the cases where landing back on /home after login
// would silently drop what the user came to do: /invite links, /share-target
// (files are already parked in the SW cache and would otherwise be stranded),
// and /pair (the query string carries the desktop app's loopback port/state).
const RETURN_TO_KEY = "dd.returnTo"
const RETURN_TO_PATHS = ["/invite/", "/share-target", "/pair"]

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, fetchMe } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    void fetchMe()
  }, [fetchMe])
  useEffect(() => {
    if (loading) return
    const here = loc.pathname + loc.search
    if (!user) {
      if (RETURN_TO_PATHS.some((p) => loc.pathname.startsWith(p))) {
        localStorage.setItem(RETURN_TO_KEY, here)
      }
      return
    }
    const returnTo = localStorage.getItem(RETURN_TO_KEY)
    if (returnTo && returnTo !== here) {
      localStorage.removeItem(RETURN_TO_KEY)
      nav(returnTo, { replace: true })
    }
  }, [user, loading, loc.pathname, loc.search, nav])
  if (loading) return <div className="grid min-h-svh place-items-center">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      {user.tempSessionExpiresAt && <TempSessionPill expiresAt={user.tempSessionExpiresAt} />}
      {children}
    </>
  )
}

// Marks a temporary-session login on every page, and signs the tab out the
// moment it ends — otherwise the next click would just start 401-ing.
function TempSessionPill({ expiresAt }: { expiresAt: string }) {
  useEffect(() => {
    const t = setTimeout(
      () => window.location.assign("/login"),
      new Date(expiresAt).getTime() - Date.now()
    )
    return () => clearTimeout(t)
  }, [expiresAt])
  return (
    <div className="pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs whitespace-nowrap text-amber-600 backdrop-blur dark:text-amber-400">
      Temporary session · ends {formatDate(expiresAt)}
    </div>
  )
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
  // The desktop app is already installed: no pitch, straight to signing in.
  if (desktop) return <Navigate to="/login" replace />
  return <LandingPage />
}

export function App() {
  useEffect(() => {
    // getSocket() is an app-wide singleton, not owned by this effect — under
    // StrictMode's dev-only mount/cleanup/remount cycle, a disconnect() here
    // would kill it for the rest of the session, since socket.io-client
    // doesn't auto-reconnect after a manual disconnect. connect() is a no-op
    // if already connected, and revives it otherwise.
    const s = getSocket()
    s.connect()
    const onNotification = (n: AppNotification) => {
      useNotifications.getState().receive(n)
      toast.info(n.title)
    }
    s.on("notification:new", onNotification)

    // Media forwarded to the Telegram bot is downloaded server-side and can
    // start at any time, with no request from this tab to hang progress off —
    // so it gets pushed into the same upload tracker a drag-and-drop uses.
    const upsertUpload = (id: string, patch: Record<string, unknown>) => {
      const uploads = useDrive.getState().uploads
      const row = uploads.find((u) => u.id === id)
      useDrive.setState({
        uploads: row
          ? uploads.map((u) => (u.id === id ? { ...u, ...patch } : u))
          : [
              ...uploads,
              { id, name: "", size: 0, loaded: 0, progress: 0, speed: 0, done: false, ...patch },
            ],
      })
    }
    const onTgProgress = (p: {
      id: string
      name: string
      downloaded: number
      total: number
    }) =>
      upsertUpload(`tg:${p.id}`, {
        name: `${p.name} (Telegram)`,
        size: p.total,
        loaded: p.downloaded,
        progress: p.total > 0 ? (p.downloaded / p.total) * 100 : 0,
      })
    const onTgDone = (p: { id: string; name: string; status: string }) => {
      const id = `tg:${p.id}`
      upsertUpload(id, {
        name: `${p.name} (Telegram)`,
        progress: 100,
        done: true,
        // Reuse the toaster's own error copy where the wording already exists.
        error:
          p.status === "imported" || p.status === "already_imported"
            ? undefined
            : p.status === "skipped_quota"
              ? "quota_exceeded"
              : p.status,
      })
      if (p.status === "imported") void useDrive.getState().refresh()
      setTimeout(
        () =>
          useDrive.setState({
            uploads: useDrive.getState().uploads.filter((u) => u.id !== id),
          }),
        5000
      )
    }
    s.on("telegram:bot:progress", onTgProgress)
    s.on("telegram:bot:received", onTgDone)

    return () => {
      s.off("notification:new", onNotification)
      s.off("telegram:bot:progress", onTgProgress)
      s.off("telegram:bot:received", onTgDone)
    }
  }, [])
  return (
    <BrowserRouter>
      <Toaster />
      <UploadToaster />
      <ConfirmDialog />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/t/:code?" element={<TempLoginPage />} />
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
          path="/uploads"
          element={
            <Protected>
              <UploadHistoryPage />
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
          path="/storage"
          element={
            <Protected>
              <StoragePage />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <ProfilePage />
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
          path="/pair"
          element={
            <Protected>
              <PairPage />
            </Protected>
          }
        />
        <Route
          path="/sync"
          element={
            <Protected>
              <SyncPage />
            </Protected>
          }
        />
        <Route
          path="/share-target"
          element={
            <Protected>
              <ShareTargetPage />
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
