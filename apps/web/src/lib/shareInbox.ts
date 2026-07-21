// Wire format for the Android share handoff. The SW writes these keys and the
// /share-target page reads them back; keeping both sides on one definition is
// the point of this file — the format lived in two places and drifting would
// have shown up as silently unnamed uploads.

export const SHARE_CACHE = "dd-share-inbox"

const PREFIX = "/__shared/"

/** Cache key for the i-th shared file. Index keeps duplicate names distinct. */
export const shareKey = (i: number, name: string) =>
  `${PREFIX}${i}-${encodeURIComponent(name)}`

/** Recover the original filename from a key produced by shareKey. */
export function nameFromShareKey(key: string): string {
  const path = key.startsWith(PREFIX) ? key : new URL(key).pathname
  return decodeURIComponent(path.slice(PREFIX.length).replace(/^\d+-/, ""))
}
