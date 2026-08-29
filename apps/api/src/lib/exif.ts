import fs from "node:fs"

// Capture date out of a JPEG's EXIF block — the one piece of photo metadata
// the gallery timeline can't work without. Shelling out to exiftool isn't an
// option (the deploy box has none of the media binaries the thumbnail pipeline
// wants either), and a full EXIF library is a lot of dependency for one tag.
//
// ponytail: JPEG only, and only the date. HEIC/video capture times come from
// the client's own hint — mobile's media library knows them exactly — with
// upload time as the last fallback. Parse those containers here if that stops
// being enough.

// EXIF lives in the first APP1 segment, right after SOI. 64 KiB covers it with
// room to spare even when a thumbnail-carrying APP0 comes first.
const HEAD_BYTES = 64 * 1024

const SOI = 0xffd8
const APP1 = 0xffe1
// Standalone markers that carry no length field — hitting one means the
// segment walk is done.
const SOS = 0xffda
const EOI = 0xffd9

const TAG_EXIF_IFD = 0x8769 // pointer to the Exif sub-IFD
const TAG_DATE_TIME_ORIGINAL = 0x9003 // when the shutter fired
const TAG_DATE_TIME = 0x0132 // IFD0: last modified, the weaker fallback

/**
 * Reads the capture date from JPEG bytes, or null if there isn't one. Input is
 * untrusted, so every read is bounds-checked and any surprise reads as "no
 * date" rather than throwing.
 */
export function parseExifDate(buf: Buffer): Date | null {
  try {
    if (buf.length < 4 || buf.readUInt16BE(0) !== SOI) return null
    let p = 2
    while (p + 4 <= buf.length) {
      const marker = buf.readUInt16BE(p)
      // Lost sync (or reached image data) — nothing parseable ahead.
      if ((marker & 0xff00) !== 0xff00 || marker === SOS || marker === EOI) return null
      const len = buf.readUInt16BE(p + 2)
      if (len < 2) return null
      if (marker === APP1 && buf.toString("latin1", p + 4, p + 10) === "Exif\0\0")
        return readTiffDate(buf.subarray(p + 10, Math.min(p + 2 + len, buf.length)))
      p += 2 + len
    }
  } catch {
    // Truncated or malformed — treated the same as "no date".
  }
  return null
}

function readTiffDate(tiff: Buffer): Date | null {
  const byteOrder = tiff.toString("latin1", 0, 2)
  if (byteOrder !== "II" && byteOrder !== "MM") return null
  const le = byteOrder === "II"
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o))
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o))

  // Offsets in a TIFF header are all relative to the header's own start.
  const ifd0 = u32(4)

  // Each IFD entry is 12 bytes: tag(2) type(2) count(4) value-or-offset(4).
  // Values of 4 bytes or less sit inline in that last field; longer ones
  // (a 20-byte date string) put an offset there instead.
  const find = (ifd: number, tag: number): { count: number; value: number } | null => {
    if (ifd <= 0 || ifd + 2 > tiff.length) return null
    const entries = u16(ifd)
    for (let i = 0; i < entries; i++) {
      const e = ifd + 2 + i * 12
      if (e + 12 > tiff.length) return null
      if (u16(e) === tag) return { count: u32(e + 4), value: u32(e + 8) }
    }
    return null
  }

  const ascii = (hit: { count: number; value: number } | null): string | null => {
    if (!hit || hit.count === 0 || hit.count > 64) return null
    const end = hit.value + hit.count
    if (hit.value <= 0 || end > tiff.length) return null
    return tiff.toString("latin1", hit.value, end).replace(/\0.*$/s, "").trim()
  }

  const exifIfd = find(ifd0, TAG_EXIF_IFD)
  const original = exifIfd ? ascii(find(exifIfd.value, TAG_DATE_TIME_ORIGINAL)) : null
  return toDate(original) ?? toDate(ascii(find(ifd0, TAG_DATE_TIME)))
}

// EXIF timestamps are "YYYY:MM:DD HH:MM:SS" wall-clock with no zone attached.
// We keep that wall clock verbatim by reading it as UTC; clients render the
// timeline in UTC too, so a photo always lands on the day the camera said it
// did no matter where it's viewed from.
function toDate(s: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  const [, y, mo, d, h, mi, sec] = m
  const year = Number(y)
  // Cameras with a dead clock battery stamp 1980-01-01 and similar; anything
  // before photography-on-a-chip existed is junk, not a capture date.
  if (year < 1990) return null
  const t = Date.UTC(year, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec))
  if (Number.isNaN(t)) return null
  const dt = new Date(t)
  // Round-trip check catches out-of-range parts (month 13, day 32) that
  // Date.UTC would silently roll over into a different, wrong date.
  return dt.getUTCMonth() === Number(mo) - 1 && dt.getUTCDate() === Number(d) ? dt : null
}

/** Same, reading only the head of a stored file. Never throws. */
export async function readCaptureDate(absPath: string): Promise<Date | null> {
  let fh: fs.promises.FileHandle | null = null
  try {
    fh = await fs.promises.open(absPath, "r")
    const buf = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0)
    return parseExifDate(buf.subarray(0, bytesRead))
  } catch {
    return null
  } finally {
    await fh?.close().catch(() => {})
  }
}
