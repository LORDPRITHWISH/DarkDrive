// CommonJS (.cts) because Electron's sandboxed preloads can't be ES modules.
import { contextBridge, ipcRenderer } from "electron"
import type { Config } from "./main.js"

const api = {
  getConfig: (): Promise<Config> => ipcRenderer.invoke("config:get"),
  saveConfig: (cfg: Config): Promise<void> => ipcRenderer.invoke("config:save", cfg),
  getState: (): Promise<{ running: boolean; log: string[]; version: string; updateReady: string | null }> =>
    ipcRenderer.invoke("state:get"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  start: () => ipcRenderer.invoke("sync:start"),
  stop: () => ipcRenderer.invoke("sync:stop"),
  remoteFolders: (): Promise<{ id: string; path: string }[]> => ipcRenderer.invoke("remote:folders"),
  pickDir: (): Promise<string | null> => ipcRenderer.invoke("dir:pick"),
  openFolder: () => ipcRenderer.invoke("open:folder"),
  signIn: (cfg: Config): Promise<void> => ipcRenderer.invoke("sign-in", cfg),
  onLog: (fn: (line: string) => void) => ipcRenderer.on("log", (_e, line) => fn(line)),
  onRunning: (fn: (running: boolean) => void) => ipcRenderer.on("running", (_e, r) => fn(r)),
  onUpdate: (fn: (version: string) => void) => ipcRenderer.on("update", (_e, v) => fn(v)),
}
export type Api = typeof api

contextBridge.exposeInMainWorld("dd", api)
