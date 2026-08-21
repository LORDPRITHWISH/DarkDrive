// The only genuinely tricky part of the sync loop: given three views of one
// path — what's on disk, what we last synced, and what the server says — what
// do we do? Kept pure and separate from all the I/O so it can be tested
// exhaustively (see decide.test.ts).
//
// The invariant every rule below serves: never destroy bytes the user has not
// synced. When in doubt, keep the local copy (or move it aside) and let the
// duplicate be the user's problem to resolve, not ours.

/** sha256 of the file currently on disk, or null if it isn't there. */
export type Local = string | null
/** sha256 we recorded the last time this path was in sync, if ever. */
export type Known = string | undefined
export type Remote = { sha: string | null; deleted: boolean }

export type PullAction =
  | "skip" // already matches, or nothing to do
  | "download" // take the server's copy
  | "conflict" // local has unsynced edits AND server moved: rename aside, then download
  | "delete-local" // server deleted it and our copy is untouched
  | "keep-local" // server deleted it but our copy has unsynced edits

export function decidePull(local: Local, known: Known, remote: Remote): PullAction {
  if (remote.deleted) {
    if (local === null) return "skip"
    return local === known ? "delete-local" : "keep-local"
  }
  if (local === null) {
    // Nothing here and nothing ever synced here: it's new on the server.
    if (known === undefined) return "download"
    // We had it and it's gone from disk — the user deleted or moved it and
    // push() hasn't reported that yet. Pull runs first, so without this the
    // server's copy would simply reappear and undo the deletion. The one
    // exception: if the server's content also moved on since we last synced,
    // that's an edit we have never seen, and getting it back beats honouring
    // a delete that was made against older bytes.
    return remote.sha !== null && remote.sha !== known ? "download" : "skip"
  }
  // A null remote sha means the file predates hashing — fall through to the
  // "did we touch it?" test rather than assuming a match.
  if (remote.sha !== null && local === remote.sha) return "skip"
  return local === known ? "download" : "conflict"
}

export type PushAction =
  | "skip"
  | "upload-new" // never synced, server has nothing at this path
  | "upload-replace" // we changed it; send with expectedSha256 = known
  | "trash-remote" // deleted locally, and it was in sync when it went

export function decidePush(local: Local, known: Known): PushAction {
  if (local === null) return known === undefined ? "skip" : "trash-remote"
  if (known === undefined) return "upload-new"
  return local === known ? "skip" : "upload-replace"
}
