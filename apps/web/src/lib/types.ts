export type User = {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  rootFolderId: string
}

export type Folder = {
  id: string
  name: string
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
}

export type Breadcrumb = { id: string; name: string }

export type SpaceMember = {
  userId: string
  role: "VIEWER" | "EDITOR" | "ADMIN"
  name: string
  email: string
  avatarUrl?: string | null
}

export type Space = {
  id: string
  name: string
  rootFolderId: string
  ownerId: string
  createdAt: string
  members: SpaceMember[]
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
