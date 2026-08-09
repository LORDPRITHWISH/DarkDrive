// In-memory ring of recent server log lines so the admin panel can see what a
// box we can't SSH into is actually doing. Console is patched once at import,
// so every existing console.* call is captured without touching call sites.
// ponytail: memory only — cleared on restart. Ship to a file/Loki if we ever
// need history across deploys.
export type LogEntry = { t: number; level: "log" | "warn" | "error"; msg: string }

const MAX = 800
const buf: LogEntry[] = []

export function recentLogs(): LogEntry[] {
  return buf
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v
  if (v instanceof Error) return v.stack ?? v.message
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

for (const level of ["log", "warn", "error"] as const) {
  const orig = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    buf.push({ t: Date.now(), level, msg: args.map(stringify).join(" ").slice(0, 4000) })
    if (buf.length > MAX) buf.splice(0, buf.length - MAX)
    orig(...args)
  }
}
