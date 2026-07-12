# Header Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the notification bell out of the Sidebar (where it overflows/overlaps when collapsed) into a shared `HeaderActions` cluster rendered top-right in every page header, add an About-page icon link next to it, and point the sidebar logo at `/home` instead of `/landing`.

**Architecture:** One new presentational component, `apps/web/src/components/HeaderActions.tsx`, bundles an About icon-link and the existing `NotificationBell`. It gets dropped into the top-right of each of the 8 pages' existing `<header>` elements. `NotificationBell` loses its dead `collapsed` prop and its dropdown panel's anchor flips from `left-0` to `right-0` so it stays on screen at the far-right position. `Sidebar.tsx` stops rendering `NotificationBell` and repoints its logo link.

**Tech Stack:** React 19, TypeScript, react-router-dom v6, Tailwind CSS, @phosphor-icons/react. No test runner in this app — verification is `tsc --noEmit` (via `pnpm --filter web typecheck`) plus manual browser verification for the final task.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-header-actions-design.md`
- No changes to notification data/store logic, dropdown contents, or the `/landing` page itself.
- Do not consolidate the 8 pages' per-page `<header>` markup into one shared layout component — only the new right-aligned actions cluster (`HeaderActions`) is shared.
- Run `pnpm --filter web typecheck` after every task; it must pass with zero errors before moving on.

---

### Task 1: Simplify `NotificationBell` and fix dropdown anchor

**Files:**
- Modify: `apps/web/src/components/NotificationBell.tsx`

**Interfaces:**
- Consumes: nothing new (uses existing `useNotifications` store, unchanged).
- Produces: `NotificationBell()` — a component with **no props** (previously `{ collapsed }: { collapsed?: boolean }`). Callers must not pass a `collapsed` prop.

- [ ] **Step 1: Remove the dead `collapsed` prop and its no-op ternary**

In `apps/web/src/components/NotificationBell.tsx`, change:

```tsx
export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
```

to:

```tsx
export function NotificationBell() {
```

Then change:

```tsx
        className={`relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ${
          collapsed ? "" : ""
        }`}
```

to:

```tsx
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
```

- [ ] **Step 2: Flip the dropdown panel anchor from left to right**

In the same file, change:

```tsx
        <div className="bg-popover animate-in fade-in slide-in-from-top-1 absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-xl duration-150">
```

to:

```tsx
        <div className="bg-popover animate-in fade-in slide-in-from-top-1 absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-xl duration-150">
```

(This is needed because the bell moves to the top-right of every page header in later tasks; a `left-0`-anchored 320px panel would overflow off the right edge of the viewport from that position.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: FAILS with an error in `apps/web/src/components/Sidebar.tsx` about `collapsed` not existing on `NotificationBell`'s props. This is expected at this point — `Sidebar.tsx`'s stale call site (`<NotificationBell collapsed={collapsed} />`) is fixed in Task 2. Do not fix it here; proceed to commit.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/NotificationBell.tsx
git commit -m "$(cat <<'EOF'
Simplify NotificationBell props and fix dropdown anchor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update `Sidebar.tsx` — drop the bell, repoint the logo

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Sidebar()` no longer renders `NotificationBell`; its logo `Link` now points to `/home` with tooltip "Home".

- [ ] **Step 1: Remove the `NotificationBell` import**

Delete this line (around line 24):

```tsx
import { NotificationBell } from "@/components/NotificationBell"
```

- [ ] **Step 2: Remove the `NotificationBell` render**

Delete this line (around line 186, inside the header actions row):

```tsx
            <NotificationBell collapsed={collapsed} />
```

- [ ] **Step 3: Repoint the logo link to Home**

Change:

```tsx
          <Link
            to="/landing"
            className="hover:text-primary flex shrink-0 items-center gap-2 transition-colors"
            title="About DarkDrive"
          >
```

to:

```tsx
          <Link
            to="/home"
            className="hover:text-primary flex shrink-0 items-center gap-2 transition-colors"
            title="Home"
          >
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors (this resolves the Task 1 error about `collapsed` not existing on `NotificationBell`'s props).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
Remove notification bell from Sidebar, point logo to Home

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the `HeaderActions` component

**Files:**
- Create: `apps/web/src/components/HeaderActions.tsx`

**Interfaces:**
- Consumes: `NotificationBell()` (no props, from Task 1) from `@/components/NotificationBell`.
- Produces: `HeaderActions()` — a component with no props, rendering an About-page icon link followed by the notification bell, as a React fragment (no wrapping `<div>`, no margin). Callers are responsible for the surrounding flex container (see Tasks 4–5).

- [ ] **Step 1: Write the component**

```tsx
import { Link } from "react-router-dom"
import { InfoIcon } from "@phosphor-icons/react"
import { NotificationBell } from "@/components/NotificationBell"

export function HeaderActions() {
  return (
    <>
      <Link
        to="/landing"
        title="About DarkDrive"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <InfoIcon size={16} />
      </Link>
      <NotificationBell />
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/HeaderActions.tsx
git commit -m "$(cat <<'EOF'
Add HeaderActions component (About link + notification bell)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `HeaderActions` to headers with no existing right-side div (Home, Space)

**Files:**
- Modify: `apps/web/src/pages/Home.tsx`
- Modify: `apps/web/src/pages/Space.tsx`

**Interfaces:**
- Consumes: `HeaderActions()` (no props, from Task 3) from `@/components/HeaderActions`.
- Produces: both headers now render a right-aligned `HeaderActions` cluster.

- [ ] **Step 1: `Home.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 2: `Home.tsx` — add the right-side actions div to the header**

Change:

```tsx
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="text-sm font-semibold">Home</div>
        </header>
```

to:

```tsx
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="text-sm font-semibold">Home</div>
          <div className="ml-auto flex items-center gap-1">
            <HeaderActions />
          </div>
        </header>
```

- [ ] **Step 3: `Space.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 4: `Space.tsx` — add the right-side actions div to the header**

Change:

```tsx
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="truncate text-sm font-semibold">
            {data?.space.name ?? "Space"}
          </div>
        </header>
```

to:

```tsx
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarToggle />
          <div className="truncate text-sm font-semibold">
            {data?.space.name ?? "Space"}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <HeaderActions />
          </div>
        </header>
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Home.tsx apps/web/src/pages/Space.tsx
git commit -m "$(cat <<'EOF'
Add HeaderActions (About link + notification bell) to Home and Space headers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add `HeaderActions` to headers that already have a right-side div (Admin, Drive, Search, Recent, Starred, Bin)

**Files:**
- Modify: `apps/web/src/pages/Admin.tsx`
- Modify: `apps/web/src/pages/Drive.tsx`
- Modify: `apps/web/src/pages/Search.tsx`
- Modify: `apps/web/src/pages/Recent.tsx`
- Modify: `apps/web/src/pages/Starred.tsx`
- Modify: `apps/web/src/pages/Bin.tsx`

**Interfaces:**
- Consumes: `HeaderActions()` (no props, from Task 3) from `@/components/HeaderActions`.
- Produces: each page's existing right-side header div now ends with a `HeaderActions` cluster, so it renders at the far right of the header.

- [ ] **Step 1: `Admin.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 2: `Admin.tsx` — append `HeaderActions` to the right-side div**

Change:

```tsx
          {stats && (
            <div className="hidden text-muted-foreground text-xs md:block">
              {stats.sharing.spaces} spaces · {stats.sharing.shareLinks} share links ·{" "}
              {stats.sharing.filesInSpaces} shared files ·{" "}
              {stats.sharing.shortcuts} shortcuts
            </div>
          )}
        </header>
```

to:

```tsx
          {stats && (
            <div className="hidden text-muted-foreground text-xs md:block">
              {stats.sharing.spaces} spaces · {stats.sharing.shareLinks} share links ·{" "}
              {stats.sharing.filesInSpaces} shared files ·{" "}
              {stats.sharing.shortcuts} shortcuts
            </div>
          )}
          <div className="flex items-center gap-1">
            <HeaderActions />
          </div>
        </header>
```

Note this Admin header's outer container is `justify-between` with two top-level children so far (`<div className="flex items-center gap-3">...</div>` and the conditional `stats` block). Wrap the new actions in their own `<div className="flex items-center gap-1">` (as above) so it becomes the third flex child and lands at the far right regardless of whether the `stats` block renders.

- [ ] **Step 3: `Drive.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 4: `Drive.tsx` — append `HeaderActions` inside the existing right-side div**

Change the closing of the right-side div (currently ending after the zoom controls block):

```tsx
                <span className="text-muted-foreground w-[3.5ch] text-right text-xs leading-none tabular-nums">
                  {zoom}%
                </span>
              </div>
            )}
          </div>
        </header>
```

to:

```tsx
                <span className="text-muted-foreground w-[3.5ch] text-right text-xs leading-none tabular-nums">
                  {zoom}%
                </span>
              </div>
            )}
            <HeaderActions />
          </div>
        </header>
```

- [ ] **Step 5: `Search.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 6: `Search.tsx` — append `HeaderActions` to the right-side div**

Change:

```tsx
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
          </div>
        </header>
```

to:

```tsx
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
            <HeaderActions />
          </div>
        </header>
```

(This grid-view button block is unique in `Search.tsx` — it's immediately followed by the closing `</div>` and `</header>` tags.)

- [ ] **Step 7: `Recent.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 8: `Recent.tsx` — append `HeaderActions` to the right-side div**

Change:

```tsx
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
          </div>
        </header>
```

to:

```tsx
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
            <HeaderActions />
          </div>
        </header>
```

- [ ] **Step 9: `Starred.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 10: `Starred.tsx` — append `HeaderActions` to the right-side div**

Change:

```tsx
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
          </div>
        </header>
```

to:

```tsx
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
              title="Grid view"
            >
              <SquaresFourIcon size={16} />
            </Button>
            <HeaderActions />
          </div>
        </header>
```

- [ ] **Step 11: `Bin.tsx` — add the import**

Change:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
```

to:

```tsx
import { Sidebar } from "@/components/Sidebar"
import { SidebarToggle } from "@/components/SidebarToggle"
import { HeaderActions } from "@/components/HeaderActions"
```

- [ ] **Step 12: `Bin.tsx` — append `HeaderActions` to the right-side div**

Change:

```tsx
            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              onClick={() => setView("list")}
              title="List view"
            >
              <ListBulletsIcon size={16} />
            </Button>
          </div>
        </header>
```

to:

```tsx
            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              onClick={() => setView("list")}
              title="List view"
            >
              <ListBulletsIcon size={16} />
            </Button>
            <HeaderActions />
          </div>
        </header>
```

- [ ] **Step 13: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/pages/Admin.tsx apps/web/src/pages/Drive.tsx apps/web/src/pages/Search.tsx apps/web/src/pages/Recent.tsx apps/web/src/pages/Starred.tsx apps/web/src/pages/Bin.tsx
git commit -m "$(cat <<'EOF'
Add HeaderActions to Admin, Drive, Search, Recent, Starred, and Bin headers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Manual verification in the browser

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server**

Run: `pnpm --filter web dev` (leave running; note the printed local URL, typically `http://localhost:5173`)

- [ ] **Step 2: Log in and check the Home page header**

Navigate to the app, log in, land on `/home`. Confirm:
- An info icon and the notification bell appear at the top-right of the header, next to the "Home" label.
- Hovering the info icon shows the tooltip "About DarkDrive"; clicking it navigates to `/landing`.
- Clicking the bell opens its dropdown anchored to the right (panel stays fully on screen, doesn't overflow past the browser's right edge).

- [ ] **Step 3: Check the collapsed sidebar no longer overflows**

Click the sidebar collapse toggle (desktop width). Confirm:
- The collapsed sidebar's icon column no longer contains the notification bell (only logo + upload icon + nav icons).
- No icon overlaps or bleeds into the main content area.

- [ ] **Step 4: Check the logo link**

While on any page other than `/home` (e.g. `/drive/<id>`), click the DarkDrive logo in the sidebar. Confirm it navigates to `/home` (not `/landing`), and its tooltip now reads "Home".

- [ ] **Step 5: Spot-check two more pages**

Visit `/admin` (if the logged-in user has the ADMIN role) and `/bin`. Confirm both headers show the info icon + bell at the top-right, positioned after any existing header buttons (view toggles, "Empty bin", etc.), and the bell's dropdown still opens without overflowing.

- [ ] **Step 6: Stop the dev server**

Stop the process started in Step 1.

No commit for this task — it's verification only.
