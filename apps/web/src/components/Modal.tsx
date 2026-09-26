import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

// Width comes from `w-*`; the base DialogContent's max-w only keeps a gutter
// on phones. Don't size dialogs with max-w-* — that's what made them all 28rem.
const SIZES = {
  sm: "w-sm",
  md: "w-md",
  lg: "w-lg",
  xl: "w-xl",
  "2xl": "w-2xl",
  "3xl": "w-3xl",
  "6xl": "w-6xl",
}

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  size?: keyof typeof SIZES
  footer?: ReactNode
  children?: ReactNode
  /** On the dialog itself — e.g. a fixed height for browser-style pickers. */
  className?: string
  /** On the scrolling body — padding, or `flex overflow-hidden` for multi-pane layouts. */
  bodyClassName?: string
  showCloseButton?: boolean
}

// The app's one dialog layout: bordered header, scrolling body, bordered
// footer. Header and footer stay pinned; only the body scrolls, capped at 85vh.
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  footer,
  children,
  className,
  bodyClassName,
  showCloseButton,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn("flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0", SIZES[size], className)}
      >
        <DialogHeader
          className={cn("flex-row items-start gap-3 p-4 pr-12", children != null && "border-b")}
        >
          {icon && <div className="mt-px shrink-0">{icon}</div>}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <DialogTitle className="leading-snug">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>
        {children != null && (
          <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
        )}
        {footer && (
          <DialogFooter className="flex-row items-center justify-end border-t p-3">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
