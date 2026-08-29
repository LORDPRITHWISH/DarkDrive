// Run: npx tsx src/lib/exif.test.ts
import assert from "node:assert/strict"
import { parseExifDate } from "./exif.js"

// --- minimal EXIF-carrying JPEG builder ------------------------------------
// Builds the real byte layout (SOI · APP1 · "Exif\0\0" · TIFF · IFDs) so the
// parser is exercised against the structure it will actually meet, not a mock.
type Entry = { tag: number; type: number; count: number; value: number }

function tiff(opts: { le: boolean; dateTimeOriginal?: string; dateTime?: string }): Buffer {
  const { le } = opts
  const strings: Buffer[] = []
  // IFD0 (2 + n*12 + 4) starts at 8; the Exif sub-IFD follows it; string
  // payloads go last, since anything over 4 bytes is referenced by offset.
  const ifd0: Entry[] = []
  const exif: Entry[] = []
  const ifd0Size = (n: number) => 2 + n * 12 + 4
  const ifd0At = 8
  const exifAt = ifd0At + ifd0Size(opts.dateTimeOriginal ? 1 : 0) + (opts.dateTime ? 12 : 0)
  let strAt = exifAt + ifd0Size(opts.dateTimeOriginal ? 1 : 0)

  if (opts.dateTimeOriginal) {
    const s = Buffer.from(opts.dateTimeOriginal + "\0", "latin1")
    exif.push({ tag: 0x9003, type: 2, count: s.length, value: strAt })
    strings.push(s)
    ifd0.push({ tag: 0x8769, type: 4, count: 1, value: exifAt })
    strAt += s.length
  }
  if (opts.dateTime) {
    const s = Buffer.from(opts.dateTime + "\0", "latin1")
    ifd0.push({ tag: 0x0132, type: 2, count: s.length, value: strAt })
    strings.push(s)
    strAt += s.length
  }

  const buf = Buffer.alloc(strAt)
  const w16 = (o: number, v: number) => (le ? buf.writeUInt16LE(v, o) : buf.writeUInt16BE(v, o))
  const w32 = (o: number, v: number) => (le ? buf.writeUInt32LE(v, o) : buf.writeUInt32BE(v, o))

  buf.write(le ? "II" : "MM", 0, "latin1")
  w16(2, 42)
  w32(4, ifd0At)

  const writeIfd = (at: number, entries: Entry[]) => {
    w16(at, entries.length)
    entries.forEach((e, i) => {
      const o = at + 2 + i * 12
      w16(o, e.tag)
      w16(o + 2, e.type)
      w32(o + 4, e.count)
      w32(o + 8, e.value)
    })
    w32(at + 2 + entries.length * 12, 0) // no next IFD
  }
  writeIfd(ifd0At, ifd0)
  if (exif.length) writeIfd(exifAt, exif)
  let p = exifAt + ifd0Size(exif.length)
  for (const s of strings) {
    s.copy(buf, p)
    p += s.length
  }
  return buf
}

function jpeg(body: Buffer, { withApp0 = false } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]
  if (withApp0) {
    // A JFIF APP0 ahead of the EXIF segment — the common real-world layout,
    // and what makes the segment walk matter.
    const app0 = Buffer.alloc(18)
    app0.writeUInt16BE(0xffe0, 0)
    app0.writeUInt16BE(16, 2)
    app0.write("JFIF\0", 4, "latin1")
    parts.push(app0)
  }
  const head = Buffer.alloc(10)
  head.writeUInt16BE(0xffe1, 0)
  head.writeUInt16BE(2 + 6 + body.length, 2)
  head.write("Exif\0\0", 4, "latin1")
  parts.push(head, body, Buffer.from([0xff, 0xd9]))
  return Buffer.concat(parts)
}

// --- the actual checks ------------------------------------------------------

// DateTimeOriginal, both byte orders, read as the wall clock the camera wrote.
for (const le of [true, false]) {
  const got = parseExifDate(jpeg(tiff({ le, dateTimeOriginal: "2021:07:04 18:30:00" })))
  assert.equal(got?.toISOString(), "2021-07-04T18:30:00.000Z", `byte order le=${le}`)
}

// Segments before APP1 are walked past, not tripped over.
assert.equal(
  parseExifDate(jpeg(tiff({ le: true, dateTimeOriginal: "2019:12:31 23:59:59" }), { withApp0: true }))?.toISOString(),
  "2019-12-31T23:59:59.000Z"
)

// DateTimeOriginal wins over IFD0's weaker DateTime; DateTime alone still works.
assert.equal(
  parseExifDate(
    jpeg(tiff({ le: true, dateTimeOriginal: "2020:01:02 03:04:05", dateTime: "2023:11:11 11:11:11" }))
  )?.toISOString(),
  "2020-01-02T03:04:05.000Z"
)
assert.equal(
  parseExifDate(jpeg(tiff({ le: true, dateTime: "2023:11:11 11:11:11" })))?.toISOString(),
  "2023-11-11T11:11:11.000Z"
)

// Junk reads as "no date" instead of throwing or inventing one.
assert.equal(parseExifDate(Buffer.alloc(0)), null)
assert.equal(parseExifDate(Buffer.from("not a jpeg at all", "latin1")), null)
assert.equal(parseExifDate(jpeg(Buffer.from("MZ garbage", "latin1"))), null)
assert.equal(parseExifDate(jpeg(tiff({ le: true, dateTimeOriginal: "1980:01:01 00:00:00" }))), null) // dead clock battery
assert.equal(parseExifDate(jpeg(tiff({ le: true, dateTimeOriginal: "2021:13:45 99:99:99" }))), null) // impossible date
// Truncated mid-EXIF: the length field promises bytes that aren't there.
assert.equal(parseExifDate(jpeg(tiff({ le: true, dateTimeOriginal: "2021:07:04 18:30:00" })).subarray(0, 24)), null)

console.log("exif ok")
