import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db/prisma.js"
import { currentUser, requireAuth } from "../middleware/auth.js"
import { getFolderWithAccess } from "../lib/access.js"
import { fileCategory } from "../lib/fileType.js"

export const searchRouter = Router()
searchRouter.use(requireAuth)

const TYPES = ["all", "folder", "image", "video", "audio", "doc", "archive", "other"] as const
type TypeFilter = (typeof TYPES)[number]

const QuerySchema = z.object({
  q: z.string().max(255).optional().default(""),
  type: z.enum(TYPES).optional().default("all"),
  folderId: z.string().optional(),
  includeHidden: z.string().optional(),
  limit: z.string().optional(),
})

// Candidate rows are fetched from the DB (name-narrowed where possible),
// then matched exactly in JS — this is what lets '*'/'?' wildcards work
// without hand-rolling raw SQL LIKE patterns. Caps keep a wildcard-only
// query (e.g. "*") from pulling an unbounded table scan into memory.
const CANDIDATE_CAP_SCOPED = 1000
const CANDIDATE_CAP_GLOBAL = 3000

// Walks parentId downward to collect a folder and all its descendants, so a
// folder-scoped search covers the whole subtree, not just direct children.
async function subtreeFolderIds(rootId: string): Promise<string[]> {
  const ids = [rootId]
  let frontier = [rootId]
  while (frontier.length > 0) {
    const kids = await prisma.folder.findMany({
      where: { parentId: { in: frontier }, isTrashed: false },
      select: { id: true },
    })
    frontier = kids.map((k) => k.id)
    ids.push(...frontier)
  }
  return ids
}

// Translates a glob-style pattern ('*' = any run of chars, '?' = one char)
// into an anchored, case-insensitive RegExp. A query with no wildcards is
// treated as a plain substring search (wrapped in '*' on both sides), which
// matches how every other search box in this app behaves.
// `dbHint` is the longest literal run in the pattern, used to narrow the DB
// fetch with a cheap `contains` before the exact regex match runs in JS.
function compileNamePattern(raw: string): { regex: RegExp; dbHint: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasWildcard = /[*?]/.test(trimmed)
  const pattern = hasWildcard ? trimmed : `*${trimmed}*`
  const dbHint = pattern
    .split(/[*?]/)
    .filter(Boolean)
    .reduce((longest, run) => (run.length > longest.length ? run : longest), "")
  let re = ""
  for (const ch of pattern) {
    if (ch === "*") re += ".*"
    else if (ch === "?") re += "."
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return { regex: new RegExp(`^${re}$`, "i"), dbHint }
}

searchRouter.get("/", async (req, res) => {
  const user = currentUser(req)
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: "invalid_query" })
  const { q, type, folderId, includeHidden: includeHiddenRaw } = parsed.data
  const includeHidden = includeHiddenRaw === "1"
  const limit = Math.min(Math.max(parseInt(String(parsed.data.limit ?? "100"), 10) || 100, 1), 300)

  const compiled = compileNamePattern(q)
  const nameWhere = compiled?.dbHint
    ? { name: { contains: compiled.dbHint, mode: "insensitive" as const } }
    : {}

  let fileScopeWhere: Record<string, unknown>
  let folderScopeWhere: Record<string, unknown>
  let scopeFolder: { id: string; name: string } | null = null

  if (folderId) {
    const folder = await getFolderWithAccess(user.id, folderId, "read")
    if (!folder) return res.status(404).json({ error: "not_found" })
    const ids = await subtreeFolderIds(folder.id)
    fileScopeWhere = { folderId: { in: ids } }
    // Exclude the scope root itself — it's the search container, not a hit.
    folderScopeWhere = { id: { in: ids }, NOT: { id: folder.id } }
    scopeFolder = { id: folder.id, name: folder.name }
  } else {
    const spaces = await prisma.space.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
          { isPublic: true },
        ],
      },
      select: { id: true },
    })
    const ownerOrSpace = { OR: [{ ownerId: user.id }, { spaceId: { in: spaces.map((s) => s.id) } }] }
    fileScopeWhere = ownerOrSpace
    // Exclude drive/space root folders — they aren't meaningful search hits.
    folderScopeWhere = { ...ownerOrSpace, parentId: { not: null } }
  }

  const wantFolders = type === "all" || type === "folder"
  const wantFiles = type !== "folder"
  const cap = folderId ? CANDIDATE_CAP_SCOPED : CANDIDATE_CAP_GLOBAL

  const [folderRows, fileRows] = await Promise.all([
    wantFolders
      ? prisma.folder.findMany({
          where: {
            ...folderScopeWhere,
            ...nameWhere,
            isTrashed: false,
            ...(includeHidden ? {} : { isHidden: false }),
          },
          include: { parent: { select: { name: true } } },
          orderBy: { name: "asc" },
          take: cap,
        })
      : Promise.resolve([]),
    wantFiles
      ? prisma.file.findMany({
          where: {
            ...fileScopeWhere,
            ...nameWhere,
            isTrashed: false,
            ...(includeHidden ? {} : { isHidden: false }),
          },
          include: { folder: { select: { name: true } } },
          orderBy: { name: "asc" },
          take: cap,
        })
      : Promise.resolve([]),
  ])

  const regex = compiled?.regex
  const matchesName = (name: string) => !regex || regex.test(name)

  const matchedFolders = folderRows
    .filter((f) => matchesName(f.name))
    .map(({ parent, ...rest }) => ({ ...rest, parentName: parent?.name ?? null }))

  const matchedFiles = fileRows
    .filter((f) => matchesName(f.name))
    .filter((f) => (type === "all" ? true : fileCategory(f.mimeType, f.name) === (type as TypeFilter)))
    .map(({ folder, size, ...rest }) => ({
      ...rest,
      size: Number(size),
      folderName: folder?.name ?? null,
    }))

  const truncated =
    folderRows.length === cap ||
    fileRows.length === cap ||
    matchedFolders.length > limit ||
    matchedFiles.length > limit

  res.json({
    folders: matchedFolders.slice(0, limit),
    files: matchedFiles.slice(0, limit),
    truncated,
    scope: scopeFolder,
  })
})
