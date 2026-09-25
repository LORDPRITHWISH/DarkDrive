import crypto from "node:crypto"

// One-time codes for temporary sessions (routes/tempSessions.ts). No 0/O or
// 1/I/L: the code is read off one screen and typed into another.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// 10 chars of 31 ≈ 49 bits — out of reach for online guessing even before
// the claim endpoint's per-IP cap. Shown as "K7QM2-XP9RT"; the dash is
// cosmetic and normalizeTempCode drops it.
export function newTempCode(): string {
  const c = Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)])
  return `${c.slice(0, 5).join("")}-${c.slice(5).join("")}`
}

// Forgiving about how it was typed — case, spaces, dashes — so the hash of
// what the user entered matches the hash stored at creation.
export function normalizeTempCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
}
