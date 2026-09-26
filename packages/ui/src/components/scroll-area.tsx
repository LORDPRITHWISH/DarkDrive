import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "@workspace/ui/lib/utils"

type ScrollAreaProps = ScrollAreaPrimitive.Root.Props & {
  /** Forwarded to the element that actually scrolls — for scrollTop, onScroll, IntersectionObserver roots, padding that must count against the scroll box. */
  viewportProps?: Omit<ScrollAreaPrimitive.Viewport.Props, "className"> & {
    className?: string
  }
}

// Root and viewport are sized with flex rather than `size-full`, so a root
// constrained only by `max-h-*` (or by a flex parent's max-height) still
// scrolls — a percentage height never resolves against an auto-height parent.
function ScrollArea({
  className,
  children,
  viewportProps,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative flex flex-col", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        {...viewportProps}
        className={cn(
          "min-h-0 flex-1 overscroll-contain rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring",
          viewportProps?.className
        )}
      >
        <ScrollAreaPrimitive.Content>{children}</ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
