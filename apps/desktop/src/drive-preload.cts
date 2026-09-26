// Preload for the drive window, which shows the hosted web app (drive.ts).
// This is the one door from that page into the desktop app: the web app looks
// for window.darkdriveDesktop to show desktop-only things. It runs for a
// remote page, so only ever put harmless actions here.
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("darkdriveDesktop", {
  openSyncSettings: () => ipcRenderer.send("sync-settings:open"),
})
