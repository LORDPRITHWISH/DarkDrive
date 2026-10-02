// When sync may run: not while it's paused, and only inside the sync hours
// if any are set. Pure, so main.ts can ask it on a timer and schedule.test.ts
// can run it against a clock of its own.
import type { Hours } from "./settings.js"

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** "HH:MM", 24-hour: what an <input type="time"> gives. */
export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

export function inHours({ from, to }: Hours, at: Date): boolean {
  const now = at.getHours() * 60 + at.getMinutes()
  const f = minutes(from)
  const t = minutes(to)
  // The same time twice isn't a window at all; read it as "all day" rather
  // than as never, which would silently stop sync for good.
  if (f === t) return true
  // to before from wraps past midnight: 22:00 to 06:00.
  return f < t ? now >= f && now < t : now >= f || now < t
}

export function wanted(s: { pausedUntil: number; hours: Hours | null }, at = new Date()): boolean {
  return s.pausedUntil <= at.getTime() && (!s.hours || inHours(s.hours, at))
}

/** Midnight tonight: when "pause until tomorrow" ends. */
export function tomorrow(at = new Date()): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime()
}
