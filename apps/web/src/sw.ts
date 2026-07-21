/// <reference lib="webworker" />
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { SHARE_CACHE, shareKey } from "@/lib/shareInbox"

declare const self: ServiceWorkerGlobalScope

// Shell precache. API responses and file bytes are deliberately excluded —
// sessions are cookie-based and a stale listing would lie about what's in the
// drive. (Same rule the generated SW followed before we took it over.)
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener("install", () => void self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

// SPA fallback, which generateSW gave us for free before this file existed.
// /api is excluded (it's the backend, not a route) and so is the share target
// POST, which must reach the handler below rather than resolve to index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api/, /^\/share-target/],
  })
)

/**
 * Android share sheet handoff.
 *
 * A share_target with files must be declared `method: POST`, and a POST can't
 * be handled by a client route — the navigation never reaches React. So the SW
 * intercepts it, parks the files in a Cache (the only transport that holds
 * Blobs across a navigation without deserializing them into memory), and
 * redirects to a GET the app can actually render.
 */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const files = form.getAll("files").filter((f): f is File => f instanceof File)
        if (files.length) {
          const cache = await caches.open(SHARE_CACHE)
          // Names live in the URL, not a sidecar index: one cache entry per
          // file means a half-written batch can't desync from its metadata.
          await Promise.all(
            files.map((file, i) =>
              cache.put(
                shareKey(i, file.name),
                new Response(file, {
                  headers: { "content-type": file.type || "application/octet-stream" },
                })
              )
            )
          )
        }
      } catch {
        // Fall through to the redirect regardless — the page shows an empty
        // inbox, which beats the share sheet reporting a hard failure.
      }
      // Must be absolute: Response.redirect() rejects relative URLs.
      return Response.redirect(new URL("/share-target?shared=1", self.location.origin).href, 303)
    })()
  )
})
