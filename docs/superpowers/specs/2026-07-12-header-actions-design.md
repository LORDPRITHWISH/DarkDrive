# Header actions: fix notification bell placement, add About link, logo → Home

## Problem

`NotificationBell` currently renders inside `Sidebar.tsx`'s collapsed icon rail
(56px wide), next to the Upload button. It has to squeeze into that narrow
column, so it visually overflows and collides with the main content header —
this is the "broken" icon in the reported screenshots. Its dropdown panel is
also anchored `left-0`, which assumes it opens near the left edge of the
screen.

Separately, the sidebar logo currently links to `/landing` (the About page)
with the tooltip "About DarkDrive". The user wants the logo to go Home instead,
and the About page to be reachable from a dedicated link.

## Design

1. **New component** `apps/web/src/components/HeaderActions.tsx`: renders an
   About icon-button (`InfoIcon` → `Link to="/landing"`, tooltip "About
   DarkDrive") followed by `<NotificationBell />`. No outer wrapper margin —
   callers control placement.
2. **`Sidebar.tsx`**: remove the `<NotificationBell collapsed={collapsed} />`
   render entirely. Change the logo `Link` `to="/landing"` → `to="/home"`,
   tooltip "About DarkDrive" → "Home".
3. **`NotificationBell.tsx`**: drop the unused `collapsed` prop (it was already
   a no-op — `collapsed ? "" : ""`). Change the dropdown panel anchor from
   `absolute left-0 top-full` to `absolute right-0 top-full` so it opens
   leftward and stays on screen when the bell sits at the far right of the
   header.
4. **All 8 page headers** (`Home.tsx`, `Admin.tsx`, `Drive.tsx`, `Search.tsx`,
   `Recent.tsx`, `Starred.tsx`, `Bin.tsx`, `Space.tsx`): add `<HeaderActions />`
   to the top-right of the existing `<header>`.
   - `Admin.tsx`, `Drive.tsx`, `Search.tsx`, `Recent.tsx`, `Starred.tsx`,
     `Bin.tsx` already have a right-side `flex items-center gap-*` div —
     append `<HeaderActions />` as its last child.
   - `Home.tsx` and `Space.tsx` have no right-side div — add
     `<div className="ml-auto flex items-center gap-1"><HeaderActions /></div>`
     inside the `<header>`.

## Out of scope

- No change to notification data/store logic, dropdown contents, or the About
  (`/landing`) page itself.
- No consolidation of the 8 pages' per-page `<header>` markup into one shared
  layout component — only the new right-aligned actions cluster is shared.
