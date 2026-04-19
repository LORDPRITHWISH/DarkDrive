import { useEffect } from "react"
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom"
import { useAuth } from "@/store/auth"
import { LoginPage } from "@/pages/Login"
import { DrivePage } from "@/pages/Drive"
import { SharePage } from "@/pages/SharePage"
import { RecentPage } from "@/pages/Recent"
import { AdminPage } from "@/pages/Admin"
import { HomePage } from "@/pages/Home"
import { BinPage } from "@/pages/Bin"
import { LandingPage } from "@/pages/Landing"
import { StarredPage } from "@/pages/Starred"
import { getSocket } from "@/lib/socket"

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, fetchMe } = useAuth()
  useEffect(() => {
    void fetchMe()
  }, [fetchMe])
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
    return () => {
      s.disconnect()
    }
  }, [])
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Root />} />
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
          path="/recent"
          element={
            <Protected>
              <RecentPage />
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
