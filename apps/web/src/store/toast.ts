import { create } from "zustand"

export type ToastKind = "success" | "error" | "info"

export type Toast = {
  id: string
  kind: ToastKind
  message: string
  action?: { label: string; onClick: () => void | Promise<void> }
  createdAt: number
  timeoutMs: number
}

type ToastState = {
  toasts: Toast[]
  push: (t: Omit<Toast, "id" | "createdAt">) => string
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const toast: Toast = { ...t, id, createdAt: Date.now() }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    if (t.timeoutMs > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
      }, t.timeoutMs)
    }
    return id
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// Imperative helpers. Consumers don't need to pull the store hook — these work
// from anywhere (stores, event handlers, effects).
export const toast = {
  success: (message: string, timeoutMs = 3500) =>
    useToasts.getState().push({ kind: "success", message, timeoutMs }),
  error: (message: string, timeoutMs = 5000) =>
    useToasts.getState().push({ kind: "error", message, timeoutMs }),
  info: (message: string, timeoutMs = 3500) =>
    useToasts.getState().push({ kind: "info", message, timeoutMs }),
  // Toast with an action button (e.g. Undo). Longer default timeout so the
  // user has time to react.
  action: (
    message: string,
    action: { label: string; onClick: () => void | Promise<void> },
    opts?: { kind?: ToastKind; timeoutMs?: number }
  ) =>
    useToasts.getState().push({
      kind: opts?.kind ?? "info",
      message,
      action,
      timeoutMs: opts?.timeoutMs ?? 6000,
    }),
}
