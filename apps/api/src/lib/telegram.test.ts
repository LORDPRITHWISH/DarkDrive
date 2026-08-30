// Run: npx tsx src/lib/telegram.test.ts
// Guards the media-name/mime fallback used by the Telegram import — a break
// here means imported photos/videos land unnamed or misnamed.
import assert from "node:assert/strict"
import { resolveMediaMeta } from "./telegram.js"

assert.deepEqual(resolveMediaMeta({ id: 42, photo: {} }), {
  name: "telegram-42.jpg",
  mimeType: "image/jpeg",
})

assert.deepEqual(
  resolveMediaMeta({
    id: 7,
    video: { mimeType: "video/mp4", attributes: [{ fileName: "clip.mp4" }] },
  }),
  { name: "clip.mp4", mimeType: "video/mp4" }
)

// No filename attribute (common for self-destructing/forwarded video) — falls
// back to an id-based name with an extension guessed from the mime type.
assert.deepEqual(resolveMediaMeta({ id: 9, video: { mimeType: "video/mp4" } }), {
  name: "telegram-9.mp4",
  mimeType: "video/mp4",
})

// A large video sent with "send as file": Telegram strips
// DocumentAttributeVideo, so `video` is undefined and only the raw document
// is left. This is how multi-GB videos are normally uploaded — dropping it
// would silently skip exactly the files the import exists for.
assert.deepEqual(
  resolveMediaMeta({
    id: 11,
    document: { mimeType: "video/x-matroska", attributes: [{ fileName: "movie.mkv" }] },
  }),
  { name: "movie.mkv", mimeType: "video/x-matroska" }
)

// Same, with no filename attribute — extension comes from the mime type.
assert.deepEqual(resolveMediaMeta({ id: 12, document: { mimeType: "video/mp4" } }), {
  name: "telegram-12.mp4",
  mimeType: "video/mp4",
})

// Non-media documents must NOT be swept in by that same branch.
assert.equal(
  resolveMediaMeta({ id: 13, document: { mimeType: "application/pdf", attributes: [{ fileName: "a.pdf" }] } }),
  null
)
assert.equal(resolveMediaMeta({ id: 14, document: { mimeType: "audio/mpeg" } }), null)

// Neither photo nor video (voice note, sticker, plain document, ...) — the
// import skips these, so this must come back null rather than guessing.
assert.equal(resolveMediaMeta({ id: 1 }), null)

console.log("ok")
// telegram.ts's module graph pulls in the always-on Redis connections used
// for sessions (see db/redis.ts's lazyConnect: false) — harmless in the
// running server, but it leaves this one-off script's process hanging.
process.exit(0)
