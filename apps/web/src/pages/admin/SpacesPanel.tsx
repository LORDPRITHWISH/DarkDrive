import { Link } from "react-router-dom"
import { FolderOpenIcon, InfoIcon, GlobeIcon } from "@phosphor-icons/react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { SpaceLogo } from "@/components/SpaceLogo"
import { formatDate } from "@/lib/format"
import type { AdminSpace } from "@/lib/types"

// Opening a space from admin drops straight into its files — the same
// "default function" a space's own owner gets from the sidebar. Info and
// settings are one click further, via the space overview page.
export function SpacesPanel({ spaces }: { spaces: AdminSpace[] }) {
  return (
    <Card className="gap-0 p-0">
      <CardHeader className="p-4">
        <CardTitle>Spaces</CardTitle>
        <CardDescription>
          Every space on the instance. Click one to browse its files.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-0 p-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Space</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="w-28">Members</TableHead>
              <TableHead className="w-28">Visibility</TableHead>
              <TableHead className="w-32">Created</TableHead>
              <TableHead className="w-24 pr-4 text-right">Info</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spaces.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="pl-4">
                  <Link
                    to={`/drive/${s.rootFolderId}`}
                    title={`Browse files in "${s.name}"`}
                    className="group hover:bg-accent/40 -my-1 -ml-2 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-md py-1 pl-2 pr-1"
                  >
                    <SpaceLogo space={s} size={32} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="truncate font-medium group-hover:underline">
                        {s.name}
                      </span>
                    </div>
                    <FolderOpenIcon
                      size={14}
                      className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground truncate text-sm">
                  {s.ownerName ?? s.ownerEmail ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {s.memberCount}
                </TableCell>
                <TableCell>
                  {s.isPublic ? (
                    <Badge variant="muted" className="gap-1">
                      <GlobeIcon size={10} /> public
                    </Badge>
                  ) : (
                    <Badge variant="muted">private</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(s.createdAt)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="View info & settings"
                    render={<Link to={`/spaces/${s.id}`} />}
                  >
                    <InfoIcon size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {spaces.length === 0 && (
          <div className="text-muted-foreground p-6 text-center text-sm">
            No spaces yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
