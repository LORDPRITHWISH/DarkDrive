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
    if (!loading) {
      if (user) nav(`/drive/${user.rootFolderId}`, { replace: true })
      else nav("/login", { replace: true })
    }
  }, [user, loading, nav])
  return <div className="grid min-h-svh place-items-center">Loading…</div>
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
          path="/drive/:folderId"
          element={
            <Protected>
              <DrivePage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
