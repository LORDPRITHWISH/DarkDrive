import { CheckIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { formatBytes } from "@/lib/format"
import type { Can, MemberCan, MemberRequest } from "@/lib/types"

// What a member may do, and what waits on the owner when they have to ask:
// the controls for the permission layer a shared synced folder (ShareDialog)
// and a space (SpaceManageDialog) have in common. Everything else about the
// two is each dialog's own.

const CAN: Record<Can, string> = { YES: "Yes", ASK: "Ask me first", NO: "No" }

function CanSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: Can
  disabled?: boolean
  onChange: (v: Can) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Select items={CAN} value={value} disabled={disabled} onValueChange={(v) => onChange(v as Can)}>
        <SelectTrigger size="sm" className="rounded-xl text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CAN).map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/** A member's two settings. `onChange` gets only the one that changed. */
export function CanSelects({
  value,
  disabled,
  className = "",
  onChange,
}: {
  value: MemberCan
  disabled?: boolean
  className?: string
  onChange: (patch: Partial<MemberCan>) => void
}) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
      <CanSelect
        label="Add & edit"
        value={value.canUpload}
        disabled={disabled}
        onChange={(v) => onChange({ canUpload: v })}
      />
      <CanSelect
        label="Delete"
        value={value.canDelete}
        disabled={disabled}
        onChange={(v) => onChange({ canDelete: v })}
      />
    </div>
  )
}

/** What members who have to ask are waiting on, for the owner to agree to or decline. */
export function Requests({
  requests,
  onAnswer,
}: {
  requests: MemberRequest[]
  onAnswer: (ids: string[], approve: boolean) => void
}) {
  if (!requests.length) return null
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Waiting for your OK</div>
        {requests.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => onAnswer(requests.map((r) => r.id), true)}>
            Agree to all {requests.length}
          </Button>
        )}
      </div>
      <ul className="mt-1 flex flex-col">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-2 border-b py-2 last:border-b-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={r.path}>
                {r.path}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {r.kind === "upload"
                  ? `${r.by} added it, ${formatBytes(r.size)}. Nobody else sees it yet.`
                  : `${r.by} wants it deleted.`}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Agree"
              aria-label={`Agree: ${r.path}`}
              onClick={() => onAnswer([r.id], true)}
            >
              <CheckIcon size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              title="Decline"
              aria-label={`Decline: ${r.path}`}
              onClick={() => onAnswer([r.id], false)}
            >
              <XIcon size={14} />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
