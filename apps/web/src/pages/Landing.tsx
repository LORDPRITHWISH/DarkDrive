import { Link } from "react-router-dom"
import {
  ArrowRightIcon,
  CloudIcon,
  UsersThreeIcon,
  EyeIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <img src="/DarkDrive.png" alt="DarkDrive" className="h-8 w-8 rounded-md" />
          <span className="text-lg font-semibold tracking-tight">DarkDrive</span>
        </div>
        <Button size="sm" render={<Link to="/login" />}>
          Get started
          <ArrowRightIcon size={14} />
        </Button>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <img
            src="/DarkDrive.png"
            alt="DarkDrive"
            className="mx-auto mb-6 h-20 w-20 rounded-xl"
          />
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Your files, your space, <span className="text-primary">your drive</span>
            .
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-base sm:text-lg">
            A private, self-hosted drive for you and your team. Upload anything,
            preview it inline, and share it into collaborative workspaces — with
            real storage controls and a dashboard that actually tells you what's
            going on.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <Button size="lg" render={<Link to="/login" />}>
              Get started
              <ArrowRightIcon size={16} />
            </Button>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            New accounts start with 1 GB of storage.
          </p>
        </section>

        <section className="border-t bg-muted/20">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
            <Feature
              icon={<CloudIcon size={20} />}
              title="Fast uploads"
              body="Drag-and-drop up to 100 files at a time. Quota-aware — uploads that wouldn't fit are rejected before they waste bandwidth."
            />
            <Feature
              icon={<EyeIcon size={20} />}
              title="Inline preview"
              body="Images, video, audio, PDF, CSV, text and code render in-place. Office docs fall back to the Microsoft viewer."
            />
            <Feature
              icon={<UsersThreeIcon size={20} />}
              title="Shared spaces"
              body="Invite teammates into a workspace. Uploads into a shared space stay in your own drive and surface there as shortcuts."
            />
            <Feature
              icon={<ShieldCheckIcon size={20} />}
              title="Admin controls"
              body="Per-user storage quotas, role management, disable/enable accounts, and a dashboard with live CPU, RAM, and disk."
            />
          </div>
        </section>
      </main>

      <footer className="border-t px-6 py-5">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs sm:flex-row">
          <div>© DarkDrive</div>
          <div>Self-hosted file storage</div>
        </div>
      </footer>
    </div>
  )
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  )
}
