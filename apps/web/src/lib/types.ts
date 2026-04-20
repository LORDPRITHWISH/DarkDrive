export type User = {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  rootFolderId: string
  role: "USER" | "ADMIN"
  storageQuotaBytes: number
}

export type QuotaInfo = {
  used: number
  total: number
  role: "USER" | "ADMIN"
  upgradeRequestedAt: string | null
  upgradeRequestedBytes: number | null
}

export type RecentFile = FileItem & { accessedAt: string; action: "view" | "download" }

export type NavState = {
  current: string | null
  canBack: boolean
  canForward: boolean
  length: number
  index: number
}

export type ServerStats = {
  host: {
    platform: string
    arch: string
    hostname: string
    release: string
    node: string
    uptimeSec: number
  }
  process: {
    pid: number
    uptimeSec: number
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
  }
  cpu: {
    model: string
    cores: number
    speedMHz: number
    usagePct: number
    load1: number
    load5: number
    load15: number
  }
  memory: { total: number; free: number; used: number; pct: number }
  disk: { total: number; free: number; used: number; pct: number } | null
  redis: {
    hits: number
    misses: number
    evictedKeys: number
    totalConnections: number
  } | null
}

export type AdminStats = {
  users: {
    total: number
    active: number
    disabled: number
    admins: number
    newLast30d: number
    growth: { month: string; count: number }[]
  }
  storage: {
    usedBytes: number
    totalQuotaBytes: number
    trashedBytes: number
    trashedCount: number
    topStorage: {
      id: string
      name: string
      email: string
      avatarUrl: string | null
      usedBytes: number
      fileCount: number
      quotaBytes: number
    }[]
  }
  files: {
    total: number
    byType: Record<string, number>
    bytesByType: Record<string, number>
    largest: {
      id: string
      name: string
      mimeType: string
      size: number
      createdAt: string
      owner: { id: string; name: string; email: string } | null
    }[]
    duplicates: { name: string; size: number; count: number }[]
  }
  activity: {
    accesses7d: number
    accesses30d: number
    hourlyLast7d: number[]
    peakHour: number
    recent: {
      id: string
      action: string
      accessedAt: string
      fileName: string
      mimeType: string
      user: { name: string; email: string; avatarUrl: string | null }
    }[]
  }
  logins: {
    recent: {
      id: string
      ip: string | null
      userAgent: string | null
      createdAt: string
      user: { name: string; email: string; avatarUrl: string | null }
    }[]
  }
  sharing: {
    shortcuts: number
    filesInSpaces: number
    shareLinks: number
    spaces: number
  }
}

export type AdminUser = {
  id: string
  email: string
  name: string
  role: "USER" | "ADMIN"
  storageQuotaBytes: number
  usedBytes: number
  upgradeRequestedAt: string | null
  upgradeRequestedBytes: number | null
  disabledAt: string | null
  createdAt: string
  avatarUrl: string | null
}

export type Folder = {
  id: string
  name: string
  color: string | null
  ownerId: string
  parentId: string | null
  spaceId: string | null
  isHidden: boolean
  isTrashed: boolean
  isStarred: boolean
  createdAt: string
  updatedAt: string
}

export type FileItem = {
  id: string
  name: string
  ownerId: string
  folderId: string
  spaceId: string | null
  size: number
  mimeType: string
  storageKey: string
  isHidden: boolean
  isTrashed: boolean
  isStarred: boolean
  createdAt: string
  updatedAt: string
  // Present when the file is surfaced into the current folder via a shortcut.
  // The file's canonical home is still its own folder — this is just a link.
  isShortcut?: boolean
  shortcutId?: string
}

export type Breadcrumb = { id: string; name: string }

export type SpaceMember = {
  userId: string
  role: "VIEWER" | "EDITOR"
  name: string
  email: string
  avatarUrl?: string | null
}

export type Space = {
  id: string
  name: string
  rootFolderId: string
  ownerId: string
  isPublic: boolean
  createdAt: string
  members: SpaceMember[]
}

export type PublicSpace = {
  id: string
  name: string
  rootFolderId: string
  ownerId: string
  isPublic: boolean
  ownerName: string | null
  createdAt: string
}

export type Share = {
  id: string
  token: string
  resourceType: "FILE" | "FOLDER"
  permission: "VIEW" | "EDIT"
  fileId?: string | null
  folderId?: string | null
  expiresAt?: string | null
  createdAt: string
}
