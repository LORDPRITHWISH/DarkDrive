import assert from "node:assert/strict"
import { decidePull, decidePush } from "./decide.js"

const A = "a".repeat(64) // "the version we last synced"
const B = "b".repeat(64) // "the server's newer version"
const C = "c".repeat(64) // "an unsynced local edit"

// --- pull ---------------------------------------------------------------
// Untouched locally, server moved on: just take it.
assert.equal(decidePull(A, A, { sha: B, deleted: false }), "download")
// Nothing local yet.
assert.equal(decidePull(null, undefined, { sha: B, deleted: false }), "download")
// Deleted (or moved) locally and not yet pushed. Pull runs before push, so
// answering "download" here would silently undo every local deletion.
assert.equal(decidePull(null, A, { sha: A, deleted: false }), "skip")
// ...unless the server also changed since we last synced: that edit has never
// been on this machine, so it wins over a delete made against older bytes.
assert.equal(decidePull(null, A, { sha: B, deleted: false }), "download")
// Already identical — don't re-transfer.
assert.equal(decidePull(B, A, { sha: B, deleted: false }), "skip")
// Both sides changed since the last sync. This is the case that loses data if
// it's got wrong.
assert.equal(decidePull(C, A, { sha: B, deleted: false }), "conflict")
// A local file we've never synced, sitting where the server has something
// else — same danger, same answer. This is the first-run collision.
assert.equal(decidePull(C, undefined, { sha: B, deleted: false }), "conflict")
// Server has no hash (uploaded before hashing existed): still must not
// clobber an unsynced local edit.
assert.equal(decidePull(C, A, { sha: null, deleted: false }), "conflict")
assert.equal(decidePull(A, A, { sha: null, deleted: false }), "download")

// --- pull, deletions ----------------------------------------------------
assert.equal(decidePull(A, A, { sha: null, deleted: true }), "delete-local")
assert.equal(decidePull(C, A, { sha: null, deleted: true }), "keep-local")
assert.equal(decidePull(C, undefined, { sha: null, deleted: true }), "keep-local")
assert.equal(decidePull(null, A, { sha: null, deleted: true }), "skip")

// --- push ---------------------------------------------------------------
assert.equal(decidePush(A, undefined), "upload-new")
assert.equal(decidePush(B, A), "upload-replace")
assert.equal(decidePush(A, A), "skip")
assert.equal(decidePush(null, A), "trash-remote")
// Never synced, never existed — nothing to report.
assert.equal(decidePush(null, undefined), "skip")

console.log("decide: all assertions passed")
