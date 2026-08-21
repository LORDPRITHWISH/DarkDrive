// Run: npx tsx src/lib/treemap.test.ts
// The storage treemap is only honest if tile area tracks bytes and tiles never
// overlap or spill — none of which is visible from a screenshot.
import assert from "node:assert/strict"
import { buildFolderTree, squarify, squarifyNested } from "./treemap.ts"

const W = 800
const H = 450
const values = [900, 500, 400, 250, 120, 80, 40, 12, 5, 1]
const rects = squarify(
  values.map((value, i) => ({ value, data: `n${i}` })),
  W,
  H
)

assert.equal(rects.length, values.length)

const total = values.reduce((a, b) => a + b, 0)
for (const r of rects) {
  // Inside the box.
  assert.ok(r.x >= -1e-6 && r.y >= -1e-6, "origin inside")
  assert.ok(r.x + r.w <= W + 1e-6 && r.y + r.h <= H + 1e-6, "extent inside")
  // Area proportional to value.
  const expected = (r.value / total) * W * H
  assert.ok(Math.abs(r.w * r.h - expected) < 1e-6, `area of ${r.data}`)
}

// No two tiles overlap.
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i]!
    const b = rects[j]!
    const overlap =
      a.x < b.x + b.w - 1e-6 &&
      b.x < a.x + a.w - 1e-6 &&
      a.y < b.y + b.h - 1e-6 &&
      b.y < a.y + a.h - 1e-6
    assert.ok(!overlap, `${a.data} overlaps ${b.data}`)
  }
}

// Squarified means no absurd slivers for a sane spread of values.
const ratios = rects.map((r) => Math.max(r.w / r.h, r.h / r.w))
assert.ok(Math.max(...ratios) < 12, `worst aspect ratio ${Math.max(...ratios)}`)

// Degenerate inputs stay empty rather than emitting NaN geometry.
assert.deepEqual(squarify([{ value: 0, data: "z" }], W, H), [])
assert.deepEqual(squarify([{ value: 5, data: "z" }], 0, H), [])

console.log("treemap ok")

// --- folder rollup ---
const tree = buildFolderTree(
  [
    { id: "root", parentId: null },
    { id: "a", parentId: "root" },
    { id: "b", parentId: "root" },
    { id: "a1", parentId: "a" },
    { id: "orphan", parentId: "gone" }, // parent not in the set -> re-rooted
  ],
  [
    { folderId: "root", size: 10 },
    { folderId: "a", size: 100 },
    { folderId: "a1", size: 5 },
    { folderId: "a1", size: 5 },
    { folderId: "b", size: 1 },
    { folderId: "orphan", size: 7 },
    { folderId: "vanished", size: 3 }, // folder gone -> counted at the root
  ]
)

assert.equal(tree.size.get("a1"), 10)
assert.equal(tree.size.get("a"), 110, "subtree bytes include descendants")
assert.equal(tree.size.get("b"), 1)
assert.equal(tree.size.get("root"), 121)
assert.equal(tree.size.get("orphan"), 7)
// The virtual root is the whole drive: every byte lands in it exactly once.
assert.equal(tree.size.get(null), 131)
assert.equal(tree.count.get(null), 7)
assert.equal(tree.count.get("a"), 3)
assert.deepEqual(
  (tree.children.get(null) ?? []).map((f) => f.id),
  ["root", "orphan"]
)

// A cycle must not hang or double-count.
const cyclic = buildFolderTree(
  [
    { id: "x", parentId: "y" },
    { id: "y", parentId: "x" },
  ],
  [{ folderId: "x", size: 4 }]
)
assert.ok(Number.isFinite(cyclic.size.get("x")))

console.log("rollup ok")

// --- nested layout ---
const nested = squarifyNested(
  [
    {
      value: 300,
      data: "parent",
      children: [
        { value: 200, data: "child-big" },
        { value: 100, data: "child-small" },
      ],
    },
    { value: 100, data: "flat" },
    { value: 1, data: "crumb", children: [{ value: 1, data: "buried" }] },
  ],
  600,
  400
)

const at = (name: string) => nested.find((r) => r.data === name)
const parent = at("parent")!
assert.equal(parent.depth, 0)
assert.equal(parent.leaf, false, "a roomy parent nests")
assert.equal(at("flat")!.leaf, true, "no children -> leaf")
// A tile too small to hold children is drawn solid, and they aren't emitted.
assert.equal(at("crumb")!.leaf, true)
assert.equal(at("buried"), undefined)

for (const name of ["child-big", "child-small"]) {
  const c = at(name)!
  assert.equal(c.depth, 1)
  assert.ok(
    c.x >= parent.x - 1e-6 &&
      c.y >= parent.y - 1e-6 &&
      c.x + c.w <= parent.x + parent.w + 1e-6 &&
      c.y + c.h <= parent.y + parent.h + 1e-6,
    `${name} stays inside its parent`
  )
  assert.ok(c.y >= parent.y + 20 - 1e-6, `${name} clears the header strip`)
  assert.ok(
    c.x >= parent.x + 4 - 1e-6 &&
      c.x + c.w <= parent.x + parent.w - 4 + 1e-6 &&
      c.y + c.h <= parent.y + parent.h - 4 + 1e-6,
    `${name} keeps the frame visible on every side`
  )
}
// Paint order: a parent is emitted before the children drawn on top of it.
assert.ok(nested.indexOf(parent) < nested.indexOf(at("child-big")!))

console.log("nested ok")
