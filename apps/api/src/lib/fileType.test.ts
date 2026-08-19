// Run: npx tsx src/lib/fileType.test.ts
// Guards the .ts override: mime-types calls TypeScript sources MPEG transport
// streams, which sent every one of them through ffmpeg for a thumbnail.
import assert from "node:assert/strict"
import { fileCategory, resolveMime } from "./fileType.js"
import { thumbKind } from "./thumbnails.js"

// Override beats mime.lookup(), the browser's guess, and a bad stored value.
assert.equal(resolveMime("Quat.d.ts"), "text/plain")
assert.equal(resolveMime("main.mts", "video/mp2t"), "text/plain")
assert.equal(fileCategory("video/mp2t", "Quat.d.ts"), "doc")
assert.equal(thumbKind({ mimeType: "video/mp2t", name: "Quat.d.ts" }), null)

// Everything else still resolves normally.
assert.equal(resolveMime("clip.mp4"), "video/mp4")
assert.equal(resolveMime("photo.jpg"), "image/jpeg")
assert.equal(resolveMime("blob", ""), "application/octet-stream")
assert.equal(resolveMime("scan.pdf", "application/octet-stream"), "application/octet-stream")
assert.equal(thumbKind({ mimeType: "video/mp4", name: "clip.mp4" }), "video")
assert.equal(thumbKind({ mimeType: "application/octet-stream", name: "clip.mkv" }), "video")

console.log("fileType ok")
