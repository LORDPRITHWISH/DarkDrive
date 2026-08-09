import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useConfirm } from "@/store/confirm"

export function ConfirmDialog() {
  const pending = useConfirm((s) => s.pending)
  const close = useConfirm((s) => s.close)

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && (
            <DialogDescription>{pending.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => close(false)}>
            {pending?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            size="sm"
            variant={pending?.destructive ? "destructive" : "default"}
            onClick={() => close(true)}
            autoFocus
          >
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
