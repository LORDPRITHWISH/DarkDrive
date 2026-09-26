// CommonJS (.cts) because Electron's sandboxed preloads can't be ES modules.
import { contextBridge, ipcRenderer } from "electron"
import type { Account, Settings, SyncedFolder } from "./settings.js"

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  saveAccount: (a: Account): Promise<void> => ipcRenderer.invoke("settings:save", a),
  signIn: (a: Account): Promise<void> => ipcRenderer.invoke("sign-in", a),
  getState: (): Promise<{ running: boolean; log: string[]; version: string; updateReady: string | null }> =>
    ipcRenderer.invoke("state:get"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  openDrive: () => ipcRenderer.invoke("drive:open"),
  start: () => ipcRenderer.invoke("sync:start"),
  stop: () => ipcRenderer.invoke("sync:stop"),
  // Each folder action returns the folder list as it stands afterwards.
  availableFolders: (): Promise<{ id: string; name: string }[]> => ipcRenderer.invoke("folders:available"),
  addLocalFolder: (): Promise<SyncedFolder[]> => ipcRenderer.invoke("folders:add-local"),
  addRemoteFolder: (id: string): Promise<SyncedFolder[]> => ipcRenderer.invoke("folders:add-remote", id),
  removeFolder: (id: string): Promise<SyncedFolder[]> => ipcRenderer.invoke("folders:remove", id),
  openFolder: (id: string) => ipcRenderer.invoke("folders:open", id),
  onLog: (fn: (line: string) => void) => ipcRenderer.on("log", (_e, line) => fn(line)),
  onRunning: (fn: (running: boolean) => void) => ipcRenderer.on("running", (_e, r) => fn(r)),
  onUpdate: (fn: (version: string) => void) => ipcRenderer.on("update", (_e, v) => fn(v)),
}
export type Api = typeof api

contextBridge.exposeInMainWorld("dd", api)
