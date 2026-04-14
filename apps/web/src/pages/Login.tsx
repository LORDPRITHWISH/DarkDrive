import { Button } from "@workspace/ui/components/button"
import { apiUrl } from "@/lib/config"

export function LoginPage() {
  return (
    <div className="grid min-h-svh place-items-center p-6">
      <div className="bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground grid h-10 w-10 place-items-center rounded-md text-lg font-bold">
            D
          </div>
          <div className="text-2xl font-semibold tracking-tight">DarkDrive</div>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          Your private, self-hosted drive. Sign in with Google to continue.
        </p>
        <Button
          className="mt-6 w-full"
          size="lg"
          onClick={() => (window.location.href = apiUrl("/api/auth/google"))}
        >
          Continue with Google
        </Button>
      </div>
    </div>
  )
}
