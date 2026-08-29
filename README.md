# DarkDrive

Self-hosted Drive clone — folders, files, sharing, collaborative spaces.

- **Frontend** (`apps/web`) — Vite + React 19 + Tailwind 4 + shadcn/ui + **Zustand** + React Router + Socket.IO client
- **Backend** (`apps/api`) — Express + TypeScript, Prisma (**Postgres**), **Redis** sessions, **Google OAuth** via Passport, Socket.IO for realtime collab, local disk storage with sharded keys
- **DarkGallery web** (`apps/gallery`) — separate Vite + React app, its own look, same account and storage
- **DarkGallery mobile** (`apps/gallery-mobile`) — Expo app that backs up the camera roll
- **Desktop sync** (`apps/sync`) — zero-dependency Node daemon, two-way folder sync
- **Mobile** (`apps/mobile`) — Expo / React Native app, same sync engine
- **Sync core** (`packages/sync-core`) — the conflict rules both clients share
- **Shared UI** (`packages/ui`) — shadcn components

> Proof of concept. Files are stored on the server's local disk (cheap on a 1 TB VPS). Not hardened for public untrusted sharing at scale — acknowledged.

## Features

- Google OAuth sign-in (sessions backed by Redis)
- Linux-style filesystem tree: nested folders, files, rename, move, star, hide/show, trash & restore, permanent delete
- Multi-file drag-and-drop upload with progress toasts
- Grid and list views, inline rename, breadcrumbs
- Shareable links per file/folder with permission, expiry, optional password
- **Collaborative Spaces**: create a space, invite members by email (VIEWER/EDITOR/ADMIN), shared folder tree inside, realtime presence + filesystem change broadcasts over Socket.IO

## DarkGallery

Google Photos to DarkDrive's Google Drive. A separate frontend (web + mobile),
but not a separate product: every photo is an ordinary DarkDrive `File` owned
by the same user, so **it draws on the same storage quota**. The only
difference is where it lives — a second root folder, `My Photos`, sitting
beside `My Drive` rather than inside it. Nothing in the gallery shows up in
the drive's folder tree, and the desktop/mobile folder sync ignores it, so
pairing a laptop doesn't drag the camera roll onto its disk.

What it does: capture-date timeline grouped by month, albums, favorites,
bin, drag-and-drop upload, full-screen viewer with keyboard navigation, and
phone camera-roll backup with de-duplication.

**Albums are folders.** An album is a `Folder` under the photos root, and
membership is a `FileShortcut` into it — the same mechanism that surfaces a
file inside a shared space. So a photo lives in exactly one place, sits in as
many albums as you like, and album sharing is the folder sharing that already
exists.

**Capture dates.** The API reads `DateTimeOriginal` out of a JPEG's EXIF at
upload (`apps/api/src/lib/exif.ts` — no exiftool needed). For HEIC and video it
falls back to the date the client supplied; the mobile app reads that from the
device's media library, which knows it exactly. Failing both, upload time.
Times are stored and rendered as the wall clock the camera recorded, so a photo
always lands on the day it was taken regardless of where it's viewed.

### Run it

```bash
# apps/api/.env — the gallery is a separate origin, so it needs trusting
GALLERY_URL=http://localhost:4300

# adds User.photosRootFolderId + File.takenAt. Both columns are new and
# nullable, so Prisma's "might be data loss" warning about the unique index
# is spurious — existing rows are all NULL, and NULLs don't collide.
cd apps/api && npx prisma db push --accept-data-loss
pnpm --filter gallery dev     # http://localhost:4300
pnpm --filter gallery-mobile dev
```

Sign-in is the same Google account as DarkDrive — `/api/auth/google?return=<origin>`
sends the user back to whichever frontend they started from, validated against
the same allowlist that bounds CORS.

The mobile app pairs with a device token from `/api/devices/pair`, exactly like
the DarkDrive app; a token minted for either works for both. Backup is one-way
and additive: nothing on the phone is ever deleted or modified. Each asset is
hashed once and checked against the server before uploading, so a reinstall or a
second phone holding the same photos re-uploads nothing. Background scheduling
is a hint on both platforms, so it also backs up on every foreground.

### Gallery endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET`  | `/api/gallery/timeline` | `?filter=all\|favorites\|trash&offset=&limit=` — also returns `photosRootId` |
| `POST` | `/api/gallery/have` | `{ sha256[] }` → which are already backed up |
| `GET/POST` | `/api/gallery/albums` | list (with covers + counts) / create |
| `GET/PATCH/DELETE` | `/api/gallery/albums/:id` | contents / rename / delete |
| `POST/DELETE` | `/api/gallery/albums/:id/items` | `{ fileIds }` add / remove |
| `PATCH` | `/api/gallery/items` | `{ ids, isStarred?, isTrashed? }` bulk edit |

Uploads reuse `/api/files/upload/*` with `folderId` = the photos root (plus an
optional `takenAt`), and single-item edits reuse `PATCH /api/files/:id`.

## Setup

### 1. Install

```bash
pnpm install
```

Thumbnails shell out to system binaries — optional, but without them every
preview falls back to a file-type icon:

```bash
sudo apt install imagemagick ffmpeg poppler-utils libreoffice
```

| Tool | Package | Covers |
|---|---|---|
| `convert` | imagemagick | images |
| `ffmpeg` + `ffprobe` | ffmpeg | video posters, seek-bar storyboards |
| `pdftoppm` | poppler-utils | PDFs |
| `libreoffice` | libreoffice | doc/xls/ppt/odf (converted to PDF first) |

Admin → Thumbnails lists which are missing. After installing, hit **Generate
missing thumbnails** there — the backfill retries previously-failed files.

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
| `GET`  | `/api/devices/pair` | HTML page to mint a device token |
| `GET/POST/DELETE` | `/api/devices[/:id]` | list / create / revoke device tokens |
| `GET`  | `/api/sync/changes` | `?since=<ISO>` — delta feed for sync clients |
| `POST` | `/api/sync/folder` | `{ path }` → folder id, creating missing segments |

## Folder sync (`apps/sync`)

Two-way sync between a local folder and your DarkDrive, Dropbox-style. No
dependencies — Node 20+ only.

```bash
# 1. mint a token in a browser you're already signed into
open http://localhost:4400/api/devices/pair

# 2. point the daemon at a folder (settings are saved to ~/.darkdrive)
pnpm --filter sync dev -- --token=dd_... --dir=~/DarkDrive --api=http://localhost:4400

# later runs need no flags; --once reconciles a single time and exits (cron/systemd)
pnpm --filter sync dev
```

How it works: every mutation already bumps `updatedAt`, so `/api/sync/changes`
serves as the delta feed with no change journal. `File.sha256` (computed while
the upload is assembled) decides what actually changed, so a folder rename
becomes a metadata `PATCH` rather than a re-upload. Uploads reuse the existing
chunked endpoints.

**Conflicts never lose bytes.** If two devices edit the same file, the loser is
kept as `name (conflict from <device> <time>).ext` and both end up on every
device. `/api/files/upload/init` takes an `expectedSha256` and answers `409` if
the server moved on underneath, which is what triggers it.

Environment: `DD_HOME` relocates the config/state dir (run several syncs on one
machine), `DD_POLL_MS` changes the 5s poll interval.

## Mobile (`apps/mobile`)

Expo app that syncs the **DarkDrive** folder inside the app's own storage. On
iOS that folder is exposed to Files.app (`UIFileSharingEnabled` +
`LSSupportsOpeningDocumentsInPlace`); on Android it shows up in the file
browser. Drop a file in from either and it lands on every device.

```bash
pnpm --filter mobile dev          # Expo dev server
pnpm --filter mobile android      # or ios — needs a native build, not Expo Go
```

Pair by opening `/api/devices/pair` from the app and pasting the token back.

**Background sync is a hint, not a guarantee.** `expo-background-task` maps to
WorkManager on Android and BGTaskScheduler on iOS, and both decide the real
cadence themselves — iOS may run it rarely or not at all while the app goes
unused. The app therefore also syncs on every foreground, which is what makes
it feel current when opened. Syncing an *arbitrary* folder outside the app is
possible on Android (SAF) and impossible on iOS; that's a platform limit, not a
missing feature.

The conflict rules live in `packages/sync-core` and are shared verbatim with
the desktop daemon, so the two clients can't drift on the one decision that can
lose data. Everything else (filesystem, chunking) is per-platform: Node streams
on desktop, `File`/`FileHandle` on mobile.

## Socket.IO events

Join space: `space:join(spaceId, ack)` · leave: `space:leave(spaceId)`
Broadcast: `space:cursor({ spaceId, payload })`, `space:fs({ spaceId, event })`
Presence: `presence:join`, `presence:leave`

## Zustand stores

- `useAuth` — current user, fetchMe, logout
- `useDrive` — current folder contents, uploads, CRUD actions, spaces

## Storage layout

Uploads are placed under `apps/api/storage/<2-char-shard>/<nanoid><ext>`. The DB `File.storageKey` is the relative path. Deleting a DB record unlinks the on-disk file.
