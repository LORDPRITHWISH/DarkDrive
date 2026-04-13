import type { Server as HttpServer } from "node:http"
import { Server } from "socket.io"
import { prisma } from "../db/prisma.js"
import { env } from "../env.js"
import { sessionMiddleware } from "../auth/session.js"
import { passport } from "../auth/passport.js"
import type { Request, Response, NextFunction } from "express"

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_URL, credentials: true },
  })

  // share express session with socket.io
  const wrap = (mw: any) => (socket: any, next: any) =>
    mw(socket.request as Request, {} as Response, next as NextFunction)
  io.use(wrap(sessionMiddleware))
  io.use(wrap(passport.initialize()))
  io.use(wrap(passport.session()))

  io.use((socket, next) => {
    const req: any = socket.request
    if (!req.user) return next(new Error("unauthorized"))
    ;(socket.data as any).userId = req.user.id
    next()
  })

  io.on("connection", (socket) => {
    const userId: string = (socket.data as any).userId

    socket.on("space:join", async (spaceId: string, ack?: (ok: boolean) => void) => {
      const member = await prisma.spaceMember.findUnique({
        where: { spaceId_userId: { spaceId, userId } },
      })
      if (!member) return ack?.(false)
      socket.join(`space:${spaceId}`)
      socket.to(`space:${spaceId}`).emit("presence:join", { userId })
      ack?.(true)
    })

    socket.on("space:leave", (spaceId: string) => {
      socket.leave(`space:${spaceId}`)
      socket.to(`space:${spaceId}`).emit("presence:leave", { userId })
    })

    // cursor / selection broadcast for collaborative space (generic payload)
    socket.on("space:cursor", ({ spaceId, payload }: { spaceId: string; payload: any }) => {
      socket.to(`space:${spaceId}`).emit("space:cursor", { userId, payload })
    })

    // broadcast filesystem changes (after REST mutation, client emits)
    socket.on("space:fs", ({ spaceId, event }: { spaceId: string; event: any }) => {
      socket.to(`space:${spaceId}`).emit("space:fs", { userId, event })
    })

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("space:"))
          socket.to(room).emit("presence:leave", { userId })
      }
    })
  })

  return io
}
