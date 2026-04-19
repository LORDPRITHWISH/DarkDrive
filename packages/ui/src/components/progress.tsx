import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "@workspace/ui/lib/utils"

function Progress({
  className,
  indicatorClassName,
  value = 0,
  ...props
}: ProgressPrimitive.Root.Props & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      <ProgressPrimitive.Track className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
        <ProgressPrimitive.Indicator
          className={cn("bg-primary h-full rounded-full transition-all", indicatorClassName)}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
