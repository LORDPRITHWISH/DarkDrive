// What the desktop app keeps on disk, in desktop.json.
//
// Deliberately apart from the daemon's own config.json/state.json: each
// synced folder runs its own daemon with its own DD_HOME under folders/<id>/
// (see folders.ts), so a CLI run of the daemon can keep using the files up
// here without the two stepping on each other.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Same resolution as the daemon.
export const CONFIG_DIR = process.env.DD_HOME ?? path.join(os.homedir(), ".darkdrive")
export const FOLDERS_DIR = path.join(CONFIG_DIR, "folders")
const SETTINGS_FILE = path.join(CONFIG_DIR, "desktop.json")
const DEFAULT_API = "https://api.darkdrive.zenux.live"
const DEFAULT_WEB = "https://darkdrive.zenux.live"

/**
 * A folder on this computer kept in sync with one folder in DarkDrive's
 * "Synced Folders". `id` is that DarkDrive folder's id, `name` its name there.
 */
export type SyncedFolder = { id: string; name: string; dir: string }
// webUrl is where the web app for apiUrl is hosted: links meant for other
// people (shares, invites) point there. deviceId is the token's row on the
// server, so signing out can revoke it.
export type Account = { apiUrl: string; webUrl: string; token: string; deviceId: string; device: string }
export type Settings = Account & { folders: SyncedFolder[] }

function readJson(file: string): Partial<Settings> | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), "utf8"))
  } catch {
    return undefined
  }
}

export function readSettings(): Settings {
  // Before synced folders, the app kept its sign-in in the daemon's
  // config.json, so that still counts on first run. Its one folder doesn't
  // carry over: it was the whole drive or a My Drive folder, which is exactly
  // what the app no longer syncs.
  const saved = readJson("desktop.json") ?? readJson("config.json") ?? {}
  return {
    apiUrl: saved.apiUrl ?? DEFAULT_API,
    webUrl: saved.webUrl ?? DEFAULT_WEB,
    token: saved.token ?? "",
    deviceId: saved.deviceId ?? "",
    device: saved.device ?? os.hostname(),
    folders: saved.folders ?? [],
  }
}

export function httpUrl(s: string): string {
  const u = new URL(s)
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${s} isn't an http(s) URL`)
  return u.toString().replace(/\/+$/, "")
}

export function writeSettings(s: Settings) {
  const next: Settings = {
    apiUrl: httpUrl(String(s.apiUrl).trim()),
    webUrl: httpUrl(String(s.webUrl).trim()),
    token: String(s.token).trim(),
    deviceId: String(s.deviceId),
    device: String(s.device).trim() || os.hostname(),
    folders: s.folders,
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 })
}

export async function apiCall<T>(s: Account, method: string, route: string, body?: unknown): Promise<T> {
  const r = await fetch(httpUrl(s.apiUrl) + route, {
    method,
    headers: { Authorization: `Bearer ${s.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${method} ${route} -> ${r.status}`)
  return r.json() as Promise<T>
}
