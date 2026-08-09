import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

// Wraps a file/folder name so hovering it reveals the full name in a
// popover — pass the same className you'd put on a truncated name element.
export function HoverName({
  name,
  className,
  as = "span",
}: {
  name: string
  className?: string
  as?: "span" | "div"
}) {
  const Tag = as
  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        openOnHover
        delay={300}
        render={<Tag className={className} />}
      >
        {name}
      </PopoverTrigger>
      <PopoverContent
        positionerClassName="z-80"
        className="w-auto max-w-xs px-3 py-1.5 text-sm wrap-break-word"
      >
        {name}
      </PopoverContent>
    </Popover>
  )
}
