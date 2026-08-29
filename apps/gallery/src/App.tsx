import { useEffect } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Shell } from "@/components/Shell"
import { AlbumPage } from "@/pages/Album"
import { AlbumsPage } from "@/pages/Albums"
import { LoginPage } from "@/pages/Login"
import { TimelinePage } from "@/pages/Timeline"
import { useGallery } from "@/store/gallery"

export function App() {
  const { me, meLoading, fetchMe } = useGallery()

  useEffect(() => {
    void fetchMe()
  }, [fetchMe])

  if (meLoading)
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm tracking-widest uppercase">
        DarkGallery
      </div>
    )
  if (!me) return <LoginPage />

  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<TimelinePage filter="all" />} />
          <Route path="/favorites" element={<TimelinePage filter="favorites" />} />
          <Route path="/bin" element={<TimelinePage filter="trash" />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/albums/:id" element={<AlbumPage />} />
          <Route path="*" element={<TimelinePage filter="all" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
