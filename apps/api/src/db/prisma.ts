import { PrismaClient } from "@prisma/client"

// `tsx watch` restarts the process on every file change and a fresh
// PrismaClient opens its own Postgres pool each time, quickly exhausting
// `max_connections`. Cache the client on `globalThis` in development so
// reloads reuse the same pool.
const g = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  g.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") g.prisma = prisma

// Graceful shutdown: close the pool when the process is asked to exit so we
// don't leak connections on restart.
const shutdown = async () => {
  try {
    await prisma.$disconnect()
  } catch {
    // ignore
  }
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
process.once("beforeExit", shutdown)
