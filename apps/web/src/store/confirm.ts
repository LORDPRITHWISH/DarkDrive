import { create } from "zustand"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

type ConfirmState = {
  pending: Pending | null
  close: (ok: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  pending: null,
  close: (ok) => {
    const p = get().pending
    if (!p) return
    set({ pending: null })
    p.resolve(ok)
  },
}))

// Drop-in async replacement for window.confirm — `await confirmDialog({...})`
// resolves true only when the user confirms. Rendered by <ConfirmDialog />.
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Only one at a time; an existing prompt is superseded and reads as cancel.
    useConfirm.getState().pending?.resolve(false)
    useConfirm.setState({ pending: { ...opts, resolve } })
  })
}
