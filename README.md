# DarkDrive

Self-hosted Drive clone — folders, files, sharing, collaborative spaces.

- **Frontend** (`apps/web`) — Vite + React 19 + Tailwind 4 + shadcn/ui + **Zustand** + React Router + Socket.IO client
- **Backend** (`apps/api`) — Express + TypeScript, Prisma (**Postgres**), **Redis** sessions, **Google OAuth** via Passport, Socket.IO for realtime collab, local disk storage with sharded keys
- **Shared UI** (`packages/ui`) — shadcn components

> Proof of concept. Files are stored on the server's local disk (cheap on a 1 TB VPS). Not hardened for public untrusted sharing at scale — acknowledged.

## Features

- Google OAuth sign-in (sessions backed by Redis)
- Linux-style filesystem tree: nested folders, files, rename, move, star, hide/show, trash & restore, permanent delete
- Multi-file drag-and-drop upload with progress toasts
- Grid and list views, inline rename, breadcrumbs
- Shareable links per file/folder with permission, expiry, optional password
- **Collaborative Spaces**: create a space, invite members by email (VIEWER/EDITOR/ADMIN), shared folder tree inside, realtime presence + filesystem change broadcasts over Socket.IO

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Backend env

```bash
cp apps/api/.env.example apps/api/.env
# then edit:
# - DATABASE_URL  (your Postgres on VPS)
# - REDIS_URL     (your Redis on VPS)
# - SESSION_SECRET
# - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
#     Create OAuth client at https://console.cloud.google.com/apis/credentials
#     Authorized redirect URI: http://localhost:4000/api/auth/google/callback
```

### 3. DB

```bash
cd apps/api
pnpm db:push     # creates tables from prisma/schema.prisma
pnpm db:generate # regen client
```

### 4. Run

Two terminals (or `pnpm dev` from root — turbo runs both):

```bash
# terminal 1
pnpm --filter api dev      # http://localhost:4000

# terminal 2
pnpm --filter web dev      # http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to the API.

## Key endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET`  | `/api/auth/google` → `/callback` | OAuth flow |
| `GET`  | `/api/auth/me` | current user |
| `POST` | `/api/auth/logout` | |
| `GET`  | `/api/folders/:id/contents` | `?includeHidden=1&includeTrashed=1` |
| `POST` | `/api/folders` | `{ name, parentId }` |
| `PATCH`| `/api/folders/:id` | rename / move / hide / trash / star |
| `DELETE`| `/api/folders/:id` | permanent delete |
| `POST` | `/api/files/upload` | multipart, field `files[]`, body `folderId` |
| `GET`  | `/api/files/:id/download` | `?inline=1` |
| `PATCH`| `/api/files/:id` | rename / move / hide / trash / star |
| `DELETE`| `/api/files/:id` | permanent delete |
| `POST` | `/api/shares` | create link |
| `POST` | `/api/shares/resolve/:token` | public resolve (password body optional) |
| `GET`  | `/api/shares/:token/download[/:fileId]` | public download |
| `GET/POST/DELETE` | `/api/spaces` | create / list / delete |
| `POST/DELETE` | `/api/spaces/:id/members[/:userId]` | add / remove |

## Socket.IO events

Join space: `space:join(spaceId, ack)` · leave: `space:leave(spaceId)`
Broadcast: `space:cursor({ spaceId, payload })`, `space:fs({ spaceId, event })`
Presence: `presence:join`, `presence:leave`

## Zustand stores

- `useAuth` — current user, fetchMe, logout
- `useDrive` — current folder contents, uploads, CRUD actions, spaces

## Storage layout

Uploads are placed under `apps/api/storage/<2-char-shard>/<nanoid><ext>`. The DB `File.storageKey` is the relative path. Deleting a DB record unlinks the on-disk file.
