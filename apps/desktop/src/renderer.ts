import type { Api } from "./preload.cjs"
import type { Config } from "./main.js"

const dd = (window as unknown as { dd: Api }).dd
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const form = $<HTMLFormElement>("form")
const logEl = $<HTMLPreElement>("log")
const status = $("status")
const toggle = $<HTMLButtonElement>("toggle")
const error = $("error")
const update = $<HTMLButtonElement>("update")
const signin = $<HTMLButtonElement>("signin")
let running = false

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
  // One bright button at a time: signing in is the only step that matters first.
  signin.className = yes ? "" : "primary"
  $("save").className = yes ? "primary" : ""
}

// ipcRenderer.invoke wraps the message as "Error invoking remote method ...: Error: <msg>".
const errMsg = (err: unknown) => String((err as Error).message).replace(/^.*Error: /, "")
const formConfig = () => Object.fromEntries(new FormData(form)) as Config

function append(line: string) {
  const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4
  logEl.textContent += line + "\n"
  if (stick) logEl.scrollTop = logEl.scrollHeight
}

const field = (name: keyof Config) => form.elements.namedItem(name) as HTMLInputElement

const cfg = await dd.getConfig()
for (const k of Object.keys(cfg) as (keyof Config)[]) field(k).value = cfg[k]
setSignedIn(!!cfg.token)

const state = await dd.getState()
setRunning(state.running)
$("version").textContent = `v${state.version}`
if (state.updateReady) showUpdate(state.updateReady)
state.log.forEach(append)
dd.onLog(append)
dd.onRunning(setRunning)
dd.onUpdate(showUpdate)
update.onclick = () => dd.installUpdate()

form.onsubmit = async (e) => {
  e.preventDefault()
  error.textContent = ""
  try {
    await dd.saveConfig(formConfig())
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
    await dd.signIn(formConfig())
    field("token").value = (await dd.getConfig()).token
    setSignedIn(true)
  } catch (err) {
    if (attempt !== attempts) return
    error.textContent = errMsg(err)
  }
  $("hint").textContent = ""
}
toggle.onclick = () => (running ? dd.stop() : dd.start())
$("pick").onclick = async () => {
  const dir = await dd.pickDir()
  if (dir) field("dir").value = dir
}
$("open").onclick = () => dd.openFolder()
