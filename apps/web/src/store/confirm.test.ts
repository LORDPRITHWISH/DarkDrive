// Run: node --experimental-strip-types src/store/confirm.test.ts
// Guards the promise wiring: a confirm that never resolves silently swallows
// deletes, and a superseded one that resolves true deletes without a click.
import assert from "node:assert/strict"
import { confirmDialog, useConfirm } from "./confirm.ts"

// Cancel resolves false, confirm resolves true.
for (const answer of [false, true]) {
  const p = confirmDialog({ title: "Delete forever?" })
  useConfirm.getState().close(answer)
  assert.equal(await p, answer)
  assert.equal(useConfirm.getState().pending, null)
}

// A second prompt supersedes the first, which must read as cancel.
const first = confirmDialog({ title: "first" })
const second = confirmDialog({ title: "second" })
assert.equal(await first, false)
useConfirm.getState().close(true)
assert.equal(await second, true)

// close() with nothing pending is a no-op, not a crash.
useConfirm.getState().close(true)

console.log("ok")
