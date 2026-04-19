import { WarningCircleIcon } from "@phosphor-icons/react"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Button } from "@workspace/ui/components/button"

type PopConfirmProps = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  trigger: React.ReactElement
  align?: "start" | "center" | "end"
}

// Ant-style inline confirmation: small popover anchored to the trigger,
// "Are you sure? [Cancel] [Confirm]". Pass an element for `trigger`; it is
// rendered as the popover trigger.
export function PopConfirm({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  trigger,
  align = "end",
}: PopConfirmProps) {
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} className="w-64">
        <div className="flex gap-2">
          <WarningCircleIcon
            size={18}
            className={destructive ? "text-destructive shrink-0" : "shrink-0"}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{title}</div>
            {description && (
              <div className="text-muted-foreground mt-0.5 text-xs">
                {description}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <PopoverClose render={<Button size="sm" variant="ghost" />}>
            {cancelLabel}
          </PopoverClose>
          <PopoverClose
            render={
              <Button
                size="sm"
                variant={destructive ? "destructive" : "default"}
                onClick={() => void onConfirm()}
              />
            }
          >
            {confirmLabel}
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}
