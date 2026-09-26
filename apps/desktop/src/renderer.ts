import type { Api } from "./preload.cjs"
import type { Account, SyncedFolder } from "./settings.js"

const dd = (window as unknown as { dd: Api }).dd
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const form = $<HTMLFormElement>("form")
const logEl = $<HTMLPreElement>("log")
const status = $("status")
const toggle = $<HTMLButtonElement>("toggle")
const error = $("error")
const update = $<HTMLButtonElement>("update")
const signin = $<HTMLButtonElement>("signin")
const addLocal = $<HTMLButtonElement>("add-local")
const addRemote = $<HTMLButtonElement>("add-remote")
const available = $("available")
let running = false

/** createElement with properties and children, for the rows built below. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]>,
  ...kids: (Node | string)[]
) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...kids)
  return e
}

function setRunning(r: boolean) {
  running = r
  status.textContent = r ? "Syncing" : "Paused"
  status.dataset.on = String(r)
  toggle.textContent = r ? "Pause" : "Resume"
}

function showUpdate(version: string) {
  update.textContent = `Restart to update to ${version}`
  update.hidden = false
}

function setSignedIn(yes: boolean) {
  $("account").textContent = yes ? "Signed in" : "Not signed in"
  signin.textContent = yes ? "Switch account" : "Sign in with Google"
  // One bright button at a time: sign in first, then add a folder.
  signin.className = yes ? "" : "primary"
  addLocal.className = yes ? "primary" : ""
  addLocal.disabled = addRemote.disabled = !yes
  $("drive").hidden = !yes
}

// ipcRenderer.invoke wraps the message as "Error invoking remote method ...: Error: <msg>".
const errMsg = (err: unknown) => String((err as Error).message).replace(/^.*Error: /, "")

/** Run a button's action with the button off meanwhile, showing any failure. */
async function act(button: HTMLButtonElement, fn: () => Promise<unknown>) {
  error.textContent = ""
  button.disabled = true
  try {
    await fn()
  } catch (err) {
    error.textContent = errMsg(err)
  }
  button.disabled = false
}

function renderFolders(folders: SyncedFolder[]) {
  $("folders").replaceChildren(
    ...folders.map((f) => {
      const remove: HTMLButtonElement = el("button", {
        type: "button",
        textContent: "Stop syncing",
        onclick: () =>
          confirm(`Stop syncing "${f.name}"?\n\nIts files stay on this computer and on DarkDrive.`) &&
          act(remove, async () => renderFolders(await dd.removeFolder(f.id))),
      })
      return el(
        "li",
        {},
        el("div", {}, el("strong", { textContent: f.name }), el("span", { className: "note", textContent: f.dir, title: f.dir })),
        el("button", { type: "button", textContent: "Open", onclick: () => dd.openFolder(f.id) }),
        remove
      )
    })
  )
  $("no-folders").hidden = folders.length > 0
  toggle.hidden = folders.length === 0
}

function append(line: string) {
  const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4
  logEl.textContent += line + "\n"
  if (stick) logEl.scrollTop = logEl.scrollHeight
}

const field = (name: keyof Account) => form.elements.namedItem(name) as HTMLInputElement
const formAccount = () => Object.fromEntries(new FormData(form)) as Account

const settings = await dd.getSettings()
for (const k of ["apiUrl", "webUrl", "token", "device"] as const) field(k).value = settings[k]
setSignedIn(!!settings.token)
renderFolders(settings.folders)

const state = await dd.getState()
setRunning(state.running)
$("version").textContent = `v${state.version}`
if (state.updateReady) showUpdate(state.updateReady)
state.log.forEach(append)
dd.onLog(append)
dd.onRunning(setRunning)
dd.onUpdate(showUpdate)
update.onclick = () => dd.installUpdate()
$("drive").onclick = () => dd.openDrive()
toggle.onclick = () => (running ? dd.stop() : dd.start())

addLocal.onclick = () => act(addLocal, async () => renderFolders(await dd.addLocalFolder()))
addRemote.onclick = () =>
  act(addRemote, async () => {
    const list = await dd.availableFolders()
    if (!list.length)
      throw new Error("Nothing to add: every folder in DarkDrive's Synced Folders is already on this computer.")
    available.replaceChildren(
      el("span", { className: "note", textContent: "Keep which one on this computer?" }),
      ...list.map((r) => {
        const pick: HTMLButtonElement = el("button", {
          type: "button",
          textContent: r.name,
          onclick: () =>
            act(pick, async () => {
              renderFolders(await dd.addRemoteFolder(r.id))
              available.replaceChildren()
            }),
        })
        return pick
      })
    )
  })

form.onsubmit = async (e) => {
  e.preventDefault()
  error.textContent = ""
  try {
    await dd.saveAccount(formAccount())
    setSignedIn(!!field("token").value)
  } catch (err) {
    error.textContent = errMsg(err)
  }
}
// Left clickable: if the tab got closed, clicking again just starts over. An
// older attempt still waits in main until it times out; its success is real
// (main saved the token), but its failure is stale news and ignored.
let attempts = 0
signin.onclick = async () => {
  const attempt = ++attempts
  error.textContent = ""
  $("hint").textContent = "Finish signing in in your browser…"
  try {
    await dd.signIn(formAccount())
    const saved = await dd.getSettings()
    field("token").value = saved.token
    setSignedIn(true)
    renderFolders(saved.folders)
  } catch (err) {
    if (attempt !== attempts) return
    error.textContent = errMsg(err)
  }
  $("hint").textContent = ""
}
