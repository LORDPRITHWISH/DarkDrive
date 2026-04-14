import { io, type Socket } from "socket.io-client"
import { API_BASE } from "./config"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket) return socket
  // When API_BASE is empty (dev), connect same-origin so the Vite proxy forwards /socket.io.
  socket = API_BASE
    ? io(API_BASE, { withCredentials: true, autoConnect: true })
    : io({ withCredentials: true, autoConnect: true })
  return socket
}
