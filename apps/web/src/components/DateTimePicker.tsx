import { useState } from "react"
import { CalendarBlankIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Input } from "@workspace/ui/components/input"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

type Props = {
  /** Local "YYYY-MM-DDTHH:mm" — same format as <input type="datetime-local">. "" = unset. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  title?: string
}

const pad = (n: number) => String(n).padStart(2, "0")
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// shadcn date picker (Popover + Calendar) with a time field, for expiry inputs.
export function DateTimePicker({ value, onChange, placeholder = "Never", className, title }: Props) {
  const [open, setOpen] = useState(false)
  // "YYYY-MM-DDTHH:mm" without an offset parses as local time.
  const date = value ? new Date(value) : undefined
  const time = value.slice(11, 16) || "23:59"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={title}
        render={
          <Button
            variant="outline"
            className={cn("justify-start font-normal", !date && "text-muted-foreground", className)}
          />
        }
      >
        <CalendarBlankIcon size={16} />
        <span className="truncate">
          {date ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          disabled={{ before: new Date() }}
          onSelect={(d) => d && onChange(`${toDay(d)}T${time}`)}
        />
        <div className="flex items-center gap-2 border-t p-3">
          <Input
            type="time"
            value={time}
            disabled={!date}
            onChange={(e) => date && e.target.value && onChange(`${toDay(date)}T${e.target.value}`)}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!date}
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
