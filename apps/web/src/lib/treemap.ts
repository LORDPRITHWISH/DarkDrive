// Squarified treemap layout (Bruls, Huizing & van Wijk 2000): lays weighted
// items into a rectangle, favouring near-square tiles over the long slivers a
// naive slice-and-dice produces. Pure geometry — the caller renders the rects.

export type TreemapItem<T> = { value: number; data: T }
export type TreemapRect<T> = TreemapItem<T> & {
  x: number
  y: number
  w: number
  h: number
}

// Aspect ratio of the worst tile in a row of `sum` area laid along `side`.
function worst(sum: number, min: number, max: number, side: number): number {
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

export function squarify<T>(
  items: TreemapItem<T>[],
  width: number,
  height: number
): TreemapRect<T>[] {
  const out: TreemapRect<T>[] = []
  if (width <= 0 || height <= 0) return out
  const nodes = items.filter((n) => n.value > 0).sort((a, b) => b.value - a.value)
  const total = nodes.reduce((s, n) => s + n.value, 0)
  if (total <= 0) return out
  const scale = (width * height) / total

  let x = 0
  let y = 0
  let w = width
  let h = height
  let i = 0
  while (i < nodes.length) {
    const side = Math.min(w, h)
    // Grow the row while it keeps the worst aspect ratio improving.
    let sum = 0
    let min = Infinity
    let max = 0
    let best = Infinity
    let end = i
    while (end < nodes.length) {
      const area = nodes[end]!.value * scale
      const nextSum = sum + area
      const nextMin = Math.min(min, area)
      const nextMax = Math.max(max, area)
      const ratio = worst(nextSum, nextMin, nextMax, side)
      if (end > i && ratio > best) break
      sum = nextSum
      min = nextMin
      max = nextMax
      best = ratio
      end++
    }

    const thick = sum / side
    let off = 0
    for (let k = i; k < end; k++) {
      const node = nodes[k]!
      const len = (node.value * scale) / thick
      out.push(
        w >= h
          ? { ...node, x, y: y + off, w: thick, h: len }
          : { ...node, x: x + off, y, w: len, h: thick }
      )
      off += len
    }
    if (w >= h) {
      x += thick
      w -= thick
    } else {
      y += thick
      h -= thick
    }
    i = end
  }
  return out
}

type TreeFolder = { id: string; parentId: string | null }
type TreeFile = { folderId: string; size: number }

// Rolls file sizes up a folder tree: `size`/`count` for a folder cover its
// whole subtree, keyed by folder id (null = the virtual root holding top-level
// folders and any file whose folder isn't in the set). Folders whose parent is
// missing are re-rooted so nothing is dropped from the totals.
export function buildFolderTree<F extends TreeFolder, I extends TreeFile>(
  folders: F[],
  files: I[]
) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const children = new Map<string | null, F[]>()
  for (const f of folders) {
    const parent = f.parentId && byId.has(f.parentId) ? f.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), f])
  }
  const filesIn = new Map<string | null, I[]>()
  for (const f of files) {
    const key = byId.has(f.folderId) ? f.folderId : null
    filesIn.set(key, [...(filesIn.get(key) ?? []), f])
  }

  const size = new Map<string | null, number>()
  const count = new Map<string | null, number>()
  function roll(id: string | null): void {
    if (size.has(id)) return
    size.set(id, 0) // in place before recursing: a malformed cycle stops here
    count.set(id, 0)
    const own = filesIn.get(id) ?? []
    let bytes = own.reduce((s, f) => s + f.size, 0)
    let n = own.length
    for (const child of children.get(id) ?? []) {
      roll(child.id)
      bytes += size.get(child.id) ?? 0
      n += count.get(child.id) ?? 0
    }
    size.set(id, bytes)
    count.set(id, n)
  }
  roll(null)
  for (const f of folders) roll(f.id) // unreachable branches still get totals

  return { byId, children, filesIn, size, count }
}

export type NestedNode<T> = { value: number; data: T; children?: NestedNode<T>[] }
export type NestedRect<T> = TreemapRect<T> & { depth: number; leaf: boolean }

// Treemap-of-treemaps: each node is squarified in its parent's rect, inset to
// leave room for the parent's header label. Recursion stops where a tile is too
// small to hold readable children (or at maxDepth), and that tile is flagged
// `leaf` — the caller draws it solid instead of as a container. Rects come out
// in paint order, parents before their children.
export function squarifyNested<T>(
  nodes: NestedNode<T>[],
  width: number,
  height: number,
  opts: { header?: number; pad?: number; minSide?: number; maxDepth?: number } = {}
): NestedRect<T>[] {
  const { header = 20, pad = 4, minSide = 54, maxDepth = 6 } = opts
  const out: NestedRect<T>[] = []

  function walk(
    items: NestedNode<T>[],
    ox: number,
    oy: number,
    w: number,
    h: number,
    depth: number
  ) {
    for (const r of squarify(
      items.map((n) => ({ value: n.value, data: n })),
      w,
      h
    )) {
      const node = r.data
      const x = ox + r.x
      const y = oy + r.y
      const innerW = r.w - 2 * pad
      const innerH = r.h - header - pad
      const nest =
        !!node.children?.length &&
        depth < maxDepth &&
        innerW >= minSide &&
        innerH >= minSide
      out.push({ x, y, w: r.w, h: r.h, value: node.value, data: node.data, depth, leaf: !nest })
      if (nest) walk(node.children!, x + pad, y + header, innerW, innerH, depth + 1)
    }
  }

  walk(nodes, 0, 0, width, height, 0)
  return out
}
