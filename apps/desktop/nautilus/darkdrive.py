# DarkDrive in GNOME Files: right-click actions, and an emblem on everything
# in a synced folder saying how its sync is doing.
#
# The DarkDrive desktop app copies this into
# ~/.local/share/nautilus-python/extensions (apps/desktop/src/filemanager.ts) and
# keeps filemanager.json next to its settings, which is all this reads about the
# app: where it is, whether sync is paused, and each synced folder with its
# status. Per-file detail comes from what each folder's sync daemon last
# synced (folders/<id>/state.json). Actions go back to the app as arguments
# (handle() in main.ts). Needs python3-nautilus; Files loads it when it starts.
import json
import os
import subprocess

from gi.repository import GLib, GObject, Nautilus

HOME = os.environ.get("DD_HOME") or os.path.expanduser("~/.darkdrive")
STATUS = os.path.join(HOME, "filemanager.json")
EMBLEMS = {
    "synced": "emblem-default",
    "syncing": "emblem-synchronizing",
    "error": "emblem-important",
    # No emblem means "paused" in any icon theme; Files falls back to a plain
    # icon of the name it's given.
    "paused": "media-playback-pause",
}
POLL_SECONDS = 2


class Cached:
    """A JSON file, re-read only when it changes on disk."""

    def __init__(self, path, empty):
        self.path, self.empty = path, empty
        self.mtime, self.data = None, empty

    def changed(self):
        try:
            mtime = os.stat(self.path).st_mtime_ns
        except OSError:
            mtime = None
        if mtime == self.mtime:
            return False
        self.mtime = mtime
        try:
            with open(self.path, encoding="utf-8") as f:
                self.data = json.load(f)
        except (OSError, ValueError):
            self.data = self.empty
        return True

    def get(self):
        self.changed()
        return self.data


published = Cached(STATUS, {})
states = {}  # synced folder id -> its daemon's state.json


def state_of(folder_id):
    if folder_id not in states:
        path = os.path.join(HOME, "folders", folder_id, "state.json")
        states[folder_id] = Cached(path, {})
    return states[folder_id]


def app():
    """The app's executable, or None if it has been uninstalled since."""
    exe = published.get().get("exec")
    return exe if exe and os.path.exists(exe) else None


def folder_of(path):
    """The synced folder `path` is, or is in, and its path within it ("" for the folder)."""
    for f in published.get().get("folders", []):
        if path == f["dir"]:
            return f, ""
        if path.startswith(f["dir"] + os.sep):
            return f, os.path.relpath(path, f["dir"]).replace(os.sep, "/")
    return None, None


def overlaps(path):
    """Whether syncing `path` would nest one synced folder in another."""
    for f in published.get().get("folders", []):
        if (path + os.sep).startswith(f["dir"] + os.sep) or (f["dir"] + os.sep).startswith(path + os.sep):
            return True
    return False


def status_of(path):
    """synced / syncing / error / paused for a path in a synced folder, else None."""
    f, rel = folder_of(path)
    if f is None:
        return None
    if rel == "":
        return f["status"]
    state = state_of(f["id"]).get()
    if os.path.isdir(path):
        synced = rel in state.get("folders", {}).values()
    else:
        entry = state.get("files", {}).get(rel)
        try:
            st = os.stat(path)
        except OSError:
            return None
        # The daemon's own test for "unchanged since synced": size and mtime.
        # Its mtime is a JS float of milliseconds, hence the tolerance.
        synced = bool(entry) and entry["size"] == st.st_size and abs(entry["mtimeMs"] - st.st_mtime_ns / 1e6) < 1
    if synced:
        return "synced"
    # Waiting its turn. Whether that turn is coming is the folder's to say.
    return f["status"] if f["status"] in ("paused", "error") else "syncing"


def run(*args):
    exe = app()
    if exe:
        subprocess.Popen([exe, *args])


class DarkDrive(GObject.GObject, Nautilus.MenuProvider, Nautilus.InfoProvider):
    def __init__(self):
        super().__init__()
        # Files only asks for a file's emblem again when told it's stale, so
        # every file given one is remembered until its folder's sync moves.
        self.shown = []
        GLib.timeout_add_seconds(POLL_SECONDS, self.poll)

    def poll(self):
        stale = published.changed()
        for cached in states.values():
            stale = cached.changed() or stale
        if stale:
            shown, self.shown = self.shown, []
            for info in shown:
                info.invalidate_extension_info()
        return True

    def update_file_info(self, info):
        if info.get_uri_scheme() != "file":
            return
        status = status_of(info.get_location().get_path())
        if status:
            info.add_emblem(EMBLEMS[status])
            self.shown.append(info)

    def item(self, name, label, *args):
        it = Nautilus.MenuItem(name="DarkDrive::" + name, label=label)
        it.connect("activate", lambda _item: run(*args))
        return it

    def get_file_items(self, files):
        if not app() or any(f.get_uri_scheme() != "file" for f in files):
            return []
        paths = [f.get_location().get_path() for f in files]
        synced = [folder_of(p)[0] is not None for p in paths]
        if not any(synced):
            if all(os.path.isdir(p) and not overlaps(p) for p in paths):
                return [self.item("Sync", "Sync with DarkDrive", "--dd-sync", *paths)]
            return []
        if not all(synced):
            return []
        items = [self.item("Open", "Open in DarkDrive", "--dd-open", paths[0])] if len(paths) == 1 else []
        return items + [self.toggle()]

    def get_background_items(self, folder):
        if not app() or folder.get_uri_scheme() != "file":
            return []
        path = folder.get_location().get_path()
        if folder_of(path)[0] is None:
            return []
        return [self.item("OpenHere", "Open in DarkDrive", "--dd-open", path), self.toggle()]

    def toggle(self):
        label = "Resume DarkDrive sync" if published.get().get("paused") else "Pause DarkDrive sync"
        return self.item("Toggle", label, "--dd-toggle")
