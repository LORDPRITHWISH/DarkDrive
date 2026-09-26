// Preload for the app's windows (drive.ts): the web app's one door into the
// desktop app. The web app finds it as window.darkdriveDesktop and shows its
// desktop-only pages when it's there; apps/web/src/lib/desktop.ts is the
// contract, checked below. main.ts only answers the app's own pages.
//
// CommonJS (.cts) because Electron's sandboxed preloads can't be ES modules.
import { contextBridge, ipcRenderer } from "electron"
import type { Desktop } from "../../web/src/lib/desktop"

// invoke() rejects with "Error invoking remote method 'x': Error: <msg>"; the page wants <msg>.
const call = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(`desktop:${channel}`, ...args).catch((e: Error) => {
    throw new Error(e.message.replace(/^.*Error: /, ""))
  })

// Windows the app opens on the API (downloads) get this preload too; they get no bridge.
if (location.href.startsWith("darkdrive://app/"))
  contextBridge.exposeInMainWorld("darkdriveDesktop", {
    // Sync, so the web app has it before its first request.
    ...(ipcRenderer.sendSync("desktop:config") as { apiUrl: string; webUrl: string }),
    signIn: () => call("sign-in"),
    signOut: () => call("sign-out"),
    saveServer: (s) => call("save-server", s),
    getState: () => call("state"),
    onChange: (fn) => {
      const listener = () => fn()
      ipcRenderer.on("desktop:changed", listener)
      return () => void ipcRenderer.removeListener("desktop:changed", listener)
    },
    setSyncing: (on) => call("syncing", on),
    availableFolders: () => call("folders:available"),
    addLocalFolder: () => call("folders:add-local"),
    addRemoteFolder: (id) => call("folders:add-remote", id),
    removeFolder: (id) => call("folders:remove", id),
    openFolder: (id) => call("folders:open", id),
    installUpdate: () => call("update:install"),
  } satisfies Desktop)
